import { NextRequest, NextResponse } from "next/server";
import serviceController from "@/controllers/service.controller";
import { requirePermission } from "@/lib/rbac/guard";

/**
 * @route GET /api/service
 * @desc List chargeable services (query: active, q, category)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "billing.rates:view");
    if (denied) return denied;

    try {
        return await serviceController.getServices(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch services";
        return NextResponse.json({ success: false, message }, { status: 500 });
    }
}

/**
 * @route POST /api/service
 * @desc Create a chargeable service
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "billing.rates:create");
    if (denied) return denied;

    try {
        return await serviceController.createService(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to create service";
        return NextResponse.json({ success: false, message }, { status: 500 });
    }
}
