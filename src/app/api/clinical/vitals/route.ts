import { NextRequest } from "next/server";
import { ClinicalController } from "@/controllers/clinical.controller";
import dbConnect from "@/lib/dbConnect";
import { requireAnyPermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest) {
  const denied = await requireAnyPermission(request, [
    "clinical.vitals:view",
    "nursing.vitals:view",
  ]);
  if (denied) return denied;

  await dbConnect();
  return ClinicalController.getVitals(request);
}

export async function POST(request: NextRequest) {
  const denied = await requireAnyPermission(request, [
    "clinical.vitals:create",
    "nursing.vitals:create",
  ]);
  if (denied) return denied;

  await dbConnect();
  return ClinicalController.createVitals(request);
}
