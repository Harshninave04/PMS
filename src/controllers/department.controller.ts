import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultDepartmentService, { DepartmentService } from "@/services/department.service";
import { CreateDepartmentDto, UpdateDepartmentDto } from "@/dto/department.dto";
import Organization from "@/models/organization.model";
import Doctor from "@/models/doctor.model";
import Staff from "@/models/staff.model";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

interface IDepartmentEnriched {
    _id: Types.ObjectId | string;
    name: string;
    code: string;
    organizationId?: Types.ObjectId | { _id?: Types.ObjectId | string } | string;
    headOfDepartment?: Types.ObjectId;
    location?: string;
    phoneExtension?: string;
    description?: string;
    isActive: boolean;
    doctorCount?: number;
    staffCount?: number;
}

export class DepartmentController {
    constructor(private departmentService: DepartmentService = defaultDepartmentService) { }

    async createDepartment(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.DEPARTMENT_CREATE, "Department");
            if (!authResult.isAuthorized) return authResult.response;

            const data: CreateDepartmentDto = await request.json();

            if (!data.code || !data.name) {
                return NextResponse.json(
                    { success: false, message: "Department Name and Code are required" },
                    { status: 400 }
                );
            }

            // Ensure organizationId exists or auto-resolve from context or system default
            if (!data.organizationId || !Types.ObjectId.isValid(data.organizationId)) {
                if (authResult.context.branchId) {
                    data.organizationId = authResult.context.branchId;
                } else if (authResult.context.organizationId) {
                    data.organizationId = authResult.context.organizationId;
                } else {
                    let org = await Organization.findOne();
                    if (!org) {
                        org = await Organization.create({
                            organizationName: "Medistra Central Hospital",
                            organizationId: "ORG-001",
                            organizationType: "HOSPITAL",
                            branchType: "MAIN",
                            isActive: true
                        });
                    }
                    data.organizationId = org._id;
                }
            }

            const department = await this.departmentService.createDepartment(data);

            return NextResponse.json(
                { success: true, message: "Department created successfully", data: department },
                { status: 201 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to create department" },
                { status: statusCode }
            );
        }
    }

    async getDepartments(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.DEPARTMENT_VIEW, "Department");
            if (!authResult.isAuthorized) return authResult.response;

            const { searchParams } = new URL(request.url);
            const organizationId = searchParams.get("organizationId");
            const search = searchParams.get("search")?.toLowerCase().trim();

            let departments = await this.departmentService.getAllDepartments();

            // Apply RBAC scope filter
            const { filter } = authResult;
            if (filter.organizationId) {
                const targetOrgId = filter.organizationId.toString();
                departments = departments.filter((d) => {
                    const orgVal = d.organizationId ? ((d.organizationId as { _id?: unknown })?._id ?? d.organizationId).toString() : "";
                    return orgVal === targetOrgId;
                });
            } else if (organizationId && Types.ObjectId.isValid(organizationId)) {
                departments = departments.filter((d) => {
                    const orgVal = d.organizationId ? ((d.organizationId as { _id?: unknown })?._id ?? d.organizationId).toString() : "";
                    return orgVal === organizationId;
                });
            }

            const allDoctors = await Doctor.find().lean();
            const allStaff = await Staff.find().lean();

            let enriched: IDepartmentEnriched[] = departments.map((dept) => {
                const deptIdStr = dept._id.toString();
                const docCount = allDoctors.filter((doc) => {
                    const docDept = doc.departmentId ? ((doc.departmentId as { _id?: unknown })?._id ?? doc.departmentId).toString() : "";
                    return docDept === deptIdStr;
                }).length;
                const staffCount = allStaff.filter((st) => {
                    const stDept = st.departmentId ? ((st.departmentId as { _id?: unknown })?._id ?? st.departmentId).toString() : "";
                    return stDept === deptIdStr;
                }).length;

                const deptObj = dept.toObject ? dept.toObject() : { ...dept };
                return {
                    ...deptObj,
                    doctorCount: docCount,
                    staffCount: staffCount,
                };
            });

            if (search) {
                enriched = enriched.filter((dept) => {
                    return (
                        dept.name?.toLowerCase().includes(search) ||
                        dept.code?.toLowerCase().includes(search) ||
                        dept.location?.toLowerCase().includes(search) ||
                        dept.description?.toLowerCase().includes(search)
                    );
                });
            }

            return NextResponse.json(
                { success: true, count: enriched.length, data: enriched },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to fetch departments" },
                { status: 500 }
            );
        }
    }

    async getDepartmentById(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            if (request) {
                const authResult = await authorizeRequest(request, PERMISSION_KEYS.DEPARTMENT_VIEW, "Department");
                if (!authResult.isAuthorized) return authResult.response;
            }

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid department ID" },
                    { status: 400 }
                );
            }

            const department = await this.departmentService.getDepartmentById(new Types.ObjectId(id));
            if (!department) {
                return NextResponse.json(
                    { success: false, message: "Department not found" },
                    { status: 404 }
                );
            }

            return NextResponse.json(
                { success: true, data: department },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to fetch department" },
                { status: 500 }
            );
        }
    }

    async updateDepartment(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.DEPARTMENT_UPDATE, "Department");
            if (!authResult.isAuthorized) return authResult.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid department ID" },
                    { status: 400 }
                );
            }

            const data: UpdateDepartmentDto = await request.json();

            if (data.organizationId && !Types.ObjectId.isValid(data.organizationId)) {
                return NextResponse.json(
                    { success: false, message: "Invalid organization ID format" },
                    { status: 400 }
                );
            }

            const department = await this.departmentService.updateDepartment(new Types.ObjectId(id), data);

            return NextResponse.json(
                { success: true, message: "Department updated successfully", data: department },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to update department" },
                { status: statusCode }
            );
        }
    }

    async deleteDepartment(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            if (request) {
                const authResult = await authorizeRequest(request, PERMISSION_KEYS.DEPARTMENT_DELETE, "Department");
                if (!authResult.isAuthorized) return authResult.response;
            }

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid department ID" },
                    { status: 400 }
                );
            }

            await this.departmentService.deleteDepartment(new Types.ObjectId(id));

            return NextResponse.json(
                { success: true, message: "Department deleted successfully" },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to delete department" },
                { status: statusCode }
            );
        }
    }
}

const departmentController = new DepartmentController();
export default departmentController;
