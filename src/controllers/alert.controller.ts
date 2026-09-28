import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import { alertService, AlertService } from "@/services/alert.service";
import { CreateAlertDto, UpdateAlertDto } from "@/dto/alert.dto";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export class AlertController {
  constructor(private svc: AlertService = alertService) {}

  async createAlert(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();

      const authResult = await authorizeRequest(request, PERMISSION_KEYS.ALERT_CREATE, "Alert");
      if (!authResult.isAuthorized) return authResult.response;

      const data: CreateAlertDto = await request.json();

      if (!data.source || !data.message || !data.severity) {
        return NextResponse.json(
          { success: false, message: "Required fields are missing" },
          { status: 400 }
        );
      }

      const alert = await this.svc.createAlert(data);
      return NextResponse.json(
        { success: true, message: "Alert created successfully", data: alert },
        { status: 201 }
      );
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json(
        { success: false, message: err?.message || "Failed to create alert" },
        { status: 500 }
      );
    }
  }

  async getAlerts(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();

      const authResult = await authorizeRequest(request, PERMISSION_KEYS.ALERT_VIEW, "Alert");
      if (!authResult.isAuthorized) return authResult.response;

      const alerts = await this.svc.getAllAlerts();
      return NextResponse.json(
        { success: true, count: alerts.length, data: alerts },
        { status: 200 }
      );
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json(
        { success: false, message: err?.message || "Failed to fetch alerts" },
        { status: 500 }
      );
    }
  }

  async updateAlert(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();

      const authResult = await authorizeRequest(request, PERMISSION_KEYS.ALERT_MANAGE, "Alert");
      if (!authResult.isAuthorized) return authResult.response;

      const data: UpdateAlertDto = await request.json();
      const alert = await this.svc.updateAlert(id, data);
      if (!alert) {
        return NextResponse.json(
          { success: false, message: "Alert not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: true, message: "Alert updated successfully", data: alert },
        { status: 200 }
      );
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json(
        { success: false, message: err?.message || "Failed to update alert" },
        { status: 500 }
      );
    }
  }

  async deleteAlert(id: string, request?: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();

      if (request) {
        const authResult = await authorizeRequest(request, PERMISSION_KEYS.ALERT_MANAGE, "Alert");
        if (!authResult.isAuthorized) return authResult.response;
      }

      const alert = await this.svc.deleteAlert(id);
      if (!alert) {
        return NextResponse.json(
          { success: false, message: "Alert not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: true, message: "Alert deleted successfully" },
        { status: 200 }
      );
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json(
        { success: false, message: err?.message || "Failed to delete alert" },
        { status: 500 }
      );
    }
  }
}

const alertController = new AlertController();
export default alertController;
