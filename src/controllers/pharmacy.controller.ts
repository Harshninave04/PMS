import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import PharmacyService, { PharmacyStatsRange } from "@/services/pharmacy.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export class PharmacyController {
    /**
     * Medicines doctors prescribed on ward rounds that match nothing in
     * pharmacy stock — the pharmacist's restock todo list.
     */
    static async getOrderSuggestions(req: Request | NextRequest): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_STOCK_VIEW, "Medicine");
            if (!auth.isAuthorized) return auth.response;

            const { MedicationOrder } = await import("@/models/medication-order.model");
            const { default: Medicine } = await import("@/models/medicine.model");
            await dbConnect();
            const [stock, ordered] = await Promise.all([
                Medicine.find({ isActive: { $ne: false } }).select("name").lean(),
                MedicationOrder.aggregate([
                    { $group: { _id: "$medicationName", timesOrdered: { $sum: 1 }, lastOrderedAt: { $max: "$createdAt" }, exampleDosage: { $first: "$dosage" } } },
                    { $sort: { timesOrdered: -1 } },
                    { $limit: 200 },
                ]),
            ]);
            const stockNames = (stock as Array<{ name?: string }>).map((m) => (m.name ?? "").toLowerCase());
            const matches = (orderName: string): boolean => {
                const needle = orderName.toLowerCase().trim();
                if (!needle) return true;
                return stockNames.some((stockName) => stockName.includes(needle) || needle.includes(stockName));
            };
            const suggestions = (ordered as Array<{ _id: string; timesOrdered: number; lastOrderedAt: Date; exampleDosage?: string }>)
                .filter((row) => !matches(row._id))
                .map((row) => ({ name: row._id, timesOrdered: row.timesOrdered, lastOrderedAt: row.lastOrderedAt, exampleDosage: row.exampleDosage ?? "" }));
            return NextResponse.json({ success: true, count: suggestions.length, data: suggestions }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch suggestions";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    static async getStats(req: Request | NextRequest): Promise<NextResponse> {
        try {
            const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
            const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.PHARMACY_STOCK_VIEW, "Medicine");
            if (!auth.isAuthorized) return auth.response;

            const { searchParams } = new URL(req.url);
            const range: PharmacyStatsRange = {};

            const fromParam = searchParams.get("from");
            if (fromParam) {
                const from = new Date(fromParam);
                if (!isNaN(from.getTime())) range.from = from;
            }

            const toParam = searchParams.get("to");
            if (toParam) {
                const to = new Date(toParam);
                if (!isNaN(to.getTime())) range.to = to;
            }

            const groupByParam = searchParams.get("groupBy");
            if (groupByParam === "day" || groupByParam === "week" || groupByParam === "month") {
                range.groupBy = groupByParam;
            }

            const stats = await PharmacyService.getPharmacyStats(range);
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

            const limitParam = Number(searchParams.get("limit"));
            const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined;

            const dispenses = await PharmacyService.getAllDispenses(filter, limit);
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
