import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import visitService from "@/services/visit.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { isSuperAdminRole } from "@/lib/rbac/default-permissions";

function actorOf(auth: { context: { userId: Types.ObjectId; roleName: string; branchId?: Types.ObjectId }; grant: { orgScope: string } }) {
    return {
        userId: auth.context.userId,
        roleName: auth.context.roleName,
        isSuperAdmin: isSuperAdminRole(auth.context.roleName),
    };
}

function idOf(value: unknown): string {
    if (value && typeof value === "object" && "_id" in value) return String((value as { _id: unknown })._id);
    return String(value ?? "");
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

export class VisitController {
    async listVisits(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.CLINICAL_RECORD_VIEW, "ClinicalRecord");
            if (!auth.isAuthorized) return auth.response;

            const { searchParams } = new URL(request.url);
            const admissionId = searchParams.get("admissionId");
            if (!admissionId || !Types.ObjectId.isValid(admissionId)) {
                return NextResponse.json({ success: false, message: "Valid admissionId is required" }, { status: 400 });
            }
            const actor = actorOf(auth);
            let admission;
            try {
                admission = await visitService.assertActorMayAccessAdmission(admissionId, actor);
            } catch (e: unknown) {
                const err = e as { statusCode?: number; message?: string };
                return NextResponse.json({ success: false, message: err?.message ?? "Forbidden" }, { status: err?.statusCode ?? 403 });
            }
            const blocked = branchAllowed(admission, auth);
            if (blocked) return blocked;
            const data = await visitService.listVisits(admissionId);
            return NextResponse.json({ success: true, data }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch visits";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    async createVisit(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.CLINICAL_RECORD_CREATE, "ClinicalRecord");
            if (!auth.isAuthorized) return auth.response;

            const body = await request.json();
            const actor = actorOf(auth);
            let admission;
            try {
                admission = await visitService.assertActorMayAccessAdmission(body.admissionId, actor);
            } catch (e: unknown) {
                const err = e as { statusCode?: number; message?: string };
                return NextResponse.json({ success: false, message: err?.message ?? "Forbidden" }, { status: err?.statusCode ?? 403 });
            }
            const blocked = branchAllowed(admission, auth);
            if (blocked) return blocked;
            try {
                // Visits are always authored by the visiting doctor.
                const data = await visitService.createVisit(body, actor.userId);
                return NextResponse.json({ success: true, message: "Visit recorded", data }, { status: 201 });
            } catch (e: unknown) {
                const err = e as { statusCode?: number; message?: string };
                return NextResponse.json({ success: false, message: err?.message ?? "Failed" }, { status: err?.statusCode ?? 500 });
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to record visit";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    async createAddendum(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.CLINICAL_RECORD_CREATE, "ClinicalRecord");
            if (!auth.isAuthorized) return auth.response;
            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json({ success: false, message: "Invalid visit ID" }, { status: 400 });
            }
            const body = await request.json() as { text?: unknown };
            const text = typeof body.text === "string" ? body.text.trim() : "";
            if (!text) return NextResponse.json({ success: false, message: "Addendum text is required" }, { status: 400 });
            if (text.length > 4000) return NextResponse.json({ success: false, message: "Addendum must be 4,000 characters or fewer" }, { status: 400 });

            const parent = await (await import("@/models/clinical-record.model")).ClinicalRecord.findById(id)
                .select("admissionId patient recordType doctor")
                .lean();
            if (!parent || parent.recordType !== "Progress Note" || !parent.admissionId || !parent.patient) {
                return NextResponse.json({ success: false, message: "Round note not found" }, { status: 404 });
            }
            const actor = actorOf(auth);
            if (idOf(parent.doctor) !== actor.userId.toString()) {
                return NextResponse.json({ success: false, message: "Only the doctor who wrote this round can add an addendum" }, { status: 403 });
            }
            let admission;
            try {
                admission = await visitService.assertActorMayAccessAdmission(parent.admissionId, actor);
            } catch (e: unknown) {
                const err = e as { statusCode?: number; message?: string };
                return NextResponse.json({ success: false, message: err?.message ?? "Forbidden" }, { status: err?.statusCode ?? 403 });
            }
            const blocked = branchAllowed(admission, auth);
            if (blocked) return blocked;

            const timestamp = new Date();
            const { ClinicalRecord } = await import("@/models/clinical-record.model");
            const addendum = await ClinicalRecord.create({
                patient: parent.patient,
                admissionId: parent.admissionId,
                doctor: actor.userId,
                author: actor.userId,
                parentVisitId: parent._id,
                recordType: "Visit Addendum",
                text,
                timestamp,
                visitedAt: timestamp,
                dateRecorded: timestamp,
                status: "Final",
            });
            return NextResponse.json({ success: true, data: addendum, message: "Addendum appended" }, { status: 201 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to append addendum";
            console.error("[VisitController.createAddendum]", error);
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }
}

const visitController = new VisitController();
export default visitController;
