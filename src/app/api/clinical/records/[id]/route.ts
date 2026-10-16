import { NextRequest } from "next/server";
import { ClinicalController } from "@/controllers/clinical.controller";
import dbConnect from "@/lib/dbConnect";
import { requireAnyPermission, requirePermission } from "@/lib/rbac/guard";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  const denied = await requirePermission(request, "clinical.consultations:update");
  if (denied) return denied;

  await dbConnect();
  const params = await context.params;
  return ClinicalController.updateRecord(request, { params });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  const denied = await requireAnyPermission(request, [
    "clinical.consultations:delete",
    "nursing.notes:delete",
  ]);
  if (denied) return denied;

  await dbConnect();
  const params = await context.params;
  return ClinicalController.deleteRecord(request, { params });
}
