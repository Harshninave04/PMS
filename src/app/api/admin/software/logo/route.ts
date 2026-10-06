import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac/guard";
import { saveUpload } from "@/lib/uploads";

/** Image types accepted for the product logo. */
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const denied = await requirePermission(request, "admin.software:update");
  if (denied) return denied;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: "No logo file provided" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { success: false, message: "Logo must be a PNG, JPEG, WebP, SVG or ICO image" },
        { status: 400 }
      );
    }
    if (file.size > MAX_LOGO_BYTES) {
      return NextResponse.json({ success: false, message: "Logo must be 2 MB or smaller" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await saveUpload(buffer, file.name, file.type, "logos");

    return NextResponse.json(
      {
        success: true,
        message: "Logo uploaded successfully.",
        data: uploadResult,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to upload logo" },
      { status: 500 }
    );
  }
}
