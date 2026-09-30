import { NextResponse } from "next/server";
import { NotificationService } from "@/services/notification.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authorizeRequest(req, PERMISSION_KEYS.SYSTEM_SETTINGS_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { id } = await params;
    const rule = await NotificationService.getRuleById(id);
    return NextResponse.json({ success: true, data: rule });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authorizeRequest(req, PERMISSION_KEYS.SYSTEM_SETTINGS_UPDATE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { id } = await params;
    const body = await req.json();
    const updated = await NotificationService.updateRule(id, body);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authorizeRequest(req, PERMISSION_KEYS.SYSTEM_SETTINGS_UPDATE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { id } = await params;
    const deleted = await NotificationService.deleteRule(id);
    return NextResponse.json({ success: true, data: deleted });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
