import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultUserService, { UserService } from "@/services/user.service";
import { CreateUserDto, UpdateUserDto } from "@/dto/user.dto";
import Role from "@/models/role.model";
import Organization from "@/models/organization.model";
import roleHierarchyRepository from "@/repositories/role-hierarchy.repository";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { IRole, IManagedRole } from "@/interfaces/role.interface";

function normalizeId(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (value instanceof Types.ObjectId) return value.toString();
    const obj = value as { _id?: unknown };
    return (obj._id ?? value).toString();
}

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

async function branchBelongsToOrganization(branchId: string, organizationId: string): Promise<boolean> {
    if (!branchId || !organizationId) return false;

    const branch = await Organization.findById(branchId).lean();
    if (!branch) return false;

    const headQuarterId = normalizeId(branch.headQuarter);
    return branch._id.toString() === organizationId || headQuarterId === organizationId;
}

async function hasRoleHierarchyPermission(
    parentRole: IRole,
    targetRoleId: string,
    permission: "CREATE" | "READ" | "UPDATE" | "DELETE"
): Promise<boolean> {
    const parentId = typeof parentRole._id === "string" ? new Types.ObjectId(parentRole._id) : (parentRole._id as Types.ObjectId);
    const hierarchy = await roleHierarchyRepository.findByParentAndTarget(
        parentId,
        new Types.ObjectId(targetRoleId)
    );

    if (hierarchy?.permissions?.includes(permission)) return true;

    return Boolean(currentUserRoleLegacyPermissions(parentRole, targetRoleId)?.includes(permission));
}

function currentUserRoleLegacyPermissions(parentRole: IRole, targetRoleId: string): string[] | undefined {
    return parentRole.managedRoles?.find((item: IManagedRole) => normalizeRoleId(item) === targetRoleId)?.permissions;
}

export class UserController {
    constructor(private userService: UserService = defaultUserService) { }

    async createUser(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.USER_CREATE, "User");
            if (!authResult.isAuthorized) return authResult.response;

            const data: CreateUserDto = await request.json();

            if (!data.name || !data.email || !data.password || !data.gender || !data.role) {
                return NextResponse.json(
                    { success: false, message: "Fields 'name', 'email', 'password', 'gender', and 'role' are required" },
                    { status: 400 }
                );
            }

            if (!Types.ObjectId.isValid(data.role)) {
                return NextResponse.json(
                    { success: false, message: "Invalid role ID format" },
                    { status: 400 }
                );
            }

            if (data.organization && !Types.ObjectId.isValid(data.organization)) {
                return NextResponse.json(
                    { success: false, message: "Invalid organization ID format" },
                    { status: 400 }
                );
            }

            if (data.branch && !Types.ObjectId.isValid(data.branch)) {
                return NextResponse.json(
                    { success: false, message: "Invalid branch ID format" },
                    { status: 400 }
                );
            }

            const { context } = authResult;
            const isGlobalAdmin = context.roleName === "SYSTEM_SUPER_ADMIN";

            if (!isGlobalAdmin) {
                if (!context.organizationId) {
                    return NextResponse.json({ success: false, message: "Current user has no organization scope" }, { status: 403 });
                }

                const currentOrganizationId = context.organizationId.toString();
                data.organization = data.organization || currentOrganizationId;

                if (context.branchId) {
                    data.branch = data.branch || context.branchId.toString();
                }

                // 1. Organization Check
                if (data.organization?.toString() !== currentOrganizationId) {
                    return NextResponse.json({ success: false, message: "Cannot create user outside your organization" }, { status: 403 });
                }

                // 2. Branch Check
                if (context.branchId) {
                    if (data.branch?.toString() !== context.branchId.toString()) {
                        return NextResponse.json({ success: false, message: "Cannot create user outside your branch" }, { status: 403 });
                    }
                } else if (data.branch) {
                    const branchAllowed = await branchBelongsToOrganization(data.branch.toString(), currentOrganizationId);
                    if (!branchAllowed) {
                        return NextResponse.json({ success: false, message: "Cannot create user in a branch outside your organization" }, { status: 403 });
                    }
                }

                // 3. Role Check
                const currentUserRole = await Role.findById(context.roleId);
                if (!currentUserRole) {
                    return NextResponse.json({ success: false, message: "Current user role not found" }, { status: 403 });
                }

                const hasCreatePermission = await hasRoleHierarchyPermission(currentUserRole, data.role.toString(), "CREATE");
                if (!hasCreatePermission) {
                    return NextResponse.json({ success: false, message: "You do not have permission to create a user with this role" }, { status: 403 });
                }
            }

