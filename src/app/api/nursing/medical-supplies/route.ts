import { NextRequest } from "next/server";
import nursingController from "@/controllers/nursing.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, "nursing.notes:view");
  if (denied) return denied;
  return nursingController.getMedicalSupplies(request);
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission(request, "nursing.notes:create");
  if (denied) return denied;
  return nursingController.createMedicalSupply(request);
}
