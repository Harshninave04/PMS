import { NextRequest, NextResponse } from "next/server";
import { MedicineService } from "@/services/medicine.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export class MedicineController {
    static async create(req: Request | NextRequest): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_STOCK_MANAGE, "Medicine");
            if (!auth.isAuthorized) return auth.response;

            const data = await req.json();
            const medicine = await MedicineService.create(data);
            return NextResponse.json({ success: true, data: medicine }, { status: 201 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to create medicine";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async getAll(req: Request | NextRequest): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_STOCK_VIEW, "Medicine");
            if (!auth.isAuthorized) return auth.response;

            const { searchParams } = new URL(req.url);
            const category = searchParams.get('category');
            const search = searchParams.get('search');
            
            const filter: Record<string, unknown> = {};
            if (category) filter.category = category;
            if (search) filter.name = { $regex: search, $options: 'i' };

            const medicines = await MedicineService.getAll(filter);
            return NextResponse.json({ success: true, count: medicines.length, data: medicines }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch medicines";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async getById(
        req: Request | NextRequest,
        { params }: { params: { id: string } | Promise<{ id: string }> }
    ): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_STOCK_VIEW, "Medicine");
            if (!auth.isAuthorized) return auth.response;

            const resolvedParams = await params;
            const medicine = await MedicineService.getById(resolvedParams.id);
            if (!medicine) {
                return NextResponse.json({ success: false, message: 'Medicine not found' }, { status: 404 });
            }
            return NextResponse.json({ success: true, data: medicine }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch medicine";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async update(
        req: Request | NextRequest,
        { params }: { params: { id: string } | Promise<{ id: string }> }
    ): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_STOCK_MANAGE, "Medicine");
            if (!auth.isAuthorized) return auth.response;

            const resolvedParams = await params;
            const data = await req.json();
            const medicine = await MedicineService.update(resolvedParams.id, data);
            if (!medicine) {
                return NextResponse.json({ success: false, message: 'Medicine not found' }, { status: 404 });
            }
            return NextResponse.json({ success: true, data: medicine }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to update medicine";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async delete(
        req: Request | NextRequest,
        { params }: { params: { id: string } | Promise<{ id: string }> }
    ): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_STOCK_MANAGE, "Medicine");
            if (!auth.isAuthorized) return auth.response;

            const resolvedParams = await params;
            const medicine = await MedicineService.delete(resolvedParams.id);
            if (!medicine) {
                return NextResponse.json({ success: false, message: 'Medicine not found' }, { status: 404 });
            }
            return NextResponse.json({ success: true, data: medicine }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to delete medicine";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }
}
