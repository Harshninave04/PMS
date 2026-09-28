import { NextRequest, NextResponse } from "next/server";
import PrescriptionController from "@/controllers/prescription.controller";

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        return PrescriptionController.createPrescription(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to create prescription";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        return PrescriptionController.getPrescriptions(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch prescriptions";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
