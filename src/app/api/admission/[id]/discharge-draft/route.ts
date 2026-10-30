import { NextRequest, NextResponse } from "next/server";
import AdmissionController from "@/controllers/admission.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await requirePermission(request, "admissions.discharge:view");
  if (denied) return denied;
  const { id } = await params;
  return AdmissionController.getDischargeDraft(id, request);
}
