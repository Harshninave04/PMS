import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import AuditLog from "@/models/audit-log.model";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

const MAX_PAGE_SIZE = 200;

/**
 * Reads the audit trail. The trail is append-only and administrator-only:
 * AUDIT_VIEW is granted to no staff role, so a nurse or receptionist cannot
 * see who else looked at a patient's chart.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        await dbConnect();

        const auth = await authorizeRequest(request, PERMISSION_KEYS.AUDIT_VIEW, "AuditLog");
        if (!auth.isAuthorized) return auth.response;

        const { searchParams } = new URL(request.url);
        const entity = searchParams.get("entity") || undefined;
        const entityId = searchParams.get("entityId") || undefined;
        const actor = searchParams.get("actor") || undefined;
        const action = searchParams.get("action") || undefined;
        const from = searchParams.get("from");
        const to = searchParams.get("to");

        const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
        const limit = Math.min(
            MAX_PAGE_SIZE,
            Math.max(1, Number.parseInt(searchParams.get("limit") ?? "50", 10) || 50)
        );

        const filter: Record<string, unknown> = {};
        if (entity) filter.entity = entity.toLowerCase();
        if (entityId) filter.entityId = entityId;
        if (action) filter.action = action.toUpperCase();
        if (actor) {
            if (!/^[a-f\d]{24}$/i.test(actor)) {
                return NextResponse.json({ success: false, message: "Invalid actor ID" }, { status: 400 });
            }
            filter.actor = actor;
        }
        if (from || to) {
            const range: Record<string, Date> = {};
            if (from) {
                const parsed = new Date(from);
                if (Number.isNaN(parsed.getTime())) {
                    return NextResponse.json({ success: false, message: "Invalid from date" }, { status: 400 });
                }
                range.$gte = parsed;
            }
            if (to) {
                const parsed = new Date(to);
                if (Number.isNaN(parsed.getTime())) {
                    return NextResponse.json({ success: false, message: "Invalid to date" }, { status: 400 });
                }
                range.$lte = parsed;
            }
            filter.createdAt = range;
        }

        const [entries, total] = await Promise.all([
            AuditLog.find(filter)
                .populate("actor", "name email roleName")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            AuditLog.countDocuments(filter),
        ]);

        return NextResponse.json(
            { success: true, count: entries.length, total, page, limit, data: entries },
            { status: 200 }
        );
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to fetch audit log";
        return NextResponse.json({ success: false, message }, { status: 500 });
    }
}