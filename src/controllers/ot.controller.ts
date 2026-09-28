import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import otService from "@/services/ot.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export class OTController {
  // Stats
  async getStats(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_SCHEDULE_VIEW, "SurgerySchedule");
      if (!auth.isAuthorized) return auth.response;

      const stats = await otService.getOTStats();
      return NextResponse.json({ success: true, data: stats });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch OT stats";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Schedules
  async createSchedule(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_SCHEDULE_CREATE, "SurgerySchedule");
      if (!auth.isAuthorized) return auth.response;

      const data = await request.json();
      const schedule = await otService.createSchedule(data);
      return NextResponse.json({ success: true, data: schedule }, { status: 201 });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create schedule";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getSchedules(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_SCHEDULE_VIEW, "SurgerySchedule");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const status = searchParams.get("status");
      const otRoom = searchParams.get("otRoom");
      const filter: Record<string, unknown> = {};
      if (status && status !== "ALL") filter.status = status;
      if (otRoom && otRoom !== "ALL") filter.otRoom = otRoom;

      const schedules = await otService.getSchedules(filter);
      return NextResponse.json({ success: true, data: schedules });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch schedules";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getScheduleById(request: NextRequest, params: { id: string }): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_SCHEDULE_VIEW, "SurgerySchedule");
      if (!auth.isAuthorized) return auth.response;

      const schedule = await otService.getScheduleById(params.id);
      if (!schedule) {
        return NextResponse.json({ success: false, message: "Schedule not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: schedule });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch schedule";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updateSchedule(request: NextRequest, params: { id: string }): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_SCHEDULE_UPDATE, "SurgerySchedule");
      if (!auth.isAuthorized) return auth.response;

      const data = await request.json();
      const schedule = await otService.updateSchedule(params.id, data);
      return NextResponse.json({ success: true, data: schedule });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to update schedule";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async deleteSchedule(request: NextRequest, params: { id: string }): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_SCHEDULE_UPDATE, "SurgerySchedule");
      if (!auth.isAuthorized) return auth.response;

      await otService.deleteSchedule(params.id);
      return NextResponse.json({ success: true, message: "Schedule deleted" });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to delete schedule";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Bookings
  async createBooking(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_SCHEDULE_CREATE, "OTBooking");
      if (!auth.isAuthorized) return auth.response;

      const data = await request.json();
      const booking = await otService.createBooking(data);
      return NextResponse.json({ success: true, data: booking }, { status: 201 });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create booking";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getBookings(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_SCHEDULE_VIEW, "OTBooking");
      if (!auth.isAuthorized) return auth.response;

      const bookings = await otService.getBookings();
      return NextResponse.json({ success: true, data: bookings });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch bookings";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updateBooking(request: NextRequest, params: { id: string }): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_SCHEDULE_UPDATE, "OTBooking");
      if (!auth.isAuthorized) return auth.response;

      const data = await request.json();
      const booking = await otService.updateBooking(params.id, data);
      return NextResponse.json({ success: true, data: booking });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to update booking";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async deleteBooking(request: NextRequest, params: { id: string }): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_SCHEDULE_UPDATE, "OTBooking");
      if (!auth.isAuthorized) return auth.response;

      await otService.deleteBooking(params.id);
      return NextResponse.json({ success: true, message: "Booking cancelled" });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to cancel booking";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Surgery Requests
  async createRequest(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_SCHEDULE_CREATE, "SurgeryRequest");
      if (!auth.isAuthorized) return auth.response;

      const data = await request.json();
      const req = await otService.createRequest(data);
      return NextResponse.json({ success: true, data: req }, { status: 201 });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create surgery request";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getRequests(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_SCHEDULE_VIEW, "SurgeryRequest");
      if (!auth.isAuthorized) return auth.response;

      const requests = await otService.getRequests();
      return NextResponse.json({ success: true, data: requests });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch surgery requests";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updateRequest(request: NextRequest, params: { id: string }): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_SCHEDULE_UPDATE, "SurgeryRequest");
      if (!auth.isAuthorized) return auth.response;

      const data = await request.json();
      const req = await otService.updateRequest(params.id, data);
      return NextResponse.json({ success: true, data: req });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to update surgery request";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async deleteRequest(request: NextRequest, params: { id: string }): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_SCHEDULE_UPDATE, "SurgeryRequest");
      if (!auth.isAuthorized) return auth.response;

      await otService.deleteRequest(params.id);
      return NextResponse.json({ success: true, message: "Request deleted" });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to delete request";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Pre-Op Checklists
  async createPreOpChecklist(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_CHECKLIST_VERIFY, "PreOpChecklist");
      if (!auth.isAuthorized) return auth.response;

      const data = await request.json();
      const checklist = await otService.createPreOpChecklist(data);
      return NextResponse.json({ success: true, data: checklist }, { status: 201 });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create pre-op checklist";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getPreOpChecklists(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_SCHEDULE_VIEW, "PreOpChecklist");
      if (!auth.isAuthorized) return auth.response;

      const checklists = await otService.getPreOpChecklists();
      return NextResponse.json({ success: true, data: checklists });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch pre-op checklists";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updatePreOpChecklist(request: NextRequest, params: { id: string }): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_CHECKLIST_VERIFY, "PreOpChecklist");
      if (!auth.isAuthorized) return auth.response;

      const data = await request.json();
      const checklist = await otService.updatePreOpChecklist(params.id, data);
      return NextResponse.json({ success: true, data: checklist });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to update pre-op checklist";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Intra-Op Records
  async createIntraOpRecord(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_RECORD_CREATE, "IntraOpRecord");
      if (!auth.isAuthorized) return auth.response;

      const data = await request.json();
      const record = await otService.createIntraOpRecord(data);
      return NextResponse.json({ success: true, data: record }, { status: 201 });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create intra-op record";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getIntraOpRecords(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_SCHEDULE_VIEW, "IntraOpRecord");
      if (!auth.isAuthorized) return auth.response;

      const records = await otService.getIntraOpRecords();
      return NextResponse.json({ success: true, data: records });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch intra-op records";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Post-Op PACU Records
  async createPostOpRecord(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_RECORD_CREATE, "PostOpRecord");
      if (!auth.isAuthorized) return auth.response;

      const data = await request.json();
      const record = await otService.createPostOpRecord(data);
      return NextResponse.json({ success: true, data: record }, { status: 201 });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create post-op record";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getPostOpRecords(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.OT_SCHEDULE_VIEW, "PostOpRecord");
      if (!auth.isAuthorized) return auth.response;

      const records = await otService.getPostOpRecords();
      return NextResponse.json({ success: true, data: records });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch post-op records";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }
}

const otController = new OTController();
export default otController;
