import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import nursingService from "@/services/nursing.service";
import { authorizeRequest } from "@/lib/rbac/guard";
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
      const data = await nursingService.createMedication(body);
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

      const body = await request.json();
      const data = await nursingService.updateMedication(id, body);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update medication record";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async deleteMedication(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_CREATE, "NursingMedication");
      if (!auth.isAuthorized) return auth.response;

      const data = await nursingService.deleteMedication(id);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete medication record";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

}

const nursingController = new NursingController();
export default nursingController;
