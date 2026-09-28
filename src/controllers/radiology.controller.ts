import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import radiologyService from "@/services/radiology.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

function extractEntityId(field: unknown): string | null {
  if (!field) return null;
  if (typeof field === "object" && field !== null && "_id" in field) {
    const idVal = (field as { _id?: unknown })._id;
    return idVal ? String(idVal) : null;
  }
  return String(field);
}

interface PopulatedPatient {
  _id?: unknown;
  branchId?: unknown;
  [key: string]: unknown;
}

interface PopulatedRadiologyOrder {
  _id?: unknown;
  doctor?: unknown;
  patient?: PopulatedPatient;
  [key: string]: unknown;
}

export class RadiologyController {
  // --- ORDERS ---
  async getOrders(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.RADIOLOGY_ORDER_VIEW, "RadiologyOrder");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const status = searchParams.get("status") || undefined;
      const priority = searchParams.get("priority") || undefined;
      const modality = searchParams.get("modality") || undefined;
      const patient = searchParams.get("patient") || undefined;
      const accessionNumber = searchParams.get("accessionNumber") || undefined;

      let data = (await radiologyService.getOrders({
        status,
        priority,
        modality,
        patient,
        accessionNumber
      })) as unknown as PopulatedRadiologyOrder[];

      // Relational check: Doctor with OWN scope sees only their orders
      if (auth.grant.relScope === "OWN") {
        const myDoctorId = (auth.context.doctorProfileId || auth.context.userId).toString();
        data = data.filter((ord) => extractEntityId(ord.doctor) === myDoctorId);
      }

