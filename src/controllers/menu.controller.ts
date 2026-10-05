import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import defaultMenuService, { MenuService } from "@/services/menu.service";
import { requirePermission, resolveRequestIdentity } from "@/lib/rbac/guard";
import { IMenu } from "@/interfaces/menu.interface";
import { filterMenusByPermissions, restrictToCanonicalMenus, type MenuNode } from "@/lib/menu-data";
import { resolveRolePermissions } from "@/lib/rbac/role-permissions";

export class MenuController {
    constructor(private service: MenuService = defaultMenuService) { }

    async createMenu(request: NextRequest) {
        try {
            await dbConnect();

            // Menus define what every user's sidebar contains, so writing one is
            // an access-control change and needs the access-control permission.
            const denied = await requirePermission(request, "admin.roles:update");
            if (denied) return denied;

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

    async getMenus(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            // An authenticated, active session is all this needs: the sidebar is
            // the one thing every signed-in user is entitled to ask for, and it
            // is filtered below to whatever they may actually reach. A missing or
            // inactive session is a 401, never an empty list.
            const identity = await resolveRequestIdentity();
            if ("response" in identity) return identity.response;

            // Drop rows for modules this build does not ship before anything can
            // see them. The reconciler removes them from the database, but the
            // sidebar must stay correct even if that never ran.
            const stored = (await this.service.getAllMenus()) as unknown as MenuNode[];
            const canonical = restrictToCanonicalMenus(stored).map((menu) =>
                typeof (menu as { toObject?: () => MenuNode }).toObject === "function"
                    ? (menu as unknown as { toObject: () => MenuNode }).toObject()
                    : menu
            );

            // Sub-item filtering, from the same helper the client uses. The
            // sidebar re-applies it locally so a permission change shows up
            // without another round trip.
            const menus = filterMenusByPermissions(canonical, identity.identity.permissions.subItem);

            return NextResponse.json(
                {
                    success: true,
                    count: menus.length,
                    data: menus as unknown as IMenu[]
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
