import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import roleHierarchyService, { RoleHierarchyService } from "@/services/role-hierarchy.service";
import Role from "@/models/role.model";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { IRole, IManagedRole } from "@/interfaces/role.interface";

function normalizeRoleId(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (value instanceof Types.ObjectId) return value.toString();
    const obj = value as {
        roleId?: { _id?: unknown } | unknown;
        targetRole?: { _id?: unknown } | unknown;
        role?: { _id?: unknown } | unknown;
        _id?: unknown;
    };
    const inner =
        (obj.roleId as { _id?: unknown })?._id ??
        obj.roleId ??
        (obj.targetRole as { _id?: unknown })?._id ??
        obj.targetRole ??
        (obj.role as { _id?: unknown })?._id ??
        obj.role ??
        obj._id ??
        value;
    return (inner ?? "").toString();
}

async function getManagedRolePermissions(parentRole: IRole, targetRoleId: string): Promise<string[]> {
    const parentId = typeof parentRole._id === "string" ? new Types.ObjectId(parentRole._id) : (parentRole._id as Types.ObjectId);
    const entries = await roleHierarchyService.getHierarchiesByParent(parentId);
    const match = entries.find((item) => normalizeRoleId(item.targetRole) === targetRoleId);
    if (match?.permissions) return match.permissions;

    return parentRole.managedRoles?.find((item: IManagedRole) => normalizeRoleId(item) === targetRoleId)?.permissions || [];
}

interface IHierarchyPayloadItem {
    targetRole?: unknown;
    roleId?: unknown;
    role?: unknown;
    permissions?: string[];
}

export class RoleHierarchyController {
    constructor(private service: RoleHierarchyService = roleHierarchyService) { }

    async getHierarchies(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.ROLE_HIERARCHY_VIEW, "RoleHierarchy");
            if (!authResult.isAuthorized) return authResult.response;

            const { searchParams } = new URL(request.url);
            const parentRole = searchParams.get("parentRole");

            if (parentRole) {
                if (!Types.ObjectId.isValid(parentRole)) {
                    return NextResponse.json(
                        { success: false, message: "Invalid parentRole ID" },
                        { status: 400 }
                    );
                }
                const items = await this.service.getHierarchiesByParent(new Types.ObjectId(parentRole));
                return NextResponse.json({ success: true, count: items.length, data: items }, { status: 200 });
            }

            const all = await this.service.getAllHierarchies();
            return NextResponse.json({ success: true, count: all.length, data: all }, { status: 200 });
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to fetch role hierarchies" },
                { status: 500 }
            );
        }
    }

    async setHierarchies(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.ROLE_HIERARCHY_UPDATE, "RoleHierarchy");
            if (!authResult.isAuthorized) return authResult.response;

            const body = await request.json();
            const { parentRole, hierarchies } = body as { parentRole?: string; hierarchies?: IHierarchyPayloadItem[] };

            if (!parentRole || !Types.ObjectId.isValid(parentRole)) {
                return NextResponse.json(
                    { success: false, message: "Valid parentRole ID is required" },
                    { status: 400 }
                );
            }

            if (!Array.isArray(hierarchies)) {
                return NextResponse.json(
                    { success: false, message: "hierarchies array is required" },
                    { status: 400 }
                );
            }

            const { context } = authResult;
            const modifierRole = await Role.findById(context.roleId);
            if (!modifierRole) {
                return NextResponse.json({ success: false, message: "Current user role not found" }, { status: 403 });
            }

            if (modifierRole.role !== "SYSTEM_SUPER_ADMIN") {
                const parentRolePermissions = await getManagedRolePermissions(modifierRole, parentRole);
                if (!parentRolePermissions.includes("role.update") && !parentRolePermissions.includes("role.assign")) {
                    return NextResponse.json(
                        { success: false, message: "You do not have permission to update this role hierarchy" },
                        { status: 403 }
                    );
                }

                for (const item of hierarchies) {
                    const targetId = normalizeRoleId(item);
                    if (!Types.ObjectId.isValid(targetId)) {
                        return NextResponse.json(
                            { success: false, message: `Invalid target role: ${targetId}` },
                            { status: 400 }
                        );
                    }

                    const matchingPermissions = await getManagedRolePermissions(modifierRole, targetId);
                    if (matchingPermissions.length === 0) {
                        return NextResponse.json(
                            { success: false, message: `You do not have permission to manage role: ${targetId}` },
                            { status: 403 }
                        );
                    }
                    for (const p of item.permissions || []) {
                        if (!matchingPermissions.includes(p)) {
                            return NextResponse.json(
                                { success: false, message: `You cannot grant ${p} permission for role: ${targetId}` },
                                { status: 403 }
                            );
                        }
                    }
                }
            }

            const result = await this.service.setHierarchies(
                new Types.ObjectId(parentRole),
                hierarchies.map((h) => ({
                    targetRole: new Types.ObjectId(normalizeRoleId(h)),
                    permissions: h.permissions || [],
                }))
            );

            return NextResponse.json(
                { success: true, message: "Role hierarchies updated successfully", data: result },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to update role hierarchies" },
                { status: 500 }
            );
        }
    }
}

const roleHierarchyController = new RoleHierarchyController();
export default roleHierarchyController;
