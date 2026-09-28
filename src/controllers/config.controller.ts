import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultConfigService, { ConfigService } from "@/services/config.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export class ConfigController {
    constructor(private configService: ConfigService = defaultConfigService) { }

    async getSettings(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.SYSTEM_SETTINGS_VIEW, "Config");
            if (!authResult.isAuthorized) return authResult.response;

            const { searchParams } = new URL(request.url);
            const category = searchParams.get("category") || undefined;
            const asMap = searchParams.get("map") === "true";

            if (asMap && category) {
                const map = await this.configService.getSettingsMap(category);
                return NextResponse.json({ success: true, data: map }, { status: 200 });
            }

            const settings = await this.configService.getSettings(category);
            return NextResponse.json({ success: true, data: settings }, { status: 200 });
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to fetch settings" },
                { status: 500 }
            );
        }
    }

    async bulkUpdate(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.SYSTEM_SETTINGS_UPDATE, "Config");
            if (!authResult.isAuthorized) return authResult.response;

            const body = await request.json();
            const { category, settings } = body;

            if (!category) {
                return NextResponse.json({ success: false, message: "Category is required" }, { status: 400 });
            }
            if (!settings || !Array.isArray(settings)) {
                return NextResponse.json({ success: false, message: "Settings must be an array" }, { status: 400 });
            }

            const result = await this.configService.bulkUpdateSettings(category, settings);
            return NextResponse.json({ success: true, data: result }, { status: 200 });
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to bulk update settings" },
                { status: err?.statusCode || 500 }
            );
        }
    }

    async getConfigStats(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.SYSTEM_SETTINGS_VIEW, "Config");
            if (!authResult.isAuthorized) return authResult.response;

            const stats = await this.configService.getConfigStats();
            return NextResponse.json({ success: true, data: stats }, { status: 200 });
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to fetch configuration stats" },
                { status: 500 }
            );
        }
    }

    async createSetting(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.SYSTEM_SETTINGS_UPDATE, "Config");
            if (!authResult.isAuthorized) return authResult.response;

            const data = await request.json();
            const setting = await this.configService.createSetting(data);
            return NextResponse.json({ success: true, data: setting }, { status: 201 });
        } catch (error: unknown) {
            const err = error as { message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to create setting" },
                { status: 500 }
            );
        }
    }

    async updateSetting(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.SYSTEM_SETTINGS_UPDATE, "Config");
            if (!authResult.isAuthorized) return authResult.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json({ success: false, message: "Invalid ID format" }, { status: 400 });
            }
            const data = await request.json();
            const setting = await this.configService.updateSetting(new Types.ObjectId(id), data);
            return NextResponse.json({ success: true, data: setting }, { status: 200 });
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to update setting" },
                { status: err?.statusCode || 500 }
            );
        }
    }

    async deleteSetting(request: NextRequest, id: string): Promise<NextResponse> {
        try {
            await dbConnect();

            const authResult = await authorizeRequest(request, PERMISSION_KEYS.SYSTEM_SETTINGS_UPDATE, "Config");
            if (!authResult.isAuthorized) return authResult.response;

            if (!Types.ObjectId.isValid(id)) {
                return NextResponse.json({ success: false, message: "Invalid ID format" }, { status: 400 });
            }
            await this.configService.deleteSetting(new Types.ObjectId(id));
            return NextResponse.json({ success: true, message: "Deleted successfully" }, { status: 200 });
        } catch (error: unknown) {
            const err = error as { statusCode?: number; message?: string };
            return NextResponse.json(
                { success: false, message: err?.message || "Failed to delete setting" },
                { status: err?.statusCode || 500 }
            );
        }
    }
}

const configController = new ConfigController();
export default configController;
