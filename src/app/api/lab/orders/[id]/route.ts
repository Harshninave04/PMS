import { NextRequest, NextResponse } from "next/server";
import { getLabOrder, updateLabOrder, deleteLabOrder } from "@/controllers/lab-order.controller";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  return getLabOrder(req, { params });
}

export async function PUT(req: NextRequest, { params }: Params): Promise<NextResponse> {
  return updateLabOrder(req, { params });
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  return deleteLabOrder(req, { params });
}
