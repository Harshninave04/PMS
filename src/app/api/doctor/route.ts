import { NextRequest, NextResponse } from "next/server";
import DoctorController from "@/controllers/doctor.controller";
import { requirePermission } from "@/lib/rbac/guard";

/**
 * @route POST /api/doctor
 * @desc Create a new doctor
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "admin.doctors:create");
    if (denied) return denied;

    try {
        return DoctorController.createDoctor(request);
    } catch (e: any) {
        return NextResponse.json({
            success: false,
            message: e?.message || "Failed to create doctor"
        }, { status: 500 });
    }
}


/**
 * @route GET /api/doctor
 * @desc Get all doctors (supports ?departmentId=...)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, null);
    if (denied) return denied;

    try {
        return DoctorController.getDoctors(request);
    } catch (e: any) {
        return NextResponse.json({
            success: false,
            message: e?.message || "Failed to fetch doctors"
        }, { status: 500 });
    }
}
