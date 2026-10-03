import mongoose, { Schema } from "mongoose";

/**
 * Append-only record of every change to a role's permissions.
 *
 * Permissions are the one thing in this system where a quiet mistake locks
 * people out of their work, so "who widened this, when, and from what" has to be
 * answerable after the fact rather than reconstructed from memory.
 */
export interface IRoleAudit {
    action: "CREATE" | "UPDATE" | "DELETE" | "MIGRATE" | "SEED";
    role: string;
    roleId?: string;
    actor: {
        userId?: string;
        email?: string;
        roleName?: string;
    };
    before: string[];
    after: string[];
    /** Permissions this change added. */
    added: string[];
    /** Permissions this change removed. */
    removed: string[];
    /** Human-readable reason, e.g. "reconciled with build defaults". */
    reason?: string;
    createdAt: Date;
}

const roleAuditSchema = new Schema<IRoleAudit>(
    {
        action: {
            type: String,
            enum: ["CREATE", "UPDATE", "DELETE", "MIGRATE", "SEED"],
            required: true,
        },
        role: { type: String, required: true, trim: true },
        roleId: { type: String },
        actor: {
            userId: { type: String },
            email: { type: String, trim: true },
            roleName: { type: String, trim: true },
        },
        before: { type: [String], default: [] },
        after: { type: [String], default: [] },
        added: { type: [String], default: [] },
        removed: { type: [String], default: [] },
        reason: { type: String, trim: true },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

roleAuditSchema.index({ role: 1, createdAt: -1 });

const RoleAudit = mongoose.models.RoleAudit || mongoose.model<IRoleAudit>("RoleAudit", roleAuditSchema);

export default RoleAudit;