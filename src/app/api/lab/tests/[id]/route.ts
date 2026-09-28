import { NextRequest, NextResponse } from "next/server";
import { getLabTest, updateLabTest, deleteLabTest } from "@/controllers/lab-test.controller";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  return getLabTest(req, { params });
}

export async function PUT(req: NextRequest, { params }: Params): Promise<NextResponse> {
  return updateLabTest(req, { params });
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  return deleteLabTest(req, { params });
}
