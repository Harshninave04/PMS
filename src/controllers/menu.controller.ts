import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import defaultMenuService, { MenuService } from "@/services/menu.service";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/auth";
import Role from "@/models/role.model";
import { IMenu } from "@/interfaces/menu.interface";
import { filterMenusForAccess, restrictToCanonicalMenus, type MenuNode } from "@/lib/menu-data";

export class MenuController {
    constructor(private service: MenuService = defaultMenuService) { }

    async createMenu(request: NextRequest) {
        try {
            await dbConnect();
            const body = await request.json();
            const existingMenu = await this.service.findByName(body.name);

            if (existingMenu) {
                return NextResponse.json(
                    { success: false, message: "Menu already exists" },
                    { status: 400 }
                );
            }

            const existingPath = await this.service.findByPath(body.path);

            if (existingPath) {
                return NextResponse.json(
                    { success: false, message: "Menu path already exists" },
                    { status: 400 }
                );
            }
            return await this.service.createMenu(body);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to create menu";
            return NextResponse.json(
                {
                    success: false,
                    message
                },
                { status: 500 }
            );
        }
    }

    async getMenus(): Promise<NextResponse> {
        try {
            await dbConnect();
            // Drop rows for modules this build does not ship before anything can
            // see them. The reconciler removes them from the database, but the
            // sidebar must stay correct even if that never ran.
            let menus = restrictToCanonicalMenus(
                (await this.service.getAllMenus()) as unknown as MenuNode[]
            ) as unknown as IMenu[];

            // Filter menus based on user role access
            const session = await getServerSession(authOptions);
            if (!session || !session.user) {
                return NextResponse.json(
                    { success: true, count: 0, data: [] },
                    { status: 200 }
                );
            }

            const currentUser = session.user as { role?: string };
            if (currentUser.role) {
                const roleDoc = await Role.findById(currentUser.role).lean();
                if (roleDoc) {
                    const plainMenus = (menus as unknown as MenuNode[]).map((menu) =>
                        typeof (menu as { toObject?: () => MenuNode }).toObject === "function"
                            ? (menu as unknown as { toObject: () => MenuNode }).toObject()
                            : menu
                    );
                    menus = filterMenusForAccess(plainMenus, roleDoc.access ?? []) as unknown as IMenu[];
                }
            }

            return NextResponse.json(
                {
                    success: true,
                    count: menus.length,
                    data: menus
                },
                { status: 200 }
            );
        } catch (error: unknown) {
            console.error("MenuController getMenus Error:", error);
            const message = error instanceof Error ? error.message : "Failed to fetch menus";
            return NextResponse.json(
                {
                    success: false,
                    message
                },
                { status: 500 }
            );
        }
    }

    async getMenuById(
        _request: NextRequest,
        { params }: { params: Promise<{ id: string }> }
    ): Promise<NextResponse> {
        try {
            await dbConnect();
            const { id } = await params;

            const menu = await this.service.getMenuById(id);

            return NextResponse.json(
                {
                    success: true,
                    data: menu
                },
                { status: 200 }
            );
        } catch (error: unknown) {
            console.error("MenuController getMenuById Error:", error);
            const message = error instanceof Error ? error.message : "Failed to fetch menu";
            return NextResponse.json(
                {
                    success: false,
                    message
                },
                { status: 500 }
            );
        }
    }
}

const defaultMenuController = new MenuController();
export default defaultMenuController;
