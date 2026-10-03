import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import PharmacyController from "@/controllers/pharmacy.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function GET(request: Request) {
    const denied = await requirePermission(request, "pharmacy.categories:view");
    if (denied) return denied;

    await dbConnect();
    return PharmacyController.getCategories(request);
}

export async function POST(request: Request) {
    const denied = await requirePermission(request, "pharmacy.categories:create");
    if (denied) return denied;

    await dbConnect();
    return PharmacyController.createCategory(request);
}