      // Organizational boundary: Branch user sees only their branch
      if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
        const userBranch = auth.context.branchId.toString();
        data = data.filter((ord) => {
          const patientBranch = extractEntityId(ord.patient?.branchId);
          return !patientBranch || patientBranch === userBranch;
        });
      }

      return NextResponse.json({ success: true, count: data.length, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch radiology orders";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async createOrder(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.RADIOLOGY_ORDER_CREATE, "RadiologyOrder");
      if (!auth.isAuthorized) return auth.response;

      const body = (await request.json()) as Record<string, unknown>;

      if (auth.grant.relScope === "OWN" && auth.context.doctorProfileId) {
        body.doctor = auth.context.doctorProfileId.toString();
      }

      const data = await radiologyService.createOrder(body);
      return NextResponse.json({ success: true, data }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create radiology order";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getOrder(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.RADIOLOGY_ORDER_VIEW, "RadiologyOrder");
      if (!auth.isAuthorized) return auth.response;

      const { id } = await params;
      const data = (await radiologyService.getOrderById(id)) as unknown as PopulatedRadiologyOrder | null;
      if (!data) return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });

      if (auth.grant.relScope === "OWN") {
        const orderDocId = extractEntityId(data.doctor);
        const myDoctorId = (auth.context.doctorProfileId || auth.context.userId).toString();
        if (orderDocId !== myDoctorId) {
          return NextResponse.json({ success: false, message: "Forbidden: Access restricted to your own orders" }, { status: 403 });
        }
      }

      if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
        const patientBranch = extractEntityId(data.patient?.branchId);
        if (patientBranch && patientBranch !== auth.context.branchId.toString()) {
          return NextResponse.json({ success: false, message: "Forbidden: Order belongs to another branch" }, { status: 403 });
        }
      }

      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch radiology order";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updateOrder(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.RADIOLOGY_ORDER_CREATE, "RadiologyOrder");
      if (!auth.isAuthorized) return auth.response;

      const { id } = await params;
      const existing = (await radiologyService.getOrderById(id)) as unknown as PopulatedRadiologyOrder | null;
      if (!existing) return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });

      if (auth.grant.relScope === "OWN") {
        const orderDocId = extractEntityId(existing.doctor);
        const myDoctorId = (auth.context.doctorProfileId || auth.context.userId).toString();
        if (orderDocId !== myDoctorId) {
          return NextResponse.json({ success: false, message: "Forbidden: You can only update your own orders" }, { status: 403 });
        }
      }

      if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
        const patientBranch = extractEntityId(existing.patient?.branchId);
        if (patientBranch && patientBranch !== auth.context.branchId.toString()) {
          return NextResponse.json({ success: false, message: "Forbidden: Order belongs to another branch" }, { status: 403 });
        }
      }

      const body = await request.json();
      const data = await radiologyService.updateOrder(id, body);
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update radiology order";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async deleteOrder(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.RADIOLOGY_ORDER_CREATE, "RadiologyOrder");
      if (!auth.isAuthorized) return auth.response;

      const { id } = await params;
      const existing = (await radiologyService.getOrderById(id)) as unknown as PopulatedRadiologyOrder | null;
      if (!existing) return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });

      if (auth.grant.relScope === "OWN") {
        const orderDocId = extractEntityId(existing.doctor);
        const myDoctorId = (auth.context.doctorProfileId || auth.context.userId).toString();
        if (orderDocId !== myDoctorId) {
          return NextResponse.json({ success: false, message: "Forbidden: You can only delete your own orders" }, { status: 403 });
        }
      }

      if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
        const patientBranch = extractEntityId(existing.patient?.branchId);
        if (patientBranch && patientBranch !== auth.context.branchId.toString()) {
          return NextResponse.json({ success: false, message: "Forbidden: Order belongs to another branch" }, { status: 403 });
        }
      }

      await radiologyService.deleteOrder(id);
      return NextResponse.json({ success: true, data: {} });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete radiology order";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // --- PROCEDURES / CATALOG ---
  async getProcedures(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.RADIOLOGY_ORDER_VIEW, "RadiologyProcedure");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const modality = searchParams.get("modality") || undefined;
      const search = searchParams.get("search") || undefined;

      const data = await radiologyService.getProcedures({ modality, search });
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch procedures";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async createProcedure(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.RADIOLOGY_ORDER_CREATE, "RadiologyProcedure");
      if (!auth.isAuthorized) return auth.response;

      const body = await request.json();
      const data = await radiologyService.createProcedure(body);
      return NextResponse.json({ success: true, data }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create procedure";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getProcedure(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.RADIOLOGY_ORDER_VIEW, "RadiologyProcedure");
      if (!auth.isAuthorized) return auth.response;

      const { id } = await params;
      const data = await radiologyService.getProcedureById(id);
      if (!data) return NextResponse.json({ success: false, message: "Procedure not found" }, { status: 404 });
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch procedure";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updateProcedure(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.RADIOLOGY_ORDER_CREATE, "RadiologyProcedure");
      if (!auth.isAuthorized) return auth.response;

      const { id } = await params;
      const body = await request.json();
      const data = await radiologyService.updateProcedure(id, body);
      if (!data) return NextResponse.json({ success: false, message: "Procedure not found" }, { status: 404 });
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update procedure";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async deleteProcedure(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.RADIOLOGY_ORDER_CREATE, "RadiologyProcedure");
      if (!auth.isAuthorized) return auth.response;

      const { id } = await params;
      await radiologyService.deleteProcedure(id);
      return NextResponse.json({ success: true, data: {} });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete procedure";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // --- STUDIES & PACS ---
  async getStudies(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.RADIOLOGY_ORDER_VIEW, "RadiologyStudy");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const status = searchParams.get("status") || undefined;
      const modality = searchParams.get("modality") || undefined;
      const order = searchParams.get("order") || undefined;
      const accessionNumber = searchParams.get("accessionNumber") || undefined;

      const data = await radiologyService.getStudies({ status, modality, order, accessionNumber });
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch studies";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getStudy(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.RADIOLOGY_ORDER_VIEW, "RadiologyStudy");
      if (!auth.isAuthorized) return auth.response;

      const { id } = await params;
      const data = await radiologyService.getStudyById(id);
      if (!data) return NextResponse.json({ success: false, message: "Study not found" }, { status: 404 });
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch study";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updateStudy(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
    try {
      await dbConnect();
      let auth = await authorizeRequest(request, PERMISSION_KEYS.RADIOLOGY_STUDY_PERFORM, "RadiologyStudy");
      if (!auth.isAuthorized) {
        auth = await authorizeRequest(request, PERMISSION_KEYS.RADIOLOGY_REPORT_VERIFY, "RadiologyStudy");
        if (!auth.isAuthorized) return auth.response;
      }

      const { id } = await params;
      const body = await request.json();
      const data = await radiologyService.updateStudy(id, body);
      if (!data) return NextResponse.json({ success: false, message: "Study not found" }, { status: 404 });
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update study";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async deleteStudy(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.RADIOLOGY_ORDER_CREATE, "RadiologyStudy");
      if (!auth.isAuthorized) return auth.response;

      const { id } = await params;
      await radiologyService.deleteStudy(id);
      return NextResponse.json({ success: true, data: {} });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete study";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // --- STATS ---
  async getStats(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.RADIOLOGY_ORDER_VIEW, "RadiologyOrder");
      if (!auth.isAuthorized) return auth.response;

      const data = await radiologyService.getRadiologyStats();
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch radiology stats";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }
}

const radiologyController = new RadiologyController();
export default radiologyController;
