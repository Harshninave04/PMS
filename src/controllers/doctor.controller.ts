import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultDoctorService, { DoctorService } from "@/services/doctor.service";
import { CreateDoctorDto, UpdateDoctorDto } from "@/dto/doctor.dto";
import User from "@/models/user.model";
import Role from "@/models/role.model";
import bcrypt from "bcryptjs";
import { authorizeRequest } from "@/lib/rbac/guard";
import { buildScopedQuery, documentMatchesScope } from "@/lib/rbac/scope-filter";
import { PERMISSION_KEYS } from "@/types/rbac";

export class DoctorController {
    constructor(private doctorService: DoctorService = defaultDoctorService) { }

    /**
     * Verifies that a specific doctor record falls inside the caller's
     * authorization scope. Returns false for a missing record, an unsatisfiable
     * (deny-all) scope, or a record that belongs to another branch.
     */
    private async assertDoctorInScope(
        id: Types.ObjectId,
        scopeFilter: Record<string, unknown>
    ): Promise<boolean> {
        return await documentMatchesScope(
            await this.doctorService.getDoctorById(id),
            scopeFilter
        );
    }

    async createDoctor(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.DOCTOR_CREATE, "Doctor");
            if (!authResult.isAuthorized) return authResult.response;

            const body = await request.json();

            let userId = body.userId;

            // If user information is provided directly, find or create the User
            if (!userId && body.email && body.name) {
                let existingUser = await User.findOne({ email: body.email.toLowerCase().trim() });
                if (!existingUser) {
                    let doctorRole = await Role.findOne({ role: "DOCTOR" });
                    if (!doctorRole) {
                        doctorRole = await Role.create({
                            role: "DOCTOR",
                            access: []
                        });
                    }
                    const hashedPassword = await bcrypt.hash(body.password || "doctor123", 10);
                    existingUser = await User.create({
                        name: body.name.trim(),
                        email: body.email.toLowerCase().trim(),
                        password: hashedPassword,
                        gender: body.gender || "OTHER",
                        phone: body.phone,
                        role: doctorRole._id,
                        // Provision the account into the creator's tenant so
                        // BRANCH-scoped grants resolve for the new doctor.
                        organization: authResult.context.organizationId,
                        branch: authResult.context.branchId,
                        isActive: true
                    });
                }
                userId = existingUser._id.toString();
            }

            if (!userId || !body.departmentId || !body.licenseNo) {
                return NextResponse.json(
                    { success: false, message: "Doctor Name/User, Department, and License No. are required" },
                    { status: 400 }
                );
            }

            if (!Types.ObjectId.isValid(userId)) {
                return NextResponse.json(
                    { success: false, message: "Invalid user ID format" },
                    { status: 400 }
                );
            }

            if (!Types.ObjectId.isValid(body.departmentId)) {
                return NextResponse.json(
                    { success: false, message: "Invalid department ID format" },
                    { status: 400 }
                );
            }

            const doctorData: CreateDoctorDto = {
                userId,
                departmentId: body.departmentId,
                licenseNo: body.licenseNo.trim(),
                specialization: body.specialization?.trim() || "",
                qualification: body.qualification?.trim() || "",
                experienceYears: Number(body.experienceYears) || 0,
                consultationFee: Number(body.consultationFee) || 0,
                roomNumber: body.roomNumber?.trim() || "",
                bio: body.bio?.trim() || "",
                phone: body.phone?.trim() || "",
                status: body.status || "ACTIVE"
            };

            // Tenant scope is inherited from the linked user so that a
            // BRANCH-scoped reader can always see the doctor. The caller's own
            // branch is the fallback when the user has none, which keeps the
            // record inside the creator's jurisdiction.
            const linkedUser = await User.findById(userId).select("_id organization branch").lean();
            doctorData.branchId = linkedUser?.branch ?? authResult.context.branchId;
            doctorData.organizationId = linkedUser?.organization ?? authResult.context.organizationId ?? doctorData.branchId;

            const doctor = await this.doctorService.createDoctor(doctorData);