            const user = await this.userService.createUser(data);

            return NextResponse.json(
                { success: true, message: "User created successfully", data: user },
                { status: 201 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to create user" },
                { status: statusCode }
            );
        }
    }

    async getUsers(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.USER_VIEW, "User");
            if (!authResult.isAuthorized) return authResult.response;

            const { context } = authResult;
            const isGlobalAdmin = context.roleName === "SYSTEM_SUPER_ADMIN";

            const { searchParams } = new URL(request.url);
            const organizationId = searchParams.get("organizationId");

            let users = organizationId && Types.ObjectId.isValid(organizationId)
                ? await this.userService.getUsersByOrganizationId(new Types.ObjectId(organizationId))
                : await this.userService.getAllUsers();

            if (!isGlobalAdmin) {
                // 1. Organization boundary
                if (context.organizationId) {
                    const orgIdStr = context.organizationId.toString();
                    users = users.filter((u) => {
                        const userOrg = normalizeId(u.organization);
                        return userOrg === orgIdStr;
                    });
                }

                // 2. Branch boundary
                if (context.branchId) {
                    const branchIdStr = context.branchId.toString();
                    users = users.filter((u) => {
                        const userBranch = normalizeId(u.branch);
                        return userBranch === branchIdStr;
                    });
                }

                // 3. Role Hierarchy (roles with READ access in RoleHierarchy / managedRoles, plus the user's own account)
                const currentUserRole = await Role.findById(context.roleId);
                if (!currentUserRole) {
                    return NextResponse.json({ success: false, message: "Current user role not found" }, { status: 403 });
                }

                const hierarchies = await roleHierarchyRepository.findByParentRole(currentUserRole._id as Types.ObjectId);
                const readableRoleIdsFromHierarchy = hierarchies
                    .filter((h) => h.permissions?.includes("READ"))
                    .map((h) => normalizeRoleId(h.targetRole));

                const readableRoleIdsFromLegacy = currentUserRole?.managedRoles
                    ?.filter((mr: IManagedRole) => mr.permissions?.includes("READ"))
                    ?.map((mr: IManagedRole) => normalizeRoleId(mr.roleId)) || [];

                const readableRoleIds = Array.from(new Set([...readableRoleIdsFromHierarchy, ...readableRoleIdsFromLegacy]));

                users = users.filter((u) => {
                    const uId = normalizeId(u._id);
                    const isSelf = uId === context.userId.toString();
                    const uRoleId = normalizeRoleId(u.role);
                    const isManagedRole = Boolean(uRoleId && readableRoleIds.includes(uRoleId));
                    return isSelf || isManagedRole;
                });
            }

            return NextResponse.json(
                { success: true, count: users.length, data: users },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to fetch users" },
                { status: 500 }
            );
        }
    }

    async getUserById(id: string): Promise<NextResponse> {
        try {
            await dbConnect();

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid user ID" },
                    { status: 400 }
                );
            }

            const user = await this.userService.getUserById(new Types.ObjectId(id));
            if (!user) {
                return NextResponse.json(
                    { success: false, message: "User not found" },
                    { status: 404 }
                );
            }

            return NextResponse.json(
                { success: true, data: user },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to fetch user" },
                { status: 500 }
            );
        }
    }

    async updateUser(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.USER_UPDATE, "User");
            if (!authResult.isAuthorized) return authResult.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid user ID" },
                    { status: 400 }
                );
            }

            const data: UpdateUserDto = await request.json();

            if (data.role && !Types.ObjectId.isValid(data.role)) {
                return NextResponse.json(
                    { success: false, message: "Invalid role ID format" },
                    { status: 400 }
                );
            }

            if (data.organization && !Types.ObjectId.isValid(data.organization)) {
                return NextResponse.json(
                    { success: false, message: "Invalid organization ID format" },
                    { status: 400 }
                );
            }

            if (data.branch && !Types.ObjectId.isValid(data.branch)) {
                return NextResponse.json(
                    { success: false, message: "Invalid branch ID format" },
                    { status: 400 }
                );
            }

            const { context } = authResult;
            const isGlobalAdmin = context.roleName === "SYSTEM_SUPER_ADMIN";

            if (!isGlobalAdmin) {
                const targetUser = await this.userService.getUserById(new Types.ObjectId(id));
                if (!targetUser) {
                    return NextResponse.json({ success: false, message: "Target user not found" }, { status: 404 });
                }

                if (!context.organizationId) {
                    return NextResponse.json({ success: false, message: "Current user has no organization scope" }, { status: 403 });
                }

                const currentOrganizationId = context.organizationId.toString();
                const targetOrganizationId = normalizeId(targetUser.organization);
                const targetBranchId = normalizeId(targetUser.branch);

                // 1. Organization Check
                if (targetOrganizationId !== currentOrganizationId) {
                    return NextResponse.json({ success: false, message: "Cannot update user outside your organization" }, { status: 403 });
                }
                if (data.organization && data.organization.toString() !== currentOrganizationId) {
                    return NextResponse.json({ success: false, message: "Cannot move user outside your organization" }, { status: 403 });
                }

                // 2. Branch Check
                if (context.branchId) {
                    if (targetBranchId !== context.branchId.toString()) {
                        return NextResponse.json({ success: false, message: "Cannot update user outside your branch" }, { status: 403 });
                    }
                    if (data.branch && data.branch.toString() !== context.branchId.toString()) {
                        return NextResponse.json({ success: false, message: "Cannot move user outside your branch" }, { status: 403 });
                    }
                } else if (data.branch) {
                    const branchAllowed = await branchBelongsToOrganization(data.branch.toString(), currentOrganizationId);
                    if (!branchAllowed) {
                        return NextResponse.json({ success: false, message: "Cannot move user to a branch outside your organization" }, { status: 403 });
                    }
                }

                // 3. Role Check
                const currentUserRole = await Role.findById(context.roleId);
                if (!currentUserRole) {
                    return NextResponse.json({ success: false, message: "Current user role not found" }, { status: 403 });
                }

                const roleToCheck = data.role ? data.role.toString() : normalizeId(targetUser.role);
                const hasUpdatePermission = await hasRoleHierarchyPermission(currentUserRole, roleToCheck, "UPDATE");

                if (!hasUpdatePermission) {
                    return NextResponse.json({ success: false, message: "You do not have permission to update this user's role" }, { status: 403 });
                }
            }

            const user = await this.userService.updateUser(new Types.ObjectId(id), data);

            return NextResponse.json(
                { success: true, message: "User updated successfully", data: user },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to update user" },
                { status: statusCode }
            );
        }
    }

    async deleteUser(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid user ID" },
                    { status: 400 }
                );
            }

            if (request) {
                const authResult = await authorizeRequest(request, PERMISSION_KEYS.USER_DISABLE, "User");
                if (!authResult.isAuthorized) return authResult.response;

                const { context } = authResult;
                const isGlobalAdmin = context.roleName === "SYSTEM_SUPER_ADMIN";

                if (!isGlobalAdmin) {
                    const targetUser = await this.userService.getUserById(new Types.ObjectId(id));
                    if (!targetUser) {
                        return NextResponse.json({ success: false, message: "Target user not found" }, { status: 404 });
                    }

                    if (!context.organizationId) {
                        return NextResponse.json({ success: false, message: "Current user has no organization scope" }, { status: 403 });
                    }

                    const currentOrganizationId = context.organizationId.toString();
                    const targetOrganizationId = normalizeId(targetUser.organization);
                    const targetBranchId = normalizeId(targetUser.branch);

                    if (targetOrganizationId !== currentOrganizationId) {
                        return NextResponse.json({ success: false, message: "Cannot delete user outside your organization" }, { status: 403 });
                    }

                    if (context.branchId && targetBranchId !== context.branchId.toString()) {
                        return NextResponse.json({ success: false, message: "Cannot delete user outside your branch" }, { status: 403 });
                    }

                    const currentUserRole = await Role.findById(context.roleId);
                    if (!currentUserRole) {
                        return NextResponse.json({ success: false, message: "Current user role not found" }, { status: 403 });
                    }

                    const hasDeletePermission = await hasRoleHierarchyPermission(currentUserRole, normalizeId(targetUser.role), "DELETE");
                    if (!hasDeletePermission) {
                        return NextResponse.json({ success: false, message: "You do not have permission to delete a user with this role" }, { status: 403 });
                    }
                }
            }

            await this.userService.deleteUser(new Types.ObjectId(id));

            return NextResponse.json(
                { success: true, message: "User deleted successfully" },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            const statusCode = err?.statusCode || 500;
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to delete user" },
                { status: statusCode }
            );
        }
    }
}

const userController = new UserController();
export default userController;
