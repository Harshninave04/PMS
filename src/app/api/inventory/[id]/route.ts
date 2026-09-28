import { NextRequest, NextResponse } from "next/server";
import InventoryController from "@/controllers/inventory.controller";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
    try {
        const { id } = await params;
        return await InventoryController.getInventoryById(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch inventory";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
    try {
        const { id } = await params;
        return await InventoryController.updateInventory(request, id);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to update inventory";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
    try {
        const { id } = await params;
        return await InventoryController.deleteInventory(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to delete inventory";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
