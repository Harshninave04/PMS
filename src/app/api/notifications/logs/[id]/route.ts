import { NextResponse } from "next/server";
import { NotificationService } from "@/services/notification.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authorizeRequest(req, PERMISSION_KEYS.DASHBOARD_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { id } = await params;
    const log = await NotificationService.getLogById(id);
    return NextResponse.json({ success: true, data: log });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authorizeRequest(req, PERMISSION_KEYS.ALERT_MANAGE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { id } = await params;
    const retried = await NotificationService.retryLog(id);
    return NextResponse.json({ success: true, data: retried });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authorizeRequest(req, PERMISSION_KEYS.ALERT_MANAGE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { id } = await params;
    const deleted = await NotificationService.deleteLog(id);
    return NextResponse.json({ success: true, data: deleted });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
