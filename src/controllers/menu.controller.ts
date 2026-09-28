import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import defaultMenuService, { MenuService } from "@/services/menu.service";
import { getServerSession } from "next-auth";
import authOptions from "@/lib/auth";
import Role from "@/models/role.model";
import { IMenu } from "@/interfaces/menu.interface";

function getMenuModuleKey(menu: { moduleKey?: string; path?: string; name?: string }): string {
    if (menu.moduleKey && menu.moduleKey.trim()) {
        return menu.moduleKey.toLowerCase().trim();
    }
    const path = (menu.path || "").toLowerCase().trim();
    if (path.startsWith("/dashboard")) return "dashboard";
    if (path.startsWith("/patients")) return "patient";
    if (path.startsWith("/appointments")) return "appointment";
    if (path.startsWith("/admissions")) return "admission";
    if (path.startsWith("/wards")) return "ward";
    if (path.startsWith("/clinical")) return "clinical";
    if (path.startsWith("/nursing")) return "nursing";
    if (path.startsWith("/lab")) return "lab";
    if (path.startsWith("/radiology")) return "radiology";
    if (path.startsWith("/pharmacy")) return "pharmacy";
    if (path.startsWith("/emergency")) return "emergency";
    if (path.startsWith("/ot")) return "ot";
    if (path.startsWith("/blood-bank")) return "blood-bank";
    if (path.startsWith("/inventory")) return "inventory";
    if (path.startsWith("/procurement")) return "procurement";
    if (path.startsWith("/finance")) return "billing";
    if (path.startsWith("/insurance")) return "insurance";
    if (path.startsWith("/reports")) return "reports";
    if (path.startsWith("/staff")) return "staff";
    if (path.startsWith("/hr")) return "hr";
    if (path.startsWith("/notifications")) return "notifications";
    if (path.startsWith("/admin")) return "admin";
    if (path.startsWith("/organization")) return "organization";
    if (path.startsWith("/audit")) return "audit";
    if (path.startsWith("/config")) return "system";

    return (menu.name || "").toLowerCase().trim();
}

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
            let menus = await this.service.getAllMenus();

            // Filter menus based on user role access
            const session = await getServerSession(authOptions);
            if (session && session.user) {
                const currentUser = session.user as { role?: string };
                if (currentUser.role) {
                    const roleDoc = await Role.findById(currentUser.role).lean();
                    if (roleDoc && roleDoc.role !== "SYSTEM_SUPER_ADMIN") {
                        const accessibleModules = new Set<string>();
                        accessibleModules.add("dashboard"); // Dashboard is universally accessible to logged in staff

                        if (Array.isArray(roleDoc.access)) {
                            for (const item of roleDoc.access) {
                                const mod = (item.moduleName || "").toLowerCase().trim();
                                accessibleModules.add(mod);
                                if (mod === "user" || mod === "role") accessibleModules.add("admin");
                                if (mod === "billing") accessibleModules.add("finance");
                                if (mod === "system") accessibleModules.add("config");
                            }
                        }

                        interface FilterableMenuItem {
                            moduleKey?: string;
                            path?: string;
                            name?: string;
                            children?: FilterableMenuItem[];
                            toObject?: () => Record<string, unknown>;
                            [key: string]: unknown;
                        }

                        const menuList = menus as unknown as FilterableMenuItem[];
                        const filtered = menuList.map((menu) => {
                            const menuObj = (typeof menu.toObject === "function" ? menu.toObject() : { ...menu }) as FilterableMenuItem;
                            const parentKey = getMenuModuleKey(menuObj);

                            // If it has children, filter the children
                            if (Array.isArray(menuObj.children) && menuObj.children.length > 0) {
                                menuObj.children = (menuObj.children as FilterableMenuItem[]).filter((child) => {
                                    const childKey = getMenuModuleKey(child);
                                    return accessibleModules.has(childKey) || accessibleModules.has(parentKey);
                                });
                            }
                            return menuObj;
                        }).filter((menu) => {
                            const parentKey = getMenuModuleKey(menu);
                            const hasDirectAccess = accessibleModules.has(parentKey);
                            const hasChildAccess = Array.isArray(menu.children) && menu.children.length > 0;
                            return hasDirectAccess || hasChildAccess;
                        });
                        menus = filtered as unknown as IMenu[];
                    }
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
