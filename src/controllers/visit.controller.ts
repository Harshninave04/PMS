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
}

const visitController = new VisitController();
export default visitController;
