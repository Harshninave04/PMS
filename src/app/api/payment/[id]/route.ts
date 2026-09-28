import { NextRequest, NextResponse } from "next/server";
import PaymentController from "@/controllers/payment.controller";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
    try {
        const { id } = await params;
        return await PaymentController.getPaymentById(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch payment";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
