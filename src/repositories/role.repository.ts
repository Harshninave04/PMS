import { Types } from "mongoose";
import Role from "@/models/role.model";
import { IRole } from "@/interfaces/role.interface";
import { CreateRoleDto, sanitizeAccess, UpdateRoleDto } from "@/dto/role.dto";

/** Fields a client is permitted to write. Anything else in the body is ignored. */
const WRITABLE_FIELDS = ["role", "access", "managedRoles", "managedBy"] as const;

function pickWritableFields(data: Partial<UpdateRoleDto>): Record<string, unknown> {
    const update: Record<string, unknown> = {};
    for (const field of WRITABLE_FIELDS) {
        if (data[field] !== undefined) {
            update[field] = data[field];
        }
    }
    return update;
}

export class RoleRepository {
    async create(data: CreateRoleDto): Promise<IRole> {
        return await new Role({
            ...data,
            access: sanitizeAccess(data.access)
        }).save();
    }

    async findAll(): Promise<IRole[]> {
        return await Role.find().lean();
    }

    async findById(id: Types.ObjectId): Promise<IRole | null> {
        return await Role.findById(id).lean();
    }

    async findByName(role: string): Promise<IRole | null> {
        return await Role.findOne({ role }).lean();
    }

    async update(id: Types.ObjectId, data: UpdateRoleDto): Promise<IRole | null> {
        return await Role.findByIdAndUpdate(id, pickWritableFields(data), {
            new: true,
            runValidators: true
        }).lean();
    }

    async delete(id: Types.ObjectId): Promise<IRole | null> {
        return await Role.findByIdAndDelete(id).lean();
    }
}

export default new RoleRepository();
