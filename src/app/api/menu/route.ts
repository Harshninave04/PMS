import { NextRequest, NextResponse } from "next/server";
import menuController from "@/controllers/menu.controller";

/**
 * @route POST /api/menu
 * @desc Create a new menu item
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const newMenu = await menuController.createMenu(request);
        return NextResponse.json(
            {
                success: true,
                message: "Menu created successfully",
                data: newMenu
            },
            { status: 201 }
        );
    } catch (e: any) {
        return NextResponse.json({
            success: false,
            message: e?.message || "Failed to create menu"
        }, { status: 500 });
    }
}

/**
 * @route GET /api/menu
 * @desc The sidebar, filtered to the sub-items the caller may open
 */
export async function GET(request: NextRequest) {
    try {
        const response = await menuController.getMenus(request);
        response.headers.set("Cache-Control", "no-store, max-age=0");
        return response;
    } catch (e) {
        console.log(e);
        return Response.json({ error: e }, { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } });
    }
}
