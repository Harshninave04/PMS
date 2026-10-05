import { NextRequest } from "next/server";
import { ClinicalController } from "@/controllers/clinical.controller";
import dbConnect from "@/lib/dbConnect";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, "clinical.consultations:view");
  if (denied) return denied;

  await dbConnect();
  return ClinicalController.getRecords(request);
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission(request, "clinical.consultations:create");
  if (denied) return denied;

  await dbConnect();
  return ClinicalController.createRecord(request);
}
