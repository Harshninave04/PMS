import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import { reportsService } from "@/services/reports.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export class ReportsController {
  private service = reportsService;

  // 1. Operations Hub Summary
  async getSummary(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();

      const authResult = await authorizeRequest(request, PERMISSION_KEYS.REPORTS_OPERATIONAL_VIEW, "Report");
      if (!authResult.isAuthorized) return authResult.response;

      const { searchParams } = new URL(request.url);
      const timeframe = searchParams.get("timeframe") || undefined;
      const data = await this.service.getSummaryStats(timeframe);
      return NextResponse.json({ success: true, data }, { status: 200 });
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json({ success: false, message: err?.message || "Failed to fetch summary stats" }, { status: 500 });
    }
  }

  // 3. Patients
  async getPatients(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();

      const authResult = await authorizeRequest(request, PERMISSION_KEYS.REPORTS_CLINICAL_VIEW, "Report");
      if (!authResult.isAuthorized) return authResult.response;

      const { searchParams } = new URL(request.url);
      const timeframe = searchParams.get("timeframe") || undefined;
      const data = await this.service.getPatientReport(timeframe);
      return NextResponse.json({ success: true, data }, { status: 200 });
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json({ success: false, message: err?.message || "Failed to fetch patient report" }, { status: 500 });
    }
  }

  // 4. Appointments
  async getAppointments(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();

      const authResult = await authorizeRequest(request, PERMISSION_KEYS.REPORTS_CLINICAL_VIEW, "Report");
      if (!authResult.isAuthorized) return authResult.response;

      const { searchParams } = new URL(request.url);
      const timeframe = searchParams.get("timeframe") || undefined;
      const data = await this.service.getAppointmentReport(timeframe);
      return NextResponse.json({ success: true, data }, { status: 200 });
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json({ success: false, message: err?.message || "Failed to fetch appointment report" }, { status: 500 });
    }
  }

  // 5. Doctors
  async getDoctors(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();

      const authResult = await authorizeRequest(request, PERMISSION_KEYS.REPORTS_OPERATIONAL_VIEW, "Report");
      if (!authResult.isAuthorized) return authResult.response;

      const { searchParams } = new URL(request.url);
      const timeframe = searchParams.get("timeframe") || undefined;
      const data = await this.service.getDoctorReport(timeframe);
      return NextResponse.json({ success: true, data }, { status: 200 });
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json({ success: false, message: err?.message || "Failed to fetch doctor report" }, { status: 500 });
    }
  }

  // 6. Admissions
  async getAdmissions(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();

      const authResult = await authorizeRequest(request, PERMISSION_KEYS.REPORTS_CLINICAL_VIEW, "Report");
      if (!authResult.isAuthorized) return authResult.response;

      const { searchParams } = new URL(request.url);
      const timeframe = searchParams.get("timeframe") || undefined;
      const data = await this.service.getAdmissionReport(timeframe);
      return NextResponse.json({ success: true, data }, { status: 200 });
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json({ success: false, message: err?.message || "Failed to fetch admission report" }, { status: 500 });
    }
  }

  // 12. Pharmacy
  async getPharmacy(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();

      const authResult = await authorizeRequest(request, PERMISSION_KEYS.REPORTS_OPERATIONAL_VIEW, "Report");
      if (!authResult.isAuthorized) return authResult.response;

      const { searchParams } = new URL(request.url);
      const timeframe = searchParams.get("timeframe") || undefined;
      const data = await this.service.getPharmacyReport(timeframe);
      return NextResponse.json({ success: true, data }, { status: 200 });
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json({ success: false, message: err?.message || "Failed to fetch pharmacy report" }, { status: 500 });
    }
  }

  // 15. Billing
  async getBilling(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();

      const authResult = await authorizeRequest(request, PERMISSION_KEYS.REPORTS_FINANCIAL_VIEW, "Report");
      if (!authResult.isAuthorized) return authResult.response;

      const { searchParams } = new URL(request.url);
      const timeframe = searchParams.get("timeframe") || undefined;
      const data = await this.service.getBillingReport(timeframe);
      return NextResponse.json({ success: true, data }, { status: 200 });
    } catch (error: unknown) {
      const err = error as { message?: string };
      return NextResponse.json({ success: false, message: err?.message || "Failed to fetch billing report" }, { status: 500 });
    }
  }

}

export const reportsController = new ReportsController();
export default reportsController;
