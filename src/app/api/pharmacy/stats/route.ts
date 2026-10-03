import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import PharmacyController from "@/controllers/pharmacy.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: Request) {
    const denied = await requirePermission(request, "pharmacy.medicines:view");
    if (denied) return denied;

    await dbConnect();
    return PharmacyController.getStats(request);
}
