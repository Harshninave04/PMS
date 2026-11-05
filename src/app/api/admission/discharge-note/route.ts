import { NextRequest, NextResponse } from "next/server";
import AdmissionController from "@/controllers/admission.controller";
import { authorizeRequest } from "@/lib/rbac/guard";
import { nurseNotesForbiddenStatus } from "@/lib/nurse-notes-access";

export async function POST(request: NextRequest): Promise<NextResponse> {
    const auth = await authorizeRequest(request, "nursing.patients:update", "Admission");
    if (!auth.isAuthorized) return auth.response;
    const forbiddenStatus = nurseNotesForbiddenStatus(auth.context.roleName);
    if (forbiddenStatus) {
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: forbiddenStatus });
    }
    try {
        return await AdmissionController.addDischargeNote(request);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to add the discharge note";
        return NextResponse.json({
            success: false,
            message
        }, { status: 500 });
    }
}
