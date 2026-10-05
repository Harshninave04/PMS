import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import PharmacyController from "@/controllers/pharmacy.controller";
import { requirePermission } from "@/lib/rbac/guard";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission(request, "pharmacy.categories:update");
    if (denied) return denied;

    await dbConnect();
    const resolvedParams = await params;
    return PharmacyController.updateCategory(request, { params: resolvedParams });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission(request, "pharmacy.categories:delete");
    if (denied) return denied;

    await dbConnect();
    const resolvedParams = await params;
    return PharmacyController.deleteCategory(request, { params: resolvedParams });
}
