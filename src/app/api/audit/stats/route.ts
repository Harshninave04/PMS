import { NextRequest, NextResponse } from "next/server";
import auditComplianceService from "@/services/audit-compliance.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await authorizeRequest(request, PERMISSION_KEYS.AUDIT_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const stats = await auditComplianceService.getTelemetryStats();
    return NextResponse.json({ success: true, data: stats }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch audit telemetry" },
      { status: 500 }
    );
  }
}
