import { NextRequest, NextResponse } from "next/server";
import BedController from "@/controllers/bed.controller";

type Params = { params: Promise<{ id: string }> };

/**
 * @route GET /api/bed/:id
 * @desc Get a bed by ID
 */
export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
    try {
        const { id } = await params;
        return await BedController.getBedById(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to fetch bed";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

/**
 * @route PUT /api/bed/:id
 * @desc Update a bed by ID
 */
export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
    try {
        const { id } = await params;
        return await BedController.updateBed(request, id);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to update bed";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}

/**
 * @route DELETE /api/bed/:id
 * @desc Delete a bed by ID
 */
export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
    try {
        const { id } = await params;
        return await BedController.deleteBed(id, request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to delete bed";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
