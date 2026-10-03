import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import PharmacyController from "@/controllers/pharmacy.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission(request, "pharmacy.dispensing:view");
    if (denied) return denied;

    await dbConnect();
    const resolvedParams = await params;
    return PharmacyController.getDispenseById(request, { params: resolvedParams });
}
