import { NextRequest, NextResponse } from "next/server";
import { AppointmentController } from "@/controllers/appointment.controller";

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        return AppointmentController.create(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to create appointment";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        return AppointmentController.getAll(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch appointments";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
