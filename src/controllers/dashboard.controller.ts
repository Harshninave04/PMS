import { NextRequest, NextResponse } from "next/server";
import DashboardService from "@/services/dashboard.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export class DashboardController {
  async getStats(req: NextRequest): Promise<NextResponse> {
    try {
      const authResult = await authorizeRequest(req, PERMISSION_KEYS.DASHBOARD_VIEW, "Dashboard");
      if (!authResult.isAuthorized) return authResult.response;

      if (authResult.context.roleName.toUpperCase() === "DOCTOR") {
        if (!authResult.context.doctorProfileId) {
          return NextResponse.json({ success: false, message: "Doctor profile is not linked to this account" }, { status: 403 });
        }
        const data = await DashboardService.getDoctorDashboardStats(authResult.context.doctorProfileId);
        return NextResponse.json({ success: true, data });
      }

      const data = await DashboardService.getDashboardStats();
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json({ success: false, message: err?.message || "Failed to fetch dashboard stats" }, { status: 500 });
    }
  }
}

const dashboardController = new DashboardController();
export default dashboardController;
