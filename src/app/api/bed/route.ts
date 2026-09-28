import { NextRequest, NextResponse } from "next/server";
import BedController from "@/controllers/bed.controller";

/**
 * @route POST /api/bed
 * @desc Create a new bed
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        return await BedController.createBed(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to create bed";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

/**
 * @route GET /api/bed
 * @desc Get all beds (supports ?roomId=...)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        return await BedController.getBeds(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch beds";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
