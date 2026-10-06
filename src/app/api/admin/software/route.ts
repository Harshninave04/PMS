import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac/guard";
import { SoftwareMetadataService } from "@/services/software-metadata.service";

export async function GET(request: Request) {
  const denied = await requirePermission(request, "admin.software:view");
  if (denied) return denied;

  try {
    const branding = await SoftwareMetadataService.getBranding();
    return NextResponse.json({ success: true, data: branding });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to load software metadata" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const denied = await requirePermission(request, "admin.software:update");
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Request body must be valid JSON" }, { status: 400 });
  }

  try {
    const { branding, error } = await SoftwareMetadataService.updateBranding(body);
    if (error) return NextResponse.json({ success: false, message: error }, { status: 400 });

    return NextResponse.json({
      success: true,
      message: "Software metadata updated successfully.",
      data: branding,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to update software metadata" },
      { status: 500 }
    );
  }
}
