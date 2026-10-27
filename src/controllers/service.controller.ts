import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import Service from "@/models/service.model";
import { CreateServiceDto, UpdateServiceDto } from "@/dto/service.dto";
import { requirePermission } from "@/lib/rbac/guard";

/**
 * Chargeable service master (Billing > Rates).
 *
 * The Create Bill description field autocompletes over `active` services;
 * saving a bill still snapshots name + rate, so these documents are safe to
 * edit or deactivate at any time.
 */
export class ServiceController {
    // GET /api/service?active=true&q=nursing
    async getServices(request: NextRequest): Promise<NextResponse> {
        const denied = await requirePermission(request, "billing.rates:view");
        if (denied) return denied;

        try {
            await dbConnect();
            const { searchParams } = new URL(request.url);
            const query: Record<string, unknown> = {};
            if (searchParams.get("active") === "true") query.active = true;
            const search = (searchParams.get("q") ?? "").trim();
            if (search) query.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
            const category = (searchParams.get("category") ?? "").trim();
            if (category) query.category = category;

            const services = await Service.find(query)
                .sort({ category: 1, name: 1 })
                .limit(500)
                .lean();

            return NextResponse.json(
                { success: true, count: services.length, data: services },
                { status: 200 }
            );
        } catch (error) {
            const err = error as { stack?: string; message?: string };
            console.error("[ServiceController.getServices] Unexpected error:", err?.stack || error);
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to fetch services" },
                { status: 500 }
            );
        }
    }

    async createService(request: NextRequest): Promise<NextResponse> {
        const denied = await requirePermission(request, "billing.rates:create");
        if (denied) return denied;

        try {
            await dbConnect();
            const raw = (await request.json()) as Partial<CreateServiceDto>;
            const name = typeof raw.name === "string" ? raw.name.trim() : "";
            const category = typeof raw.category === "string" && raw.category.trim()
                ? raw.category.trim().slice(0, 60)
                : "General";
            const rate = Number(raw.defaultRate);

            if (!name || name.length > 100) {
                return NextResponse.json(
                    { success: false, message: "Service name is required (max 100 characters)" },
                    { status: 400 }
                );
            }
            if (!Number.isFinite(rate) || rate < 0) {
                return NextResponse.json(
                    { success: false, message: "Default rate must be zero or a positive number" },
                    { status: 400 }
                );
            }

            const exists = await Service.findOne({ name }).lean();
            if (exists) {
                return NextResponse.json(
                    { success: false, message: `Service "${name}" already exists` },
                    { status: 409 }
                );
            }

            const service = await Service.create({ name, category, defaultRate: rate, active: raw.active !== false });
            return NextResponse.json(
                { success: true, message: "Service created successfully", data: service },
                { status: 201 }
            );
        } catch (error) {
            const err = error as {
                code?: number;
                name?: string;
                keyValue?: { name?: unknown };
                stack?: string;
                message?: string;
            };
            if (err?.code === 11000) {
                return NextResponse.json(
                    { success: false, message: `Service ${String(err.keyValue?.name || "")} already exists` },
                    { status: 409 }
                );
            }
            if (err?.name === "ValidationError" || err?.name === "CastError") {
                return NextResponse.json({ success: false, message: err?.message || "Invalid service details" }, { status: 400 });
            }
            console.error("[ServiceController.createService] Unexpected error:", err?.stack || error);
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to create service" },
                { status: 500 }
            );
        }
    }

    async updateService(request: NextRequest, id: string): Promise<NextResponse> {
        const denied = await requirePermission(request, "billing.rates:update");
        if (denied) return denied;

        try {
            await dbConnect();
            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json({ success: false, message: "Invalid service ID" }, { status: 400 });
            }

            const raw = (await request.json()) as Partial<UpdateServiceDto>;
            const data: Record<string, unknown> = {};
            if (raw.name !== undefined) {
                const name = String(raw.name).trim();
                if (!name || name.length > 100) {
                    return NextResponse.json({ success: false, message: "Service name is required (max 100 characters)" }, { status: 400 });
                }
                data.name = name;
            }
            if (raw.category !== undefined) data.category = String(raw.category).trim().slice(0, 60) || "General";
            if (raw.defaultRate !== undefined) {
                const rate = Number(raw.defaultRate);
                if (!Number.isFinite(rate) || rate < 0) {
                    return NextResponse.json({ success: false, message: "Default rate must be zero or a positive number" }, { status: 400 });
                }
                data.defaultRate = rate;
            }
            if (raw.active !== undefined) data.active = Boolean(raw.active);

            const service = await Service.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
            if (!service) {
                return NextResponse.json({ success: false, message: "Service not found" }, { status: 404 });
            }

            return NextResponse.json(
                { success: true, message: "Service updated successfully", data: service },
                { status: 200 }
            );
        } catch (error) {
            const err = error as { code?: number; name?: string; message?: string; stack?: string };
            if (err?.code === 11000) {
                return NextResponse.json({ success: false, message: "A service with that name already exists" }, { status: 409 });
            }
            console.error("[ServiceController.updateService] Unexpected error:", err?.stack || error);
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to update service" },
                { status: 500 }
            );
        }
    }

    async deleteService(request: NextRequest, id: string): Promise<NextResponse> {
        const denied = await requirePermission(request, "billing.rates:delete");
        if (denied) return denied;

        try {
            await dbConnect();
            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json({ success: false, message: "Invalid service ID" }, { status: 400 });
            }
            const service = await Service.findByIdAndDelete(id).lean();
            if (!service) {
                return NextResponse.json({ success: false, message: "Service not found" }, { status: 404 });
            }
            return NextResponse.json(
                { success: true, message: "Service deleted successfully" },
                { status: 200 }
            );
        } catch (error) {
            const err = error as { stack?: string; message?: string };
            console.error("[ServiceController.deleteService] Unexpected error:", err?.stack || error);
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to delete service" },
                { status: 500 }
            );
        }
    }
}

const serviceController = new ServiceController();
export default serviceController;
