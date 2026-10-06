import roleRepository, { RoleRepository } from "@/repositories/role.repository";
import { Types } from "mongoose";
import { IRole } from "@/interfaces/role.interface";
import { CreateRoleDto, UpdateRoleDto } from "@/dto/role.dto";

export class RoleService {
    constructor(private repository: RoleRepository = roleRepository) { }

    async createRole(data: CreateRoleDto): Promise<IRole> {
        const existing = await this.repository.findByName(data.role);
        if (existing) {
            throw { statusCode: 409, message: `Role '${data.role}' already exists` };
        }
        return await this.repository.create(data);
    }

    async getAllRoles(): Promise<IRole[]> {
        return await this.repository.findAll();
    }

    async getRoleById(id: Types.ObjectId): Promise<IRole | null> {
        return await this.repository.findById(id);
    }

    async updateRole(id: Types.ObjectId, data: UpdateRoleDto): Promise<IRole | null> {
        const role = await this.repository.findById(id);
        if (!role) {
            throw { statusCode: 404, message: "Role not found" };
        }
        if (data.role) {
            const existing = await this.repository.findByName(data.role);
            if (existing && existing._id.toString() !== id.toString()) {
                throw { statusCode: 409, message: `Role '${data.role}' already exists` };
            }
        }

        /** A rejected request is not an edit, so it must not take ownership of the role. */
        const hasChanges =
            data.role !== undefined || data.access !== undefined || data.managedRoles !== undefined;

        // Taking ownership is what stops boot-time reconciliation from
        // overwriting the administrator's changes on the next restart.
        return hasChanges
            ? await this.repository.update(id, { ...data, managedBy: "admin" })
            : role;
    }

    /** Hand a role back to the code definitions so the next boot reconciles it again. */
    async resetRoleToCodeDefaults(id: Types.ObjectId): Promise<IRole | null> {
        return await this.repository.update(id, { managedBy: "code" } as UpdateRoleDto);
    }

    async deleteRole(id: Types.ObjectId): Promise<IRole | null> {
        const role = await this.repository.findById(id);
        if (!role) {
            throw { statusCode: 404, message: "Role not found" };
        }
        return await this.repository.delete(id);
    }
}

export default new RoleService();
