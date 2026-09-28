import { NextRequest, NextResponse } from "next/server";
import PaymentController from "@/controllers/payment.controller";

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        return await PaymentController.createPayment(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to create payment";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        return await PaymentController.getPayments(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch payments";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
