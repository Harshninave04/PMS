import { NextRequest } from "next/server";
import dbConnect from "@/lib/dbConnect";
import DashboardController from "@/controllers/dashboard.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, "dashboard.main:view");
  if (denied) return denied;

  await dbConnect();
  return DashboardController.getStats(request);
}
