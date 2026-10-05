import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import PharmacyController from "@/controllers/pharmacy.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: Request) {
    const denied = await requirePermission(request, "pharmacy.dispensing:view");
    if (denied) return denied;

    await dbConnect();
    return PharmacyController.getDispenses(request);
}

export async function POST(request: Request) {
    const denied = await requirePermission(request, "pharmacy.dispensing:dispense");
    if (denied) return denied;

    await dbConnect();
    return PharmacyController.createDispense(request);
}
