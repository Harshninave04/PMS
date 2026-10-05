import { NextRequest, NextResponse } from "next/server";
import reportsController from "@/controllers/reports.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await requirePermission(request, "reports.pharmacy:view");
  if (denied) return denied;

  return reportsController.getPharmacy(request);
}
