import { NextRequest, NextResponse } from "next/server";
import AdmissionController from "@/controllers/admission.controller";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  return AdmissionController.getDischargeTreatmentSummary(id, request);
}
