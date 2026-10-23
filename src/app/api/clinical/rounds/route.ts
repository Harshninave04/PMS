import { NextRequest, NextResponse } from "next/server";
import clinicalRoundController from "@/controllers/clinical-round.controller";
import { requireAnyPermission, requirePermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await requirePermission(request, "patients.profile:view");
  if (denied) return denied;
  return clinicalRoundController.readRounds(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await requireAnyPermission(request, [
    "clinical.rounds:create",
    "clinical.consultations:create",
  ]);
  if (denied) return denied;
  return clinicalRoundController.createRound(request);
}
