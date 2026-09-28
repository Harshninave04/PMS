import { NextRequest, NextResponse } from "next/server";
import InventoryController from "@/controllers/inventory.controller";

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        return await InventoryController.createInventory(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to create inventory";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        return await InventoryController.getInventories(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch inventories";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
