import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultRoleService, { RoleService } from "@/services/role.service";
import { UpdateRoleDto } from "@/dto/role.dto";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

/**
 * Roles are a fixed set seeded for the hospital (Admin, Doctor, Nurse,
 * Receptionist, Pharmacist, Accountant). Admins can view them and adjust
 * each role's module permissions; roles are not created or deleted at runtime.
 */
export class RoleController {
    constructor(private roleService: RoleService = defaultRoleService) { }

    async getRoles(request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            if (request) {
                const authResult = await authorizeRequest(request, PERMISSION_KEYS.ROLE_VIEW, "Role");
                if (!authResult.isAuthorized) return authResult.response;
            }

            const roles = await this.roleService.getAllRoles();

            return NextResponse.json(
                { success: true, count: roles.length, data: roles },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to fetch roles" },
                { status: 500 }
            );
        }
    }

    async getRoleById(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            if (request) {
                const authResult = await authorizeRequest(request, PERMISSION_KEYS.ROLE_VIEW, "Role");
                if (!authResult.isAuthorized) return authResult.response;
            }

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid role ID" },
                    { status: 400 }
                );
            }

            const role = await this.roleService.getRoleById(new Types.ObjectId(id));
            if (!role) {
                return NextResponse.json(
                    { success: false, message: "Role not found" },
                    { status: 404 }
                );
            }

            return NextResponse.json(
                { success: true, data: role },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to fetch role" },
                { status: 500 }
            );
        }
    }

    async updateRole(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.ROLE_UPDATE, "Role");
            if (!authResult.isAuthorized) return authResult.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid role ID" },
                    { status: 400 }
                );
            }

            if (authResult.context.roleId.toString() === id) {
                return NextResponse.json(
                    { success: false, message: "You cannot change the permissions of your own role" },
                    { status: 403 }
                );
            }

            const data: UpdateRoleDto = await request.json();
            const role = await this.roleService.updateRole(new Types.ObjectId(id), data);

            return NextResponse.json(
                { success: true, message: "Role updated successfully", data: role },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to update role" },
                { status: statusCode }
            );
        }
    }
}

const roleController = new RoleController();
export default roleController;
