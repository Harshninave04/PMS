import { NextRequest, NextResponse } from "next/server";
import PatientController from "@/controllers/patient.controller";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

/** Patient lookup and quick creation used by the admission workflow. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await requirePermission(request, "admissions.new:create");
  if (denied) return denied;

  return PatientController.getPatients(request, PERMISSION_KEYS.ADMISSION_CREATE);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await requirePermission(request, "admissions.new:create");
  if (denied) return denied;

  return PatientController.createPatient(request, PERMISSION_KEYS.ADMISSION_CREATE);
}
