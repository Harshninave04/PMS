import roleRepository, { RoleRepository } from "@/repositories/role.repository";
import { Types } from "mongoose";
import { IRole } from "@/interfaces/role.interface";
import User from "@/models/user.model";
import { normalizePermissions, isSuperAdminRole } from "@/lib/rbac/default-permissions";
import { ROLES_WITH_DEFAULTS } from "@/lib/rbac/default-permissions";

/** Roles seeded by this build. They cannot be renamed or deleted. */
export const SYSTEM_ROLE_NAMES: readonly string[] = ROLES_WITH_DEFAULTS;

export class RoleService {
    constructor(private repository: RoleRepository = roleRepository) {}

    async createRole(data: { role: string; permissions: string[]; description?: string }): Promise<IRole> {
        const name = (data.role || "").trim().toUpperCase();
        if (!name) throw { statusCode: 400, message: "Role name is required" };
        if (!/^[A-Z][A-Z0-9_]{1,49}$/.test(name)) {
            throw { statusCode: 400, message: "Role name must be uppercase letters, digits and underscores" };
        }
        if (SYSTEM_ROLE_NAMES.includes(name)) {
            throw { statusCode: 409, message: `'${name}' is a built-in role` };
        }

        const existing = await this.repository.findByName(name);
        if (existing) throw { statusCode: 409, message: `Role '${name}' already exists` };

        return await this.repository.create({
            role: name,
            // normalizePermissions applies both dependency rules, so a role can
            // never be created in a state the guards would refuse.
            permissions: normalizePermissions(data.permissions),
            description: (data.description || "").trim(),
            isSystem: false,
            access: [],
        } as never);
    }

    async getAllRoles(): Promise<IRole[]> {
        return await this.repository.findAll();
    }

    async getRoleById(id: Types.ObjectId): Promise<IRole | null> {
        return await this.repository.findById(id);
    }

    /** How many users hold a role, and how many of those are active. */
    async userCounts(): Promise<Record<string, number>> {
        const rows = await User.aggregate<{ _id: Types.ObjectId; total: number; active: number }>([
            { $group: { _id: "$role", total: { $sum: 1 }, active: { $sum: { $cond: [{ $ne: ["$isActive", false] }, 1, 0] } } } },
        ]);
        const counts: Record<string, number> = {};
        for (const row of rows) counts[String(row._id)] = row.total;
        return counts;
    }

    async updateRole(
        id: Types.ObjectId,
        data: { role?: string; permissions?: string[]; description?: string }
    ): Promise<IRole | null> {
        const role = await this.repository.findById(id);
        if (!role) throw { statusCode: 404, message: "Role not found" };

        if (isSuperAdminRole(role.role)) {
            throw { statusCode: 403, message: "The Administrator role always has full access and cannot be edited" };
        }
        if (role.isSystem && data.role && data.role.trim().toUpperCase() !== role.role) {
            throw { statusCode: 403, message: "Built-in roles cannot be renamed" };
        }

        const update: Record<string, unknown> = {};
        if (typeof data.role === "string" && data.role.trim()) update.role = data.role.trim().toUpperCase();
        if (Array.isArray(data.permissions)) update.permissions = normalizePermissions(data.permissions);
        if (typeof data.description === "string") update.description = data.description.trim();

        if (update.role) {
            const clash = await this.repository.findByName(update.role as string);
            if (clash && !clash._id.equals(id)) throw { statusCode: 409, message: `Role '${update.role}' already exists` };
        }

        return await this.repository.update(id, update as never);
    }

    async deleteRole(id: Types.ObjectId): Promise<IRole | null> {
        const role = await this.repository.findById(id);
        if (!role) throw { statusCode: 404, message: "Role not found" };

        if (isSuperAdminRole(role.role) || role.isSystem) {
            throw { statusCode: 403, message: `Built-in role '${role.role}' cannot be deleted` };
        }

        const holders = await User.countDocuments({ role: id });
        if (holders > 0) {
            throw {
                statusCode: 409,
                message: `${holders} user(s) still hold '${role.role}'. Reassign them before deleting it.`,
            };
        }

        return await this.repository.delete(id);
    }
}

export default new RoleService();