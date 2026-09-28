import { NextRequest, NextResponse } from "next/server";
import { inventoryService } from "@/services/inventory.service";
import dbConnect from "@/lib/dbConnect";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(request: NextRequest) {
    try {
        await dbConnect();
        const auth = await authorizeRequest(request, PERMISSION_KEYS.INVENTORY_STOCK_VIEW, "StockTransaction");
        if (!auth.isAuthorized) return auth.response;

        const { searchParams } = new URL(request.url);
        const itemId = searchParams.get('itemId');
        const filter = itemId ? { itemId } : {};
        const transactions = await inventoryService.getStockTransactions(filter);
        return NextResponse.json(transactions);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to fetch stock transactions";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        await dbConnect();
        const auth = await authorizeRequest(request, PERMISSION_KEYS.INVENTORY_STOCK_RECEIVE, "StockTransaction");
        if (!auth.isAuthorized) return auth.response;

        const body = await request.json();
        const transaction = await inventoryService.createStockTransaction(body);
        return NextResponse.json(transaction, { status: 201 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to create stock transaction";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
