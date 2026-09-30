import { NextResponse } from "next/server";
import { NotificationService } from "@/services/notification.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(req: Request) {
  const authResult = await authorizeRequest(req, PERMISSION_KEYS.DASHBOARD_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "ALL";
    const status = searchParams.get("status") || "ALL";
    const search = searchParams.get("search") || "";
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const result = await NotificationService.getLogs({
      type,
      status,
      search,
      startDate,
      endDate,
      page,
      limit,
    });

    return NextResponse.json({ success: true, data: result.logs, ...result });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authResult = await authorizeRequest(req, PERMISSION_KEYS.DASHBOARD_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const body = await req.json();
    const newLog = await NotificationService.createLog(body);
    return NextResponse.json({ success: true, data: newLog }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
