import { headers } from "next/headers";
import { Types } from "mongoose";
import AuditLog, { IAuditLog } from "@/models/audit-log.model";
import dbConnect from "@/lib/dbConnect";
import { AuthenticatedUserContext } from "@/types/rbac";

export type AuditAction = IAuditLog["action"];

export interface AuditEntry {
  action: AuditAction;
  entity: string;
  entityId?: string;
  summary?: string;
  changes?: Record<string, { before?: unknown; after?: unknown }>;
  /**
   * Context that is not a before/after field pair: a bill number, a stock
   * delta, a reason string. Redacted the same way `changes` is.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Fields whose values must never be written into the audit trail. The trail is
 * read by admins and retained for years, so it stores identifiers and
 * structure rather than clinical detail or credentials.
 */
const REDACTED_FIELDS = new Set([
  "password",
  "aadhaarNumber",
  "panNumber",
  "accountNumber",
  "ifscCode",
]);

/** Nested free-text fields excluded from `changes` to keep PHI out of the trail. */
const REDACTED_TEXT_FIELDS = new Set([
  "notes",
  "withheldReason",
  "medicalHistory",
  "allergies",
  "address",
  "emergencyContact",
]);

export function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Types.ObjectId) return value.toString();
  if (Array.isArray(value)) return value.map((entry) => redact(entry));
  if (typeof value === "object") {
    return redactObject(value as Record<string, unknown>);
  }
  if (typeof value === "string") {
    return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  }
  return value;
}

/** Redacts a plain object, used for caller-supplied audit metadata. */
export function redactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return redactObject(value);
}

function redactObject(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (REDACTED_FIELDS.has(key)) {
      result[key] = "[redacted]";
    } else if (REDACTED_TEXT_FIELDS.has(key)) {
      result[key] = entry === undefined || entry === null ? entry : "[redacted]";
    } else {
      result[key] = redact(entry);
    }
  }
  return result;
}

/**
 * Redacts a single field, taking its *name* into account.
 *
 * `diffRecords` walks a record field by field and previously passed each value
 * straight to `redact`, which only inspects the value. The sensitive-name lists
 * were therefore never consulted and clinical free text (`medicalHistory`,
 * `allergies`, `notes`, ...) was written to the trail verbatim.
 */
function redactField(key: string, value: unknown): unknown {
  if (REDACTED_FIELDS.has(key)) return "[redacted]";
  if (REDACTED_TEXT_FIELDS.has(key)) {
    return value === undefined || value === null ? value : "[redacted]";
  }
  return redact(value);
}

/** Builds a field-level diff containing only the keys that actually changed. */
export function diffRecords(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): Record<string, { before?: unknown; after?: unknown }> {
  const changes: Record<string, { before?: unknown; after?: unknown }> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);

  for (const key of keys) {
    if (key === "__v" || key === "updatedAt" || key === "createdAt") continue;

    const beforeValue = before?.[key];
    const afterValue = after?.[key];

    // Sensitive fields are compared on their *raw* values. Redacting first
    // would collapse "diabetes" and "diabetes, CKD" to the same placeholder and
    // drop the edit from the trail altogether; comparing raw keeps the record
    // that something changed while still storing only the placeholder.
    const rawBefore = JSON.stringify(normalise(beforeValue));
    const rawAfter = JSON.stringify(normalise(afterValue));
    if (rawBefore === rawAfter) continue;

    changes[key] = { before: redactField(key, beforeValue), after: redactField(key, afterValue) };
  }

  return changes;
}

/** Comparable form of a value; Mongoose ids and Dates stringify predictably. */
function normalise(value: unknown): unknown {
  if (value === undefined) return "\u0000undefined";
  if (value instanceof Types.ObjectId) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalise(v)])
    );
  }
  return value;
}

async function requestMetadata(): Promise<{ ipAddress?: string; userAgent?: string }> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    return {
      ipAddress: forwarded ? forwarded.split(",")[0].trim() : undefined,
      userAgent: headerList.get("user-agent") ?? undefined,
    };
  } catch {
    // headers() is unavailable outside a request scope (scripts, tests).
    return {};
  }
}

/**
 * Records an audit entry. Never throws: losing an audit row must not roll back
 * or 500 a clinical action that already succeeded, so failures are logged to
 * the console and swallowed.
 */
export async function recordAudit(
  context: Pick<AuthenticatedUserContext, "userId"> & Partial<AuthenticatedUserContext>,
  entry: AuditEntry
): Promise<void> {
  try {
    await dbConnect();
    const meta = await requestMetadata();

    await AuditLog.create({
      actor: context.userId,
      actorName: context.email,
      actorRole: context.roleName,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      summary: entry.summary,
      changes: entry.changes,
      metadata: entry.metadata ? redactRecord(entry.metadata) : undefined,
      organizationId: context.organizationId,
      branchId: context.branchId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  } catch (error) {
    console.error("Audit log write failed:", error);
  }
}