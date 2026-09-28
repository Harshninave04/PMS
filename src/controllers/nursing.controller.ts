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

  // 3. Care Plans
  async getCarePlans(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_VIEW, "NursingCarePlan");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const patientId = searchParams.get("patientId") || undefined;
      const data = await nursingService.getCarePlans(patientId);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch care plans";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async createCarePlan(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_CREATE, "NursingCarePlan");
      if (!auth.isAuthorized) return auth.response;

      const body = await request.json();
      const data = await nursingService.createCarePlan(body);
      return NextResponse.json({ success: true, data }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create care plan";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updateCarePlan(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_CREATE, "NursingCarePlan");
      if (!auth.isAuthorized) return auth.response;

      const body = await request.json();
      const data = await nursingService.updateCarePlan(id, body);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update care plan";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async deleteCarePlan(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_CREATE, "NursingCarePlan");
      if (!auth.isAuthorized) return auth.response;

      const data = await nursingService.deleteCarePlan(id);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete care plan";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // 4. Tasks
  async getTasks(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_VIEW, "NursingTask");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const patientId = searchParams.get("patientId") || undefined;
      const data = await nursingService.getTasks(patientId, auth.filter);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch tasks";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async createTask(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_CREATE, "NursingTask");
      if (!auth.isAuthorized) return auth.response;

      const body = await request.json();
      const data = await nursingService.createTask(body);
      return NextResponse.json({ success: true, data }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create task";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updateTask(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_EXECUTE, "NursingTask");
      if (!auth.isAuthorized) return auth.response;

      // Enforce ASSIGNED relational constraint on specific task execution
      if (auth.grant.relScope === "ASSIGNED" && auth.context.roleName !== "SYSTEM_SUPER_ADMIN") {
        const existingTask = await nursingService.getTaskById(id);
        if (existingTask && existingTask.assignedNurse) {
          const assignedNurseId = existingTask.assignedNurse.toString();
          const currentUserId = auth.context.userId.toString();
          const currentStaffId = auth.context.staffProfileId ? auth.context.staffProfileId.toString() : null;

          if (assignedNurseId !== currentUserId && assignedNurseId !== currentStaffId) {
            return NextResponse.json(
              { success: false, message: "Forbidden: Task is assigned to another nurse" },
              { status: 403 }
            );
          }
        }
      }

      const body = await request.json();
      const data = await nursingService.updateTask(id, body);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update task";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async deleteTask(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_CREATE, "NursingTask");
      if (!auth.isAuthorized) return auth.response;

      const data = await nursingService.deleteTask(id);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete task";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // 5. Intake Output
  async getIntakeOutputs(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_VITALS_VIEW, "NursingIntakeOutput");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const patientId = searchParams.get("patientId") || undefined;
      const data = await nursingService.getIntakeOutputs(patientId);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch intake/output records";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async createIntakeOutput(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_VITALS_CREATE, "NursingIntakeOutput");
      if (!auth.isAuthorized) return auth.response;

      const body = await request.json();
      const data = await nursingService.createIntakeOutput(body);
      return NextResponse.json({ success: true, data }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create intake/output record";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async deleteIntakeOutput(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_VITALS_CREATE, "NursingIntakeOutput");
      if (!auth.isAuthorized) return auth.response;

      const data = await nursingService.deleteIntakeOutput(id);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete intake/output record";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // 6. Medications (eMAR)
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

  // 7. Handover (SBAR)
  async getHandovers(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_VIEW, "NursingHandover");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const wardId = searchParams.get("wardId") || undefined;
      const data = await nursingService.getHandovers(wardId);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch handovers";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async createHandover(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_CREATE, "NursingHandover");
      if (!auth.isAuthorized) return auth.response;

      const body = await request.json();
      const data = await nursingService.createHandover(body);
      return NextResponse.json({ success: true, data }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create handover";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updateHandover(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_CREATE, "NursingHandover");
      if (!auth.isAuthorized) return auth.response;

      const body = await request.json();
      const data = await nursingService.updateHandover(id, body);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update handover";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async deleteHandover(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.NURSING_TASK_CREATE, "NursingHandover");
      if (!auth.isAuthorized) return auth.response;

      const data = await nursingService.deleteHandover(id);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete handover";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // 8. Shifts
  async getShifts(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_VIEW, "Shift");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const wardId = searchParams.get("wardId") || undefined;
      const data = await nursingService.getShifts(wardId);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch shifts";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async createShift(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_MANAGE, "Shift");
      if (!auth.isAuthorized) return auth.response;

      const body = await request.json();
      const data = await nursingService.createShift(body);
      return NextResponse.json({ success: true, data }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create shift";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updateShift(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_MANAGE, "Shift");
      if (!auth.isAuthorized) return auth.response;

      const body = await request.json();
      const data = await nursingService.updateShift(id, body);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update shift";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async deleteShift(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.WARD_MANAGE, "Shift");
      if (!auth.isAuthorized) return auth.response;

      const data = await nursingService.deleteShift(id);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete shift";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }
}

const nursingController = new NursingController();
export default nursingController;
