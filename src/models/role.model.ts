import mongoose, { Schema } from "mongoose";
import { IRole } from "@/interfaces/role.interface";

const grantSchema = new Schema({
    permission: { type: String, required: true },
    orgScope: {
        type: String,
        enum: ["GLOBAL", "ORGANIZATION", "BRANCH", "DEPARTMENT", "WARD"],
        default: "BRANCH"
    },
    relScope: {
        type: String,
        enum: ["UNRESTRICTED", "ASSIGNED", "OWN"],
        default: "UNRESTRICTED"
    }
}, { _id: false });

const accessSchema = new Schema({
    moduleName: { type: String, required: true },
    permissions: { type: [String], default: [] },
    grants: { type: [grantSchema], default: [] },
}, { _id: false });

const managedRoleSchema = new Schema({
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    permissions: { type: [String], default: [] }
}, { _id: false });

const roleSchema = new Schema<IRole>({
    role: {
        type: String,
        required: true,
    },
    access: {
        type: [accessSchema],
        required: true,
        default: [],
    },
    managedRoles: {
        type: [managedRoleSchema],
        default: []
    }
}, { timestamps: true });

const Role = mongoose.models.Role || mongoose.model<IRole>("Role", roleSchema);

// Role names are the join key used by the seed, the hierarchy and every
// permission lookup, so duplicates are never valid. Enforced at the database
// level as well as in role.service.ts, so a concurrent bootstrap or a race
// between two admins cannot create a second "DOCTOR".
roleSchema.index({ role: 1 }, { unique: true });

export default Role;