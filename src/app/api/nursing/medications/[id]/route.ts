import { NextRequest } from "next/server";
import nursingController from "@/controllers/nursing.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requirePermission(request, "nursing.medications:update");
  if (denied) return denied;

  const { id } = await params;
  return nursingController.updateMedication(request, id);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requirePermission(request, "nursing.medications:delete");
  if (denied) return denied;

  const { id } = await params;
  return nursingController.deleteMedication(request, id);
}
