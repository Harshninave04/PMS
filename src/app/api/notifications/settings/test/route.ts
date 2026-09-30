import { NextResponse } from "next/server";
import { NotificationService } from "@/services/notification.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export async function POST(req: Request) {
  const authResult = await authorizeRequest(req, PERMISSION_KEYS.SYSTEM_SETTINGS_UPDATE);
  if (!authResult.isAuthorized) return authResult.response;

  try {
    const { type } = await req.json();
    const result = await NotificationService.testGateway(type || "SMS");
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
