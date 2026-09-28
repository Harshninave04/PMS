import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import defaultAuditService, { AuditService } from "@/services/audit.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export class AuditController {
    constructor(private auditService: AuditService = defaultAuditService) { }

    async getLogs(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.AUDIT_VIEW, "AuditLog");
            if (!authResult.isAuthorized) return authResult.response;

            const logs = await this.auditService.getAuditLogs();
            return NextResponse.json({ success: true, data: logs }, { status: 200 });
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to fetch audit logs" },
                { status: 500 }
            );
        }
    }

    async getSecurityEvents(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.AUDIT_VIEW, "AuditLog");
            if (!authResult.isAuthorized) return authResult.response;

            const events = await this.auditService.getSecurityEvents();
            return NextResponse.json({ success: true, data: events }, { status: 200 });
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to fetch security events" },
                { status: 500 }
            );
        }
    }
}

const auditController = new AuditController();
export default auditController;
