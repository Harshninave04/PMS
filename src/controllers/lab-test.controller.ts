import { NextRequest, NextResponse } from "next/server";
import * as labTestService from "../services/lab-test.service";
import dbConnect from "../lib/dbConnect";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export const getLabTests = async (req: Request | NextRequest): Promise<NextResponse> => {
  try {
    await dbConnect();
    const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
    const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.LAB_ORDER_VIEW, "LabTest");
    if (!auth.isAuthorized) return auth.response;

    const tests = await labTestService.getAllLabTests();
    return NextResponse.json({ success: true, data: tests });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch lab tests";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
};

export const createLabTest = async (req: Request | NextRequest): Promise<NextResponse> => {
  try {
    await dbConnect();
    const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
    const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.LAB_ORDER_CREATE, "LabTest");
    if (!auth.isAuthorized) return auth.response;

    const body = await req.json();
    const test = await labTestService.createLabTest(body);
    return NextResponse.json({ success: true, data: test }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create lab test";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
};

export const getLabTest = async (
  req: Request | NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
): Promise<NextResponse> => {
  try {
    await dbConnect();
    const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
    const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.LAB_ORDER_VIEW, "LabTest");
    if (!auth.isAuthorized) return auth.response;

    const resolvedParams = await params;
    const test = await labTestService.getLabTestById(resolvedParams.id);
    if (!test) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: test });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch lab test";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
};

export const updateLabTest = async (
  req: Request | NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
): Promise<NextResponse> => {
  try {
    await dbConnect();
    const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
    const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.LAB_ORDER_CREATE, "LabTest");
    if (!auth.isAuthorized) return auth.response;

    const resolvedParams = await params;
    const body = await req.json();
    const test = await labTestService.updateLabTest(resolvedParams.id, body);
    if (!test) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: test });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update lab test";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
};

export const deleteLabTest = async (
  req: Request | NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
): Promise<NextResponse> => {
  try {
    await dbConnect();
    const nextReq = req instanceof NextRequest ? req : new NextRequest(req.url, { headers: req.headers });
    const auth = await authorizeRequest(nextReq, PERMISSION_KEYS.LAB_ORDER_CREATE, "LabTest");
    if (!auth.isAuthorized) return auth.response;

    const resolvedParams = await params;
    const test = await labTestService.deleteLabTest(resolvedParams.id);
    if (!test) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: {} });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete lab test";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
};
