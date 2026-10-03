import { NextRequest } from "next/server";
import { ClinicalController } from "@/controllers/clinical.controller";
import dbConnect from "@/lib/dbConnect";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, "clinical.consultations:view");
  if (denied) return denied;

  await dbConnect();
  return ClinicalController.getClinicalStats(request);
}
