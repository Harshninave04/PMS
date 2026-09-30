import { NextResponse } from "next/server";
import { NotificationService } from "@/services/notification.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function GET(request: Request) {
  const authResult = await authorizeRequest(request, PERMISSION_KEYS.SYSTEM_SETTINGS_VIEW);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const settings = await NotificationService.getSettings();
    return NextResponse.json({ success: true, data: settings });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authResult = await authorizeRequest(req, PERMISSION_KEYS.SYSTEM_SETTINGS_UPDATE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const body = await req.json();
    const updated = await NotificationService.updateSettings(body);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
