import { NextRequest, NextResponse } from "next/server";
import AdmissionController from "@/controllers/admission.controller";

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        return await AdmissionController.transferPatient(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to transfer patient";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

