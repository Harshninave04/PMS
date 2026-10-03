import { NextRequest, NextResponse } from "next/server";
import FinanceController from "@/controllers/finance.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "billing.invoices:view");
    if (denied) return denied;

    return FinanceController.getStats(request);
}
