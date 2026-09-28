import { NextRequest, NextResponse } from "next/server";
import * as labOrderService from "../services/lab-order.service";
import dbConnect from "../lib/dbConnect";
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

interface PopulatedLabOrder {
  _id?: unknown;
  doctor?: unknown;
  patient?: PopulatedPatient;
  [key: string]: unknown;
}

export const getLabOrders = async (req: Request | NextRequest): Promise<NextResponse> => {
  try {
    await dbConnect();
    const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
    const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.LAB_ORDER_VIEW, "LabOrder");
    if (!auth.isAuthorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const priority = searchParams.get("priority") || undefined;
    const patient = searchParams.get("patient") || undefined;
    const barcode = searchParams.get("barcode") || undefined;

    let orders = (await labOrderService.getAllLabOrders({ status, priority, patient, barcode })) as unknown as PopulatedLabOrder[];

    // Relational constraint: doctor with OWN scope can only view lab orders they authored
    if (auth.grant.relScope === "OWN") {
      const myDoctorId = (auth.context.doctorProfileId || auth.context.userId).toString();
      orders = orders.filter((ord) => {
        const orderDocId = extractEntityId(ord.doctor);
        return orderDocId === myDoctorId;
      });
    }

    // Organizational boundary: branch user can only view lab orders in their branch
    if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
      const userBranch = auth.context.branchId.toString();
      orders = orders.filter((ord) => {
        const patientBranch = extractEntityId(ord.patient?.branchId);
        return !patientBranch || patientBranch === userBranch;
      });
    }

    return NextResponse.json({ success: true, count: orders.length, data: orders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch lab orders";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
};

export const createLabOrder = async (req: Request | NextRequest): Promise<NextResponse> => {
  try {
    await dbConnect();
    const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
    const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.LAB_ORDER_CREATE, "LabOrder");
    if (!auth.isAuthorized) return auth.response;

    const body = (await req.json()) as Record<string, unknown>;

    // Relational constraint: doctor with OWN scope has doctor set to their profile ID
    if (auth.grant.relScope === "OWN" && auth.context.doctorProfileId) {
      body.doctor = auth.context.doctorProfileId.toString();
    }

    const order = await labOrderService.createLabOrder(body);
    return NextResponse.json({ success: true, data: order }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create lab order";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
};

export const getLabOrder = async (
  req: Request | NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  try {
    await dbConnect();
    const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
    const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.LAB_ORDER_VIEW, "LabOrder");
    if (!auth.isAuthorized) return auth.response;

    const { id } = await params;
    const order = (await labOrderService.getLabOrderById(id)) as unknown as PopulatedLabOrder | null;
    if (!order) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    // Relational check
    if (auth.grant.relScope === "OWN") {
      const orderDocId = extractEntityId(order.doctor);
      const myDoctorId = (auth.context.doctorProfileId || auth.context.userId).toString();
      if (orderDocId !== myDoctorId) {
        return NextResponse.json(
          { success: false, error: "Forbidden: Access restricted to your own lab orders" },
          { status: 403 }
        );
      }
    }

    // Organizational check
    if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
      const patientBranch = extractEntityId(order.patient?.branchId);
      if (patientBranch && patientBranch !== auth.context.branchId.toString()) {
        return NextResponse.json(
          { success: false, error: "Forbidden: Lab order belongs to another branch" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({ success: true, data: order });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch lab order";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
};

export const updateLabOrder = async (
  req: Request | NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  try {
    await dbConnect();
    const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });

    // Allow result update, result create, sample collect, or result verify
    let auth = await authorizeRequest(nextReq, PERMISSION_KEYS.LAB_RESULT_UPDATE, "LabOrder");
    if (!auth.isAuthorized) {
      auth = await authorizeRequest(nextReq, PERMISSION_KEYS.LAB_RESULT_CREATE, "LabOrder");
      if (!auth.isAuthorized) {
        auth = await authorizeRequest(nextReq, PERMISSION_KEYS.LAB_SAMPLE_COLLECT, "LabOrder");
        if (!auth.isAuthorized) {
          auth = await authorizeRequest(nextReq, PERMISSION_KEYS.LAB_RESULT_VERIFY, "LabOrder");
          if (!auth.isAuthorized) {
            auth = await authorizeRequest(nextReq, PERMISSION_KEYS.LAB_ORDER_CREATE, "LabOrder");
            if (!auth.isAuthorized) return auth.response;
          }
        }
      }
    }

    const { id } = await params;
    const existing = (await labOrderService.getLabOrderById(id)) as unknown as PopulatedLabOrder | null;
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    if (auth.grant.relScope === "OWN") {
      const orderDocId = extractEntityId(existing.doctor);
      const myDoctorId = (auth.context.doctorProfileId || auth.context.userId).toString();
      if (orderDocId !== myDoctorId) {
        return NextResponse.json(
          { success: false, error: "Forbidden: You can only update your own lab orders" },
          { status: 403 }
        );
      }
    }

    if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
      const patientBranch = extractEntityId(existing.patient?.branchId);
      if (patientBranch && patientBranch !== auth.context.branchId.toString()) {
        return NextResponse.json(
          { success: false, error: "Forbidden: Lab order belongs to another branch" },
          { status: 403 }
        );
      }
    }

    const body = await req.json();
    const order = await labOrderService.updateLabOrder(id, body);
    return NextResponse.json({ success: true, data: order });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update lab order";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
};

export const deleteLabOrder = async (
  req: Request | NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
  try {
    await dbConnect();
    const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
    const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.LAB_ORDER_CREATE, "LabOrder");
    if (!auth.isAuthorized) return auth.response;

    const { id } = await params;
    const existing = (await labOrderService.getLabOrderById(id)) as unknown as PopulatedLabOrder | null;
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    if (auth.grant.relScope === "OWN") {
      const orderDocId = extractEntityId(existing.doctor);
      const myDoctorId = (auth.context.doctorProfileId || auth.context.userId).toString();
      if (orderDocId !== myDoctorId) {
        return NextResponse.json(
          { success: false, error: "Forbidden: You can only delete your own lab orders" },
          { status: 403 }
        );
      }
    }

    if (auth.context.branchId && auth.grant.orgScope === "BRANCH") {
      const patientBranch = extractEntityId(existing.patient?.branchId);
      if (patientBranch && patientBranch !== auth.context.branchId.toString()) {
        return NextResponse.json(
          { success: false, error: "Forbidden: Lab order belongs to another branch" },
          { status: 403 }
        );
      }
    }

    await labOrderService.deleteLabOrder(id);
    return NextResponse.json({ success: true, data: {} });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete lab order";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
};

export const getLabStats = async (req: Request | NextRequest): Promise<NextResponse> => {
  try {
    await dbConnect();
    const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
    const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.LAB_ORDER_VIEW, "LabOrder");
    if (!auth.isAuthorized) return auth.response;

    const stats = await labOrderService.getLabStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch lab statistics";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
};
