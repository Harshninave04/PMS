import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import medicationOrderService from "@/services/medication-order.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { DiscontinueOrderDto } from "@/dto/medication-order.dto";
import { isSuperAdminRole } from "@/lib/rbac/default-permissions";

function actorOf(auth: { context: { userId: Types.ObjectId; roleName: string; branchId?: Types.ObjectId }; grant: { orgScope: string } }) {
    return {
        userId: auth.context.userId,
        roleName: auth.context.roleName,
        isSuperAdmin: isSuperAdminRole(auth.context.roleName),
    };
}

function branchAllowed(
    admission: { branchId?: unknown },
    auth: { context: { branchId?: Types.ObjectId }; grant: { orgScope: string } }
): NextResponse | null {
    if (auth.grant.orgScope === "BRANCH" && auth.context.branchId) {
        const raw = admission.branchId as { _id?: { toString(): string } } | null | undefined;
        const branchStr = raw ? (raw._id?.toString?.() ?? String(raw)) : "";
        if (branchStr && branchStr !== auth.context.branchId.toString()) {
            return NextResponse.json(
                { success: false, message: "Forbidden: Admission belongs to another branch" },
                { status: 403 }
            );
        }
    }
    return null;
}

export class MedicationOrderController {
    async listOrders(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.CLINICAL_PRESCRIPTION_VIEW, "Prescription");
            if (!auth.isAuthorized) return auth.response;

            const { searchParams } = new URL(request.url);
            const admissionId = searchParams.get("admissionId");
            const status = searchParams.get("status") || undefined;
            if (!admissionId || !Types.ObjectId.isValid(admissionId)) {
                return NextResponse.json({ success: false, message: "Valid admissionId is required" }, { status: 400 });
            }
            const actor = actorOf(auth);
            let admission;
            try {
                admission = await medicationOrderService.assertActorMayAccessAdmission(admissionId, actor);
            } catch (e: unknown) {
                const err = e as { statusCode?: number; message?: string };
                return NextResponse.json({ success: false, message: err?.message ?? "Forbidden" }, { status: err?.statusCode ?? 403 });
            }
            const blocked = branchAllowed(admission, auth);
            if (blocked) return blocked;
            const data = await medicationOrderService.listOrders(admissionId, status);
            return NextResponse.json({ success: true, data }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch medication orders";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    async createOrder(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.CLINICAL_PRESCRIPTION_CREATE, "Prescription");
            if (!auth.isAuthorized) return auth.response;

            const body = await request.json();
            const actor = actorOf(auth);
            let admission;
            try {
                admission = await medicationOrderService.assertActorMayAccessAdmission(body.admissionId, actor);
            } catch (e: unknown) {
                const err = e as { statusCode?: number; message?: string };
                return NextResponse.json({ success: false, message: err?.message ?? "Forbidden" }, { status: err?.statusCode ?? 403 });
            }
            const blocked = branchAllowed(admission, auth);
            if (blocked) return blocked;
            try {
                const data = await medicationOrderService.createOrder(body, actor.userId);
                return NextResponse.json(
                    { success: true, message: `Order recorded — ${data.dosesCreated} dose(s) scheduled for the nurse`, data },
                    { status: 201 }
                );
            } catch (e: unknown) {
                const err = e as { statusCode?: number; message?: string };
                return NextResponse.json({ success: false, message: err?.message ?? "Failed" }, { status: err?.statusCode ?? 500 });
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to create medication order";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    async discontinueOrder(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.CLINICAL_PRESCRIPTION_CREATE, "Prescription");
            if (!auth.isAuthorized) return auth.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json({ success: false, message: "Invalid order ID" }, { status: 400 });
            }
            const { MedicationOrder } = await import("@/models/medication-order.model");
            const existing = await MedicationOrder.findById(id).select("admissionId").lean() as { admissionId?: unknown } | null;
            if (!existing?.admissionId) {
                return NextResponse.json({ success: false, message: "Medication order not found" }, { status: 404 });
            }
            const actor = actorOf(auth);
            let admission;
            try {
                admission = await medicationOrderService.assertActorMayAccessAdmission(existing.admissionId as Types.ObjectId, actor);
            } catch (e: unknown) {
                const err = e as { statusCode?: number; message?: string };
                return NextResponse.json({ success: false, message: err?.message ?? "Forbidden" }, { status: err?.statusCode ?? 403 });
            }
            const blocked = branchAllowed(admission, auth);
            if (blocked) return blocked;
            const body = await request.json().catch(() => ({})) as DiscontinueOrderDto;
            try {
                const data = await medicationOrderService.discontinueOrder(id, actor.userId, body.reason);
                return NextResponse.json({ success: true, message: "Order discontinued", data }, { status: 200 });
            } catch (e: unknown) {
                const err = e as { statusCode?: number; message?: string };
                return NextResponse.json({ success: false, message: err?.message ?? "Failed" }, { status: err?.statusCode ?? 500 });
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to discontinue order";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }
}

const medicationOrderController = new MedicationOrderController();
export default medicationOrderController;
