import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultRoleService, { RoleService } from "@/services/role.service";
import { CreateRoleDto, UpdateRoleDto } from "@/dto/role.dto";
import Role from "@/models/role.model";
import roleHierarchyRepository from "@/repositories/role-hierarchy.repository";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { IRole, IManagedRole, IAccess } from "@/interfaces/role.interface";

const ROLE_PERMISSIONS: string[] = [];
type RolePermission = string;

function normalizeRoleId(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (value instanceof Types.ObjectId) return value.toString();
    const obj = value as {
        roleId?: { _id?: unknown } | unknown;
        targetRole?: { _id?: unknown } | unknown;
        role?: { _id?: unknown } | unknown;
        buffer?: { data?: number[] };
        _id?: unknown;
    };
    if (obj.buffer && Array.isArray(obj.buffer.data)) {
        return new Types.ObjectId(Buffer.from(obj.buffer.data)).toString();
    }
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

async function getManagedRolePermissions(parentRole: IRole, targetRoleId: string): Promise<RolePermission[]> {
    const parentId = typeof parentRole._id === "string" ? new Types.ObjectId(parentRole._id) : (parentRole._id as Types.ObjectId);
    const hierarchy = await roleHierarchyRepository.findByParentAndTarget(
        parentId,
        new Types.ObjectId(targetRoleId)
    );

    if (hierarchy?.permissions) {
        return hierarchy.permissions as RolePermission[];
    }

    const legacy = parentRole.managedRoles?.find((item: IManagedRole) => normalizeRoleId(item) === targetRoleId);
    return (legacy?.permissions || []) as RolePermission[];
}

export class RoleController {
    constructor(private roleService: RoleService = defaultRoleService) { }

    async createRole(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.ROLE_CREATE, "Role");
            if (!authResult.isAuthorized) return authResult.response;

            const data: CreateRoleDto = await request.json();

            if (!data.role || !data.access || !Array.isArray(data.access)) {
                return NextResponse.json(
                    { success: false, message: "Fields 'role' and 'access' are required" },
                    { status: 400 }
                );
            }

            const { context } = authResult;
            const creatorRole = await Role.findById(context.roleId);
            if (!creatorRole) {
                return NextResponse.json({ success: false, message: "Current user role not found" }, { status: 403 });
            }

            if (creatorRole.role !== "SYSTEM_SUPER_ADMIN") {
                // 1. Verify Module Access (cannot grant permissions higher than own)
                for (const reqAccess of data.access) {
                    const creatorAccess = creatorRole.access?.find((a: IAccess) => a.moduleName === reqAccess.moduleName);
                    if (!creatorAccess) {
                        return NextResponse.json({ success: false, message: `You do not have access to module: ${reqAccess.moduleName}` }, { status: 403 });
                    }
                    for (const p of reqAccess.permissions) {
                        if (!creatorAccess.permissions.includes(p)) {
                            return NextResponse.json({ success: false, message: `You cannot grant ${p} permission for module: ${reqAccess.moduleName}` }, { status: 403 });
                        }
                    }
                }

                // 2. Verify Managed Roles Access
                if (data.managedRoles && Array.isArray(data.managedRoles)) {
                    for (const reqManaged of data.managedRoles) {
                        const reqId = normalizeRoleId(reqManaged);
                        if (!Types.ObjectId.isValid(reqId)) {
                            return NextResponse.json({ success: false, message: `Invalid managed role ID: ${reqId}` }, { status: 400 });
                        }

                        const creatorPermissions = await getManagedRolePermissions(creatorRole, reqId);
                        if (creatorPermissions.length === 0) {
                            return NextResponse.json({ success: false, message: `You do not have permission to manage role ID: ${reqId}` }, { status: 403 });
                        }
                        for (const p of reqManaged.permissions) {
                            if (!creatorPermissions.includes(p as RolePermission)) {
                                return NextResponse.json({ success: false, message: `You cannot grant ${p} permission for managed role ID: ${reqId}` }, { status: 403 });
                            }
                        }
                    }
                }
            }

            const role = await this.roleService.createRole(data);

            // Sync to dedicated RoleHierarchy table
            if (data.managedRoles && Array.isArray(data.managedRoles)) {
                await roleHierarchyRepository.setHierarchiesForParent(
                    role._id as Types.ObjectId,
                    data.managedRoles.map((m) => ({
                        targetRole: normalizeRoleId(m),
                        permissions: m.permissions,
                    }))
                );
            }

            const superAdminRole = await Role.findOne({ role: "SYSTEM_SUPER_ADMIN" });
            if (superAdminRole) {
                await roleHierarchyRepository.upsertHierarchy(
                    superAdminRole._id as Types.ObjectId,
                    role._id as Types.ObjectId,
                    [...ROLE_PERMISSIONS]
                );
            }

            if (creatorRole.role !== "SYSTEM_SUPER_ADMIN") {
                await roleHierarchyRepository.upsertHierarchy(
                    creatorRole._id as Types.ObjectId,
                    role._id as Types.ObjectId,
                    [...ROLE_PERMISSIONS]
                );
            }

            return NextResponse.json(
                { success: true, message: "Role created successfully", data: role },
                { status: 201 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to create role" },
                { status: statusCode }
            );
        }
    }

    async getRoles(request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            let currentUserRoleId: string | null = null;
            if (request) {
                const authResult = await authorizeRequest(request, PERMISSION_KEYS.ROLE_VIEW, "Role");
                if (!authResult.isAuthorized) return authResult.response;
                currentUserRoleId = authResult.context.roleId ? authResult.context.roleId.toString() : null;
            }

            let roles = await this.roleService.getAllRoles();

            if (currentUserRoleId && Types.ObjectId.isValid(currentUserRoleId)) {
                const currentUserRole = await Role.findById(currentUserRoleId);
                if (currentUserRole && currentUserRole.role !== "SYSTEM_SUPER_ADMIN") {
                    let reqPerm: string | null = null;
                    let managedOnly = false;

                    if (request?.url) {
                        try {
                            const { searchParams } = new URL(request.url);
                            reqPerm = searchParams.get("permission") || searchParams.get("action");
                            managedOnly = searchParams.get("managedOnly") === "true";
                        } catch {
                            // URL parsing fallback
                        }
                    }

                    if (reqPerm || managedOnly) {
                        const hierarchies = await roleHierarchyRepository.findByParentRole(currentUserRole._id as Types.ObjectId);
                        const hierarchyIds = hierarchies
                            .filter((h) => !reqPerm || h.permissions?.includes(reqPerm.toUpperCase()))
                            .map((h) => normalizeRoleId(h.targetRole));

                        const legacyIds = currentUserRole.managedRoles
                            ?.filter((mr: IManagedRole) => !reqPerm || mr.permissions?.includes(reqPerm.toUpperCase()))
                            ?.map((mr: IManagedRole) => normalizeRoleId(mr.roleId)) || [];

                        const managedRoleIds = Array.from(new Set([...hierarchyIds, ...legacyIds]));
                        roles = roles.filter((r) => managedRoleIds.includes(r._id.toString()));
                    } else {
                        roles = roles.filter((r) => r.role !== "SYSTEM_SUPER_ADMIN");
                    }
                }
            }

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

            const hierarchies = await roleHierarchyRepository.findByParentRole(new Types.ObjectId(id));
            const roleObj = role.toObject ? role.toObject() : { ...role };

            if (role.role === "SYSTEM_SUPER_ADMIN") {
                const allRoles = await this.roleService.getAllRoles();
                roleObj.managedRoles = allRoles
                    .filter((r) => r._id.toString() !== id.toString())
                    .map((r) => ({
                        roleId: r,
                        permissions: ["role.assign", "role.create", "role.update", "role.delete"]
                    }));
            } else if (hierarchies && hierarchies.length > 0) {
                roleObj.managedRoles = hierarchies.map((h) => ({
                    roleId: h.targetRole,
                    permissions: h.permissions,
                }));
            }

            return NextResponse.json(
                { success: true, data: roleObj },
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

            const data: UpdateRoleDto = await request.json();

            const { context } = authResult;
            const modifierRole = await Role.findById(context.roleId);
            if (!modifierRole) {
                return NextResponse.json({ success: false, message: "Current user role not found" }, { status: 403 });
            }

            if (modifierRole.role !== "SYSTEM_SUPER_ADMIN") {
                const modifierPermissionsForRole = await getManagedRolePermissions(modifierRole, id);
                if (!modifierPermissionsForRole.includes("role.update") && !modifierPermissionsForRole.includes("role.assign")) {
                    return NextResponse.json(
                        { success: false, message: "You do not have permission to update this role" },
                        { status: 403 }
                    );
                }

                if (data.access && Array.isArray(data.access)) {
                    for (const reqAccess of data.access) {
                        const modifierAccess = modifierRole.access?.find((a: IAccess) => a.moduleName === reqAccess.moduleName);
                        if (!modifierAccess) {
                            return NextResponse.json({ success: false, message: `You do not have access to module: ${reqAccess.moduleName}` }, { status: 403 });
                        }
                        for (const p of reqAccess.permissions) {
                            if (!modifierAccess.permissions.includes(p)) {
                                return NextResponse.json({ success: false, message: `You cannot grant ${p} permission for module: ${reqAccess.moduleName}` }, { status: 403 });
                            }
                        }
                    }
                }

                if (data.managedRoles && Array.isArray(data.managedRoles)) {
                    for (const reqManaged of data.managedRoles) {
                        const reqId = normalizeRoleId(reqManaged);
                        if (!Types.ObjectId.isValid(reqId)) {
                            return NextResponse.json({ success: false, message: `Invalid managed role ID: ${reqId}` }, { status: 400 });
                        }

                        const modifierPermissions = await getManagedRolePermissions(modifierRole, reqId);
                        if (modifierPermissions.length === 0) {
                            return NextResponse.json({ success: false, message: `You do not have permission to manage role ID: ${reqId}` }, { status: 403 });
                        }
                        for (const p of reqManaged.permissions) {
                            if (!modifierPermissions.includes(p as RolePermission)) {
                                return NextResponse.json({ success: false, message: `You cannot grant ${p} permission for managed role ID: ${reqId}` }, { status: 403 });
                            }
                        }
                    }
                }
            }

            const role = await this.roleService.updateRole(new Types.ObjectId(id), data);

            if (data.managedRoles && Array.isArray(data.managedRoles)) {
                await roleHierarchyRepository.setHierarchiesForParent(
                    new Types.ObjectId(id),
                    data.managedRoles.map((m) => ({
                        targetRole: normalizeRoleId(m),
                        permissions: m.permissions,
                    }))
                );
            }

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

    async deleteRole(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid role ID" },
                    { status: 400 }
                );
            }

            if (request) {
                const authResult = await authorizeRequest(request, PERMISSION_KEYS.ROLE_DELETE, "Role");
                if (!authResult.isAuthorized) return authResult.response;

                const { context } = authResult;
                const deleterRole = await Role.findById(context.roleId);
                if (!deleterRole) {
                    return NextResponse.json({ success: false, message: "Current user role not found" }, { status: 403 });
                }

                if (deleterRole.role !== "SYSTEM_SUPER_ADMIN") {
                    const deleterPermissionsForRole = await getManagedRolePermissions(deleterRole, id);
                    if (!deleterPermissionsForRole.includes("role.delete")) {
                        return NextResponse.json(
                            { success: false, message: "You do not have permission to delete this role" },
                            { status: 403 }
                        );
                    }
                }
            }

            const roleToDelete = await this.roleService.getRoleById(new Types.ObjectId(id));
            if (roleToDelete?.role === "SYSTEM_SUPER_ADMIN") {
                return NextResponse.json(
                    { success: false, message: "SYSTEM_SUPER_ADMIN role cannot be deleted" },
                    { status: 403 }
                );
            }

            await this.roleService.deleteRole(new Types.ObjectId(id));
            await roleHierarchyRepository.deleteByRole(new Types.ObjectId(id));

            return NextResponse.json(
                { success: true, message: "Role deleted successfully" },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to delete role" },
                { status: statusCode }
            );
        }
    }
}

const roleController = new RoleController();
export default roleController;
