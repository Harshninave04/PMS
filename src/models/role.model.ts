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
    /**
     * Sub-item level access: `module.submodule:action` keys derived from the
     * sidebar (see `src/lib/rbac/permissions.config.ts`). This is what the
     * sidebar, the route guards and the permission matrix read.
     *
     * `access` below is the older module-keyed data-layer permission list and is
     * kept so existing records and API guards keep working; `permissions` is the
     * authoritative navigation/access layer added alongside it.
     */
    permissions: {
        type: [String],
        default: [],
    },
    /** Seeded roles cannot be renamed or deleted at runtime. */
    isSystem: {
        type: Boolean,
        default: false,
    },
    description: {
        type: String,
        trim: true,
        default: "",
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

export default Role;