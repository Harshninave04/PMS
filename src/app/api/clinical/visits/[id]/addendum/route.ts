import { NextRequest, NextResponse } from "next/server";
import visitController from "@/controllers/visit.controller";
import { requireAnyPermission } from "@/lib/rbac/guard";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const denied = await requireAnyPermission(request, [
    "clinical.rounds:create",
    "clinical.consultations:create",
  ]);
  if (denied) return denied;
  const { id } = await context.params;
  return visitController.createAddendum(request, id);
}
