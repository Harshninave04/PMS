import { NextRequest, NextResponse } from "next/server";
import { ClinicalController } from "@/controllers/clinical.controller";
import dbConnect from "@/lib/dbConnect";
import { requirePermission } from "@/lib/rbac/guard";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  const denied = await requirePermission(request, "clinical.vitals:delete");
  if (denied) return denied;

  await dbConnect();
  const params = await context.params;
  return ClinicalController.deleteVitals(request, { params });
}
