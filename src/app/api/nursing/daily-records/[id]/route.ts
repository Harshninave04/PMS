import { NextRequest } from "next/server";
import nursingController from "@/controllers/nursing.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requirePermission(request, "nursing.notes:update");
  if (denied) return denied;
  const { id } = await context.params;
  return nursingController.updateDailyRecord(request, id);
}
