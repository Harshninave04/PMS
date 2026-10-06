import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { contentTypeForExtension, resolveUploadPath } from "@/lib/uploads";

/**
 * @route GET /uploads/:folder/:file
 * @desc Serves a file uploaded to the backend's own uploads folder. Public by
 *       design: the logo is shown on the login screen and as the browser tab
 *       icon, both of which are reachable without a session. The uploads
 *       folder only ever holds images (see resolveUploadPath's whitelist), so
 *       there is nothing sensitive to expose here.
 */
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse | Response> {
    const segments = (await context.params).path;
    if (!segments || segments.length < 2) {
        return new Response("Not found", { status: 404 });
    }

    const key = segments.join("/");
    const filePath = resolveUploadPath(key);
    if (!filePath) {
        return new Response("Not found", { status: 404 });
    }

    const ext = path.extname(filePath).slice(1).toLowerCase();
    const contentType = contentTypeForExtension(ext);
    if (!contentType) {
        return new Response("Not found", { status: 404 });
    }

    try {
        const data = await fs.readFile(filePath);
        return new NextResponse(new Uint8Array(data), {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch {
        return new Response("Not found", { status: 404 });
    }
}