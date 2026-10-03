import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultUserService, { UserService } from "@/services/user.service";
import { CreateUserDto, UpdateUserDto } from "@/dto/user.dto";
import User from "@/models/user.model";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

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

            const users = await User.find({ ...authResult.filter, isActive: { $ne: false } })
                .select("name email phone gender role organization branch isActive")
                .populate("role", "role")
                .sort({ name: 1 })
                .lean();

            return NextResponse.json(
                { success: true, count: users.length, data: users },
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
