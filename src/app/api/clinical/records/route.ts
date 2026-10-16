import { NextRequest } from "next/server";
import { ClinicalController } from "@/controllers/clinical.controller";
import dbConnect from "@/lib/dbConnect";
import { requireAnyPermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest) {
  const denied = await requireAnyPermission(request, [
    "clinical.consultations:view",
    "nursing.notes:view",
  ]);
  if (denied) return denied;

  await dbConnect();
  return ClinicalController.getRecords(request);
}

export async function POST(request: NextRequest) {
  const denied = await requireAnyPermission(request, [
    "clinical.consultations:create",
    "nursing.notes:create",
  ]);
  if (denied) return denied;

  await dbConnect();
  return ClinicalController.createRecord(request);
}
