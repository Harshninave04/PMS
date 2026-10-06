import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * Append-only record of every clinically or financially significant mutation.
 *
 * A hospital cannot defend a chart or an invoice without knowing who changed
 * what and when, so writes are never updated or deleted - corrections are made
 * by appending a new entry.
 */
export interface IAuditLog extends Document {
  actor: Types.ObjectId;
  actorName?: string;
  actorRole?: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "RESTORE" | "LOGIN" | "ACCESS_DENIED" | "EXPORT";
  entity: string;
  entityId?: string;
  /** Human-readable summary shown in the audit trail UI. */
  summary?: string;
  /** Only the fields that changed, so PHI volume stays bounded. */
  changes?: Record<string, { before?: unknown; after?: unknown }>;
  /** Context that is not a field diff: bill number, stock delta, reason. */
  metadata?: Record<string, unknown>;
  organizationId?: Types.ObjectId;
  branchId?: Types.ObjectId;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    actorName: { type: String, trim: true },
    actorRole: { type: String, trim: true },
    action: {
      type: String,
      enum: ["CREATE", "UPDATE", "DELETE", "RESTORE", "LOGIN", "ACCESS_DENIED", "EXPORT"],
      required: true,
    },
    entity: { type: String, required: true, trim: true, lowercase: true, index: true },
    entityId: { type: String, trim: true },
    summary: { type: String, trim: true, maxlength: 500 },
    changes: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed },
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization" },
    branchId: { type: Schema.Types.ObjectId, ref: "Organization" },
    ipAddress: { type: String, trim: true },
    userAgent: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

const AuditLog =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>("AuditLog", auditLogSchema);

export default AuditLog;