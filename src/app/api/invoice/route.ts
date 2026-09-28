import { NextRequest, NextResponse } from "next/server";
import InvoiceController from "@/controllers/invoice.controller";

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        return await InvoiceController.createInvoice(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to create invoice";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        return await InvoiceController.getInvoices(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch invoices";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
