import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import emergencyService from "@/services/emergency.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export class EmergencyController {
  // Stats
  async getStats(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.EMERGENCY_TRIAGE_VIEW, "CasualtyRecord");
      if (!auth.isAuthorized) return auth.response;

      const stats = await emergencyService.getEmergencyStats();
      return NextResponse.json({ success: true, data: stats });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch emergency stats";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Casualty CRUD
  async createCasualty(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.EMERGENCY_CASE_MANAGE, "CasualtyRecord");
      if (!auth.isAuthorized) return auth.response;

      const data = await request.json();
      const casualty = await emergencyService.createCasualty(data);
      return NextResponse.json({ success: true, data: casualty }, { status: 201 });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create casualty";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getCasualties(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.EMERGENCY_TRIAGE_VIEW, "CasualtyRecord");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const status = searchParams.get("status");
      const priority = searchParams.get("priority");
      const isMLC = searchParams.get("isMLC");

      const filter: Record<string, unknown> = {};
      if (status && status !== "ALL") filter.status = status;
      if (priority && priority !== "ALL") filter.triagePriority = priority;
      if (isMLC !== null && isMLC !== undefined && isMLC !== "") {
        filter.isMLC = isMLC === "true";
      }

      const casualties = await emergencyService.getCasualties(filter);
      return NextResponse.json({ success: true, data: casualties });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch casualties";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getCasualtyById(
    request: NextRequest,
    params: { id: string }
  ): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.EMERGENCY_TRIAGE_VIEW, "CasualtyRecord");
      if (!auth.isAuthorized) return auth.response;

      const casualty = await emergencyService.getCasualtyById(params.id);
      if (!casualty) {
        return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: casualty });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch casualty";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updateCasualty(
    request: NextRequest,
    params: { id: string }
  ): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.EMERGENCY_CASE_MANAGE, "CasualtyRecord");
      if (!auth.isAuthorized) return auth.response;

      const data = await request.json();
      const casualty = await emergencyService.updateCasualty(params.id, data);
      return NextResponse.json({ success: true, data: casualty });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to update casualty";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async deleteCasualty(
    request: NextRequest,
    params: { id: string }
  ): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.EMERGENCY_CASE_MANAGE, "CasualtyRecord");
      if (!auth.isAuthorized) return auth.response;

      await emergencyService.deleteCasualty(params.id);
      return NextResponse.json({ success: true, message: "Deleted" });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to delete casualty";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Triage
  async createTriage(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.EMERGENCY_TRIAGE_CREATE, "EmergencyTriage");
      if (!auth.isAuthorized) return auth.response;

      const data = await request.json();
      const triage = await emergencyService.createTriage(data);
      return NextResponse.json({ success: true, data: triage }, { status: 201 });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create triage";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getTriages(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.EMERGENCY_TRIAGE_VIEW, "EmergencyTriage");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const priority = searchParams.get("priority");
      const filter: Record<string, unknown> = {};
      if (priority && priority !== "ALL") filter.priority = priority;

      const triages = await emergencyService.getTriages(filter);
      return NextResponse.json({ success: true, data: triages });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch triages";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updateTriage(
    request: NextRequest,
    params: { id: string }
  ): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.EMERGENCY_TRIAGE_UPDATE, "EmergencyTriage");
      if (!auth.isAuthorized) return auth.response;

      const data = await request.json();
      const triage = await emergencyService.updateTriage(new Types.ObjectId(params.id), data);
      return NextResponse.json({ success: true, data: triage });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to update triage";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // STAT Orders
  async createOrder(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.EMERGENCY_CASE_MANAGE, "EmergencyOrder");
      if (!auth.isAuthorized) return auth.response;

      const data = await request.json();
      const order = await emergencyService.createOrder(data);
      return NextResponse.json({ success: true, data: order }, { status: 201 });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create order";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getOrders(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.EMERGENCY_TRIAGE_VIEW, "EmergencyOrder");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const casualtyId = searchParams.get("casualtyId");
      const filter: Record<string, unknown> = {};
      if (casualtyId) filter.casualtyId = casualtyId;

      const orders = await emergencyService.getOrders(filter);
      return NextResponse.json({ success: true, data: orders });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch orders";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updateOrder(
    request: NextRequest,
    params: { id: string }
  ): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.EMERGENCY_CASE_MANAGE, "EmergencyOrder");
      if (!auth.isAuthorized) return auth.response;

      const data = await request.json();
      const order = await emergencyService.updateOrder(params.id, data);
      return NextResponse.json({ success: true, data: order });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to update order";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async deleteOrder(
    request: NextRequest,
    params: { id: string }
  ): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.EMERGENCY_CASE_MANAGE, "EmergencyOrder");
      if (!auth.isAuthorized) return auth.response;

      await emergencyService.deleteOrder(params.id);
      return NextResponse.json({ success: true, message: "Order deleted" });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to delete order";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Treatments
  async createTreatment(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.EMERGENCY_CASE_MANAGE, "EmergencyTreatment");
      if (!auth.isAuthorized) return auth.response;

      const data = await request.json();
      const treatment = await emergencyService.createTreatment(data);
      return NextResponse.json({ success: true, data: treatment }, { status: 201 });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create treatment";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getTreatments(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.EMERGENCY_TRIAGE_VIEW, "EmergencyTreatment");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const casualtyId = searchParams.get("casualtyId");
      const filter: Record<string, unknown> = {};
      if (casualtyId) filter.casualtyId = casualtyId;

      const treatments = await emergencyService.getTreatments(filter);
      return NextResponse.json({ success: true, data: treatments });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch treatments";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Consultations
  async createConsultation(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.EMERGENCY_CASE_MANAGE, "EmergencyConsultation");
      if (!auth.isAuthorized) return auth.response;

      const data = await request.json();
      const consultation = await emergencyService.createConsultation(data);
      return NextResponse.json({ success: true, data: consultation }, { status: 201 });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create consultation";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getConsultations(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.EMERGENCY_TRIAGE_VIEW, "EmergencyConsultation");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const casualtyId = searchParams.get("casualtyId");
      const filter: Record<string, unknown> = {};
      if (casualtyId) filter.casualtyId = casualtyId;

      const consultations = await emergencyService.getConsultations(filter);
      return NextResponse.json({ success: true, data: consultations });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch consultations";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Escalation / Disposition
  async processAdmission(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.EMERGENCY_CASE_MANAGE, "CasualtyRecord");
      if (!auth.isAuthorized) return auth.response;

      const { casualtyId, ...payload } = await request.json();
      const result = await emergencyService.processAdmission(casualtyId, payload);
      return NextResponse.json(result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to process admission";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async processDischarge(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.EMERGENCY_CASE_MANAGE, "CasualtyRecord");
      if (!auth.isAuthorized) return auth.response;

      const { casualtyId, ...payload } = await request.json();
      const result = await emergencyService.processDischarge(casualtyId, payload);
      return NextResponse.json(result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to process discharge";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }
}

const emergencyController = new EmergencyController();
export default emergencyController;
