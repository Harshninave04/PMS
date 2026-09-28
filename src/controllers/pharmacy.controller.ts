import { NextRequest, NextResponse } from "next/server";
import PharmacyService from "@/services/pharmacy.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export class PharmacyController {
    static async getStats(req: Request | NextRequest): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_STOCK_VIEW, "Medicine");
            if (!auth.isAuthorized) return auth.response;

            const stats = await PharmacyService.getPharmacyStats();
            return NextResponse.json({ success: true, data: stats }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch stats";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async getDispenses(req: Request | NextRequest): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_PRESCRIPTION_VIEW, "Dispense");
            if (!auth.isAuthorized) return auth.response;

            const { searchParams } = new URL(req.url);
            const status = searchParams.get("status");
            const filter: Record<string, unknown> = {};
            if (status) filter.paymentStatus = status;

            const dispenses = await PharmacyService.getAllDispenses(filter);
            return NextResponse.json({ success: true, count: dispenses.length, data: dispenses }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch dispenses";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async createDispense(req: Request | NextRequest): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_DISPENSE_CREATE, "Dispense");
            if (!auth.isAuthorized) return auth.response;

            const body = await req.json();
            const dispense = await PharmacyService.createDispense(body);
            return NextResponse.json({ success: true, data: dispense }, { status: 201 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to create dispense";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async getDispenseById(
        req: Request | NextRequest,
        { params }: { params: { id: string } | Promise<{ id: string }> }
    ): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_PRESCRIPTION_VIEW, "Dispense");
            if (!auth.isAuthorized) return auth.response;

            const resolvedParams = await params;
            const dispense = await PharmacyService.getDispenseById(resolvedParams.id);
            if (!dispense) {
                return NextResponse.json({ success: false, message: "Dispense not found" }, { status: 404 });
            }
            return NextResponse.json({ success: true, data: dispense }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch dispense";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async getReturns(req: Request | NextRequest): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_DISPENSE_CREATE, "Dispense");
            if (!auth.isAuthorized) return auth.response;

            const returns = await PharmacyService.getAllReturns();
            return NextResponse.json({ success: true, data: returns }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch returns";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async createReturn(req: Request | NextRequest): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_DISPENSE_CREATE, "Dispense");
            if (!auth.isAuthorized) return auth.response;

            const body = await req.json();
            const ret = await PharmacyService.createReturn(body);
            return NextResponse.json({ success: true, data: ret }, { status: 201 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to create return";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async adjustStock(req: Request | NextRequest): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_STOCK_MANAGE, "Medicine");
            if (!auth.isAuthorized) return auth.response;

            const body = await req.json();
            const { medicineId, quantityChange, notes } = body;
            if (!medicineId || quantityChange === undefined) {
                return NextResponse.json({ success: false, message: "medicineId and quantityChange required" }, { status: 400 });
            }
            const updated = await PharmacyService.adjustStock(medicineId, Number(quantityChange), notes);
            return NextResponse.json({ success: true, data: updated }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to adjust stock";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async getCategories(req: Request | NextRequest): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_STOCK_VIEW, "Medicine");
            if (!auth.isAuthorized) return auth.response;

            const categories = await PharmacyService.getAllCategories();
            return NextResponse.json({ success: true, data: categories }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch categories";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async createCategory(req: Request | NextRequest): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_STOCK_MANAGE, "Medicine");
            if (!auth.isAuthorized) return auth.response;

            const body = await req.json();
            const category = await PharmacyService.createCategory(body);
            return NextResponse.json({ success: true, data: category }, { status: 201 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to create category";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async updateCategory(
        req: Request | NextRequest,
        { params }: { params: { id: string } | Promise<{ id: string }> }
    ): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_STOCK_MANAGE, "Medicine");
            if (!auth.isAuthorized) return auth.response;

            const resolvedParams = await params;
            const body = await req.json();
            const category = await PharmacyService.updateCategory(resolvedParams.id, body);
            return NextResponse.json({ success: true, data: category }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to update category";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async deleteCategory(
        req: Request | NextRequest,
        { params }: { params: { id: string } | Promise<{ id: string }> }
    ): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_STOCK_MANAGE, "Medicine");
            if (!auth.isAuthorized) return auth.response;

            const resolvedParams = await params;
            await PharmacyService.deleteCategory(resolvedParams.id);
            return NextResponse.json({ success: true, message: "Category deleted" }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to delete category";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async getSuppliers(req: Request | NextRequest): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_STOCK_VIEW, "Medicine");
            if (!auth.isAuthorized) return auth.response;

            const suppliers = await PharmacyService.getAllSuppliers();
            return NextResponse.json({ success: true, data: suppliers }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch suppliers";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async createSupplier(req: Request | NextRequest): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_STOCK_MANAGE, "Medicine");
            if (!auth.isAuthorized) return auth.response;

            const body = await req.json();
            const supplier = await PharmacyService.createSupplier(body);
            return NextResponse.json({ success: true, data: supplier }, { status: 201 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to create supplier";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async updateSupplier(
        req: Request | NextRequest,
        { params }: { params: { id: string } | Promise<{ id: string }> }
    ): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_STOCK_MANAGE, "Medicine");
            if (!auth.isAuthorized) return auth.response;

            const resolvedParams = await params;
            const body = await req.json();
            const supplier = await PharmacyService.updateSupplier(resolvedParams.id, body);
            return NextResponse.json({ success: true, data: supplier }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to update supplier";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async deleteSupplier(
        req: Request | NextRequest,
        { params }: { params: { id: string } | Promise<{ id: string }> }
    ): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_STOCK_MANAGE, "Medicine");
            if (!auth.isAuthorized) return auth.response;

            const resolvedParams = await params;
            await PharmacyService.deleteSupplier(resolvedParams.id);
            return NextResponse.json({ success: true, message: "Supplier deleted" }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to delete supplier";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async getExpiryAnalysis(req: Request | NextRequest): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_STOCK_VIEW, "Medicine");
            if (!auth.isAuthorized) return auth.response;

            const analysis = await PharmacyService.getExpiryAnalysis();
            return NextResponse.json({ success: true, data: analysis }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch expiry analysis";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }
}

export default PharmacyController;
