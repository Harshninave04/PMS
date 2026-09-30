import { NextRequest, NextResponse } from "next/server";
import auditComplianceService from "@/services/audit-compliance.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await authorizeRequest(request, PERMISSION_KEYS.AUDIT_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { searchParams } = new URL(request.url);
    const framework = searchParams.get("framework") || undefined;

    const reports = await auditComplianceService.getComplianceReports(framework);
    return NextResponse.json({ success: true, data: reports }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch compliance reports" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = await authorizeRequest(request, PERMISSION_KEYS.AUDIT_EXPORT);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const body = await request.json();
    const report = await auditComplianceService.createComplianceReport(body);
    return NextResponse.json({ success: true, data: report }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to create compliance report" },
      { status: 500 }
    );
  }
}
