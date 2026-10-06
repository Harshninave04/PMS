import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultRoleService, { RoleService } from "@/services/role.service";
import { RoleValidationError, sanitizeUpdateRoleDto } from "@/dto/role.dto";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { recordAudit } from "@/services/audit.service";

/**
 * Roles are a fixed set seeded for the hospital (Admin, Doctor, Nurse,
 * Receptionist, Pharmacist, Accountant). Admins can view them and adjust
 * each role's module permissions; roles are not created or deleted at runtime.
 */
export class RoleController {
    constructor(private roleService: RoleService = defaultRoleService) { }

    async getRoles(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.ROLE_VIEW, "Role");
            if (!authResult.isAuthorized) return authResult.response;

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

    async getRoleById(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.ROLE_VIEW, "Role");
            if (!authResult.isAuthorized) return authResult.response;

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

            const payload = await request.json() as Record<string, unknown>;
            const data = sanitizeUpdateRoleDto(payload);

            if (Object.keys(data).length === 0) {
                return NextResponse.json(
                    { success: false, message: "No writable fields supplied" },
                    { status: 400 }
                );
            }

            const role = await this.roleService.updateRole(new Types.ObjectId(id), data);

            await recordAudit(authResult.context, {
                action: "UPDATE",
                entity: "role",
                entityId: id,
                summary: `Permissions changed for role ${data.role ?? (role as unknown as { role?: string })?.role ?? id}`,
                changes: {
                    access: { after: data.access ?? null },
                },
            });

            return NextResponse.json(
                { success: true, message: "Role updated successfully", data: role },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };

            if (error instanceof RoleValidationError) {
                return NextResponse.json(
                    { success: false, message: err.message },
                    { status: 400 }
                );
            }

            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to update role" },
                { status: statusCode }
            );
        }
    }

    /**
     * Hands a role back to the code defaults so the boot-time reconciler
     * overwrites it again. This is deliberately a separate endpoint: `managedBy`
     * is not writable through the update payload, because silently reclaiming a
     * role on an unrelated edit would discard the operator's configuration.
     */
    async resetRole(request: NextRequest, id: string): Promise<NextResponse> {
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
                    { success: false, message: "You cannot reset the role you are signed in with" },
                    { status: 403 }
                );
            }

            const role = await this.roleService.resetRoleToCodeDefaults(new Types.ObjectId(id));

            if (!role) {
                return NextResponse.json(
                    { success: false, message: "Role not found" },
                    { status: 404 }
                );
            }

            await recordAudit(authResult.context, {
                action: "UPDATE",
                entity: "role",
                entityId: id,
                summary: `Role reset to code defaults`,
                metadata: { managedBy: "code" },
            });

            return NextResponse.json(
                { success: true, message: "Role will be restored to code defaults on next startup", data: role },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to reset role" },
                { status: statusCode }
            );
        }
    }
}

const roleController = new RoleController();
export default roleController;