            return NextResponse.json(
                { success: true, message: "Doctor created successfully", data: doctor },
                { status: 201 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to create doctor" },
                { status: statusCode }
            );
        }
    }

    async getDoctors(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.DOCTOR_VIEW, "Doctor");
            if (!authResult.isAuthorized) return authResult.response;

            const { searchParams } = new URL(request.url);
            const departmentId = searchParams.get("departmentId");
            const search = searchParams.get("search")?.toLowerCase().trim();

            // The authorization filter is the complete organizational +
            // relational boundary. It is merged into the Mongo query rather
            // than inspected field-by-field, so a BRANCH or DEPARTMENT scope
            // can never be partially applied.
            const scoped = buildScopedQuery(authResult.filter);
            if (scoped.denied) {
                return NextResponse.json(
                    { success: true, count: 0, data: [], scope: "denied" },
                    { status: 200 }
                );
            }

            // A caller-supplied departmentId may only narrow the scope further,
            // never widen it.
            const query: Record<string, unknown> = { ...scoped.query };
            if (departmentId && Types.ObjectId.isValid(departmentId)) {
                query.departmentId = new Types.ObjectId(departmentId);
            }

            let doctors = await this.doctorService.getAllDoctors(query);

            if (search) {
                doctors = doctors.filter((d) => {
                    const userObj = d.userId as { name?: string; email?: string } | undefined;
                    const deptObj = d.departmentId as { name?: string } | undefined;
                    const name = userObj?.name?.toLowerCase() || "";
                    const email = userObj?.email?.toLowerCase() || "";
                    const spec = d.specialization?.toLowerCase() || "";
                    const lic = d.licenseNo?.toLowerCase() || "";
                    const dept = deptObj?.name?.toLowerCase() || "";
                    return name.includes(search) || email.includes(search) || spec.includes(search) || lic.includes(search) || dept.includes(search);
                });
            }

            return NextResponse.json(
                { success: true, count: doctors.length, data: doctors },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to fetch doctors" },
                { status: 500 }
            );
        }
    }

    async getDoctorById(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            let scopeFilter: Record<string, unknown> | undefined;
            if (request) {
                const authResult = await authorizeRequest(request, PERMISSION_KEYS.DOCTOR_VIEW, "Doctor");
                if (!authResult.isAuthorized) return authResult.response;
                scopeFilter = authResult.filter;
            }

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid doctor ID" },
                    { status: 400 }
                );
            }

            // Fetched through the same scope filter as the list endpoint, so a
            // doctor outside the caller's branch resolves to 404 rather than
            // being returned.
            const doctor = await this.doctorService.getDoctorById(new Types.ObjectId(id), scopeFilter);
            if (!doctor) {
                return NextResponse.json(
                    { success: false, message: "Doctor not found" },
                    { status: 404 }
                );
            }

            return NextResponse.json(
                { success: true, data: doctor },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to fetch doctor" },
                { status: 500 }
            );
        }
    }

    async updateDoctor(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.DOCTOR_UPDATE, "Doctor");
            if (!authResult.isAuthorized) return authResult.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid doctor ID" },
                    { status: 400 }
                );
            }

            const body = await request.json();

            if (body.userId && !Types.ObjectId.isValid(body.userId)) {
                return NextResponse.json(
                    { success: false, message: "Invalid user ID format" },
                    { status: 400 }
                );
            }

            if (body.departmentId && !Types.ObjectId.isValid(body.departmentId)) {
                return NextResponse.json(
                    { success: false, message: "Invalid department ID format" },
                    { status: 400 }
                );
            }

            // A caller must not be able to mutate a record outside its scope
            // even though it holds the update permission.
            if (!(await this.assertDoctorInScope(new Types.ObjectId(id), authResult.filter))) {
                return NextResponse.json(
                    { success: false, message: "Doctor not found" },
                    { status: 404 }
                );
            }

            const doctor = await this.doctorService.updateDoctor(new Types.ObjectId(id), body as UpdateDoctorDto);

            // Also update linked user profile if doctor has userId
            if (doctor && doctor.userId) {
                const userUpdate: { name?: string; phone?: string; isActive?: boolean } = {};
                if (body.name) userUpdate.name = (body.name as string).trim();
                if (body.phone) userUpdate.phone = (body.phone as string).trim();
                if (typeof body.isActive === "boolean") userUpdate.isActive = body.isActive;
                if (Object.keys(userUpdate).length > 0) {
                    const uId = (doctor.userId as { _id?: Types.ObjectId })._id || (doctor.userId as Types.ObjectId);
                    await User.findByIdAndUpdate(uId, userUpdate);
                }
            }

            return NextResponse.json(
                { success: true, message: "Doctor updated successfully", data: doctor },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to update doctor" },
                { status: statusCode }
            );
        }
    }

    async deleteDoctor(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            let scopeFilter: Record<string, unknown> | undefined;
            if (request) {
                const authResult = await authorizeRequest(request, PERMISSION_KEYS.DOCTOR_DELETE, "Doctor");
                if (!authResult.isAuthorized) return authResult.response;
                scopeFilter = authResult.filter;
            }

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid doctor ID" },
                    { status: 400 }
                );
            }

            if (scopeFilter && !(await this.assertDoctorInScope(new Types.ObjectId(id), scopeFilter))) {
                return NextResponse.json(
                    { success: false, message: "Doctor not found" },
                    { status: 404 }
                );
            }

            await this.doctorService.deleteDoctor(new Types.ObjectId(id));

            return NextResponse.json(
                { success: true, message: "Doctor deleted successfully" },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to delete doctor" },
                { status: statusCode }
            );
        }
    }
}

const doctorController = new DoctorController();
export default doctorController;
