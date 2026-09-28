import { NextRequest, NextResponse } from "next/server";
import AdmissionController from "@/controllers/admission.controller";

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        return AdmissionController.createAdmission(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to create admission";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        return AdmissionController.getAdmissions(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch admissions";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
