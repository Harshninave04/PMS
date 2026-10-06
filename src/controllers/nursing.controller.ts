import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import nursingService from "@/services/nursing.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { recordAudit, diffRecords } from "@/services/audit.service";
import { PERMISSION_KEYS } from "@/types/rbac";

export class NursingController {
  // 1. My Inpatients
  async getMyPatients(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_VIEW, "Admission");
      if (!auth.isAuthorized) return auth.response;

      const data = await nursingService.getMyPatients(auth.filter);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch inpatients";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // 2. Nursing Stats
  async getNursingStats(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_VIEW, "Admission");
      if (!auth.isAuthorized) return auth.response;

      const data = await nursingService.getNursingStats();
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch nursing stats";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // 3. Medications (eMAR)
  async getMedications(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_VIEW, "NursingMedication");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const patientId = searchParams.get("patientId") || undefined;
      const data = await nursingService.getMedications(patientId);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch medication records";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async createMedication(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_EXECUTE, "NursingMedication");
      if (!auth.isAuthorized) return auth.response;

      const body = await request.json();
      const data = await nursingService.createMedication(body, auth.context.userId.toString());

      await recordAudit(auth.context, {
        action: "CREATE",
        entity: "nursing-medication",
        entityId: data?._id?.toString(),
        summary: "Medication round recorded",
        // Drug names and dosages are clinical detail and stay out of the trail.
        metadata: { patientId: body?.patientId ?? null, admissionId: body?.admissionId ?? null },
      });

      return NextResponse.json({ success: true, data }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create medication record";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updateMedication(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_EXECUTE, "NursingMedication");
      if (!auth.isAuthorized) return auth.response;

      if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json({ success: false, message: "Invalid medication ID" }, { status: 400 });
      }

      const existing = await nursingService.getMedicationById(id);
      if (!existing) {
        return NextResponse.json({ success: false, message: "Medication record not found" }, { status: 404 });
      }

      const body = await request.json();
      const data = await nursingService.updateMedication(id, body);

      await recordAudit(auth.context, {
        action: "UPDATE",
        entity: "nursing-medication",
        entityId: id,
        summary: `Medication record ${id} updated`,
        changes: diffRecords(
          existing.toObject() as Record<string, unknown>,
          data?.toObject() as Record<string, unknown>
        ),
      });

      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update medication record";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async deleteMedication(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_EXECUTE, "NursingMedication");
      if (!auth.isAuthorized) return auth.response;

      if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json({ success: false, message: "Invalid medication ID" }, { status: 400 });
      }

      const existing = await nursingService.getMedicationById(id);
      if (!existing) {
        return NextResponse.json({ success: false, message: "Medication record not found" }, { status: 404 });
      }

      const data = await nursingService.deleteMedication(id);

      await recordAudit(auth.context, {
        action: "DELETE",
        entity: "nursing-medication",
        entityId: id,
        summary: `Medication record ${id} removed`,
        metadata: { patientId: existing.patient ?? null },
      });

      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete medication record";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

}

const nursingController = new NursingController();
export default nursingController;
