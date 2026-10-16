import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultUserService, { UserService } from "@/services/user.service";
import { CreateUserDto, UpdateUserDto } from "@/dto/user.dto";
import User from "@/models/user.model";
import Role from "@/models/role.model";
import Doctor from "@/models/doctor.model";
import Department from "@/models/department.model";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { guardLastSuperAdmin } from "@/lib/rbac/admin-safety";

function normalizeId(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (value instanceof Types.ObjectId) return value.toString();
    const obj = value as { _id?: unknown };
    return (obj._id ?? value).toString();
}

/** Users may only be managed inside the admin's own hospital. */
function isOutsideOrganization(context: { organizationId?: Types.ObjectId }, organization: unknown): boolean {
    return !context.organizationId || normalizeId(organization) !== context.organizationId.toString();
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
            data.organization = data.organization || context.organizationId?.toString();
            if (isOutsideOrganization(context, data.organization)) {
                return NextResponse.json({ success: false, message: "Cannot create user outside your hospital" }, { status: 403 });
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

    /**
     * Minimal staff directory for pickers (doctor, nurse, assignee dropdowns).
     * Any staff role with the directory grant sees active colleagues within its own scope,
     * and only non-sensitive fields are returned.
     */
    async getUserDirectory(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.USER_DIRECTORY_VIEW, "User");
            if (!authResult.isAuthorized) return authResult.response;

            const roleFilter = new URL(request.url).searchParams.get("role")?.trim().toUpperCase();
            let roleId: Types.ObjectId | undefined;
            if (roleFilter) {
                const role = await Role.findOne({ role: roleFilter }).select("_id").lean();
                if (!role) {
                    return NextResponse.json({ success: true, count: 0, data: [] }, { status: 200 });
                }
                roleId = new Types.ObjectId(role._id.toString());
            }

            // Self-heal: logins created before hospital scope was stamped
            // (no organization) are invisible to every branch-scoped picker.
            // In a single-hospital deployment they can only belong here, so
            // adopt them into the caller's hospital. Skipped when several
            // hospitals share the database.
            if (authResult.context.organizationId) {
                try {
                    const { default: Organization } = await import("@/models/organization.model");
                    const orgCount = await Organization.countDocuments();
                    if (orgCount === 1) {
                        await User.updateMany(
                            { organization: null },
                            { $set: { organization: authResult.context.organizationId } }
                        );
                    }
                } catch {
                    // Healing is best-effort; the directory still returns.
                }
            }

            const users = await User.find({
                ...authResult.filter,
                isActive: { $ne: false },
                ...(roleId ? { role: roleId } : {}),
            })
                .select(roleFilter ? "name role" : "name email phone gender role organization branch isActive")
                .populate("role", "role")
                .sort({ name: 1 })
                .lean();

            const userIds = users.map((user) => user._id);
            const doctorProfiles = roleFilter === "DOCTOR" && userIds.length
                ? await Doctor.find({ userId: { $in: userIds } })
                    .select("userId departmentId specialization")
                    .lean()
                : [];
            const departmentIds = doctorProfiles
                .map((doctor) => doctor.departmentId)
                .filter((id): id is Types.ObjectId => Boolean(id));
            const departments = departmentIds.length
                ? await Department.find({ _id: { $in: departmentIds } })
                    .select("name")
                    .lean()
                : [];
            const departmentNames = new Map(
                departments.map((department) => [department._id.toString(), department.name]),
            );
            const doctorsByUserId = new Map(
                doctorProfiles.map((doctor) => [doctor.userId.toString(), doctor]),
            );

            const data = roleFilter
                ? users.map((user) => {
                    const role = user.role as unknown as { role?: string } | null;
                    const profile = doctorsByUserId.get(user._id.toString());
                    return {
                        _id: user._id,
                        name: user.name,
                        role: role?.role ?? "",
                        department: profile?.departmentId
                            ? departmentNames.get(profile.departmentId.toString())
                            : undefined,
                        specialization: profile?.specialization,
                    };
                })
                : users;

            return NextResponse.json(
                { success: true, count: data.length, data },
                { status: 200 }
            );
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to fetch user directory" },
                { status: 500 }
            );
        }
    }

    async getUsers(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.USER_VIEW, "User");
            if (!authResult.isAuthorized) return authResult.response;

            const { context } = authResult;
            const users = (await this.userService.getAllUsers())
                .filter((u) => !isOutsideOrganization(context, u.organization));

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

    async getUserById(id: string, request?: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json(
                    { success: false, message: "Invalid user ID" },
                    { status: 400 }
                );
            }

            if (request) {
                const authResult = await authorizeRequest(request, PERMISSION_KEYS.USER_VIEW, "User");
                if (!authResult.isAuthorized) return authResult.response;

                const targetUser = await this.userService.getUserById(new Types.ObjectId(id));
                if (!targetUser) {
                    return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
                }
                if (isOutsideOrganization(authResult.context, targetUser.organization)) {
                    return NextResponse.json({ success: false, message: "Cannot view user outside your hospital" }, { status: 403 });
                }
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
            const targetUser = await this.userService.getUserById(new Types.ObjectId(id));
            if (!targetUser) {
                return NextResponse.json({ success: false, message: "Target user not found" }, { status: 404 });
            }
            if (isOutsideOrganization(context, targetUser.organization) || (data.organization && isOutsideOrganization(context, data.organization))) {
                return NextResponse.json({ success: false, message: "Cannot update user outside your hospital" }, { status: 403 });
            }

            // Changing somebody's role changes their access from that moment on —
            // the sidebar and every API route re-read the role per request, so no
            // re-login is involved. Two things are refused outright.
            if (data.role && normalizeId(data.role) !== normalizeId(targetUser.role)) {
                if (normalizeId(context.userId) === id) {
                    return NextResponse.json(
                        { success: false, message: "You cannot change your own role. Ask another administrator to do it." },
                        { status: 403 }
                    );
                }

                const nextRole = data.role
                    ? await Role.findById(new Types.ObjectId(String(data.role))).select("role").lean()
                    : null;
                if (!nextRole) {
                    return NextResponse.json({ success: false, message: "That role does not exist" }, { status: 400 });
                }

                const guard = await guardLastSuperAdmin({ targetUserId: id, nextRoleName: nextRole.role });
                if (!guard.allowed) {
                    return NextResponse.json({ success: false, message: guard.message, code: "LAST_SUPER_ADMIN" }, { status: 409 });
                }
            }

            // Switching the last administrator off is the same one-way door as
            // moving them to another role: nobody would be left who can sign in
            // and manage roles.
            if (data.isActive === false) {
                const guard = await guardLastSuperAdmin({ targetUserId: id });
                if (!guard.allowed) {
                    return NextResponse.json({ success: false, message: guard.message, code: "LAST_SUPER_ADMIN" }, { status: 409 });
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

                const targetUser = await this.userService.getUserById(new Types.ObjectId(id));
                if (!targetUser) {
                    return NextResponse.json({ success: false, message: "Target user not found" }, { status: 404 });
                }
                if (isOutsideOrganization(authResult.context, targetUser.organization)) {
                    return NextResponse.json({ success: false, message: "Cannot delete user outside your hospital" }, { status: 403 });
                }

                // Deleting the last administrator leaves nobody who can manage
                // roles and permissions, which is a one-way door.
                const guard = await guardLastSuperAdmin({ targetUserId: id, nextRoleName: null });
                if (!guard.allowed) {
                    return NextResponse.json({ success: false, message: guard.message, code: "LAST_SUPER_ADMIN" }, { status: 409 });
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
