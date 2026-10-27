import { NextRequest, NextResponse } from "next/server";
import serviceController from "@/controllers/service.controller";
import { requirePermission } from "@/lib/rbac/guard";

type Params = { params: Promise<{ id: string }> };

/**
 * @route PUT /api/service/:id
 * @desc Update a chargeable service
 */
export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "billing.rates:update");
    if (denied) return denied;

    try {
        const { id } = await params;
        return await serviceController.updateService(request, id);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to update service";
        return NextResponse.json({ success: false, message }, { status: 500 });
    }
}

/**
 * @route DELETE /api/service/:id
 * @desc Delete a chargeable service
 */
export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
    const denied = await requirePermission(request, "billing.rates:delete");
    if (denied) return denied;

    try {
        const { id } = await params;
        return await serviceController.deleteService(request, id);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to delete service";
        return NextResponse.json({ success: false, message }, { status: 500 });
    }
}
