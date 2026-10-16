import { NextRequest, NextResponse } from "next/server";
import WardController from "@/controllers/ward.controller";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

/** Ward list and live availability counts for admission placement. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await requirePermission(request, "admissions.new:create");
  if (denied) return denied;

  return WardController.getAdmissionWards(request, PERMISSION_KEYS.ADMISSION_CREATE);
}
