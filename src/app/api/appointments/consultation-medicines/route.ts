import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/dbConnect";
import Medicine from "@/models/medicine.model";
import Prescription from "@/models/prescription.model";
import { authorizeRequest, requirePermission } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { isDoctorRole } from "@/lib/rbac/doctor-scope";

const MAX_RESULTS = 10;
const MIN_QUERY_LENGTH = 2;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, "opd.queue:view");
  if (denied) return denied;

  const auth = await authorizeRequest(request, PERMISSION_KEYS.APPOINTMENT_VIEW, "Appointment");
  if (!auth.isAuthorized) return auth.response;

  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ success: true, data: [], source: "none" });
  }

  try {
    await dbConnect();
    const pattern = new RegExp(escapeRegex(query), "i");

    // Names only: never expose stock, price, batch or supplier to the consultation form.
    const masterMatches = await Medicine.find({ isActive: true, name: pattern })
      .select("name")
      .sort({ name: 1 })
      .limit(MAX_RESULTS)
      .lean();
    const masterNames = [...new Set(masterMatches.map((item: any) => String(item.name).trim()).filter(Boolean))];
    if (masterNames.length > 0) {
      return NextResponse.json({ success: true, data: masterNames, source: "medicine-master" });
    }

    if (!isDoctorRole(auth.context.roleName)) {
      return NextResponse.json({ success: true, data: [], source: "none" });
    }

    const previous = await Prescription.aggregate([
      { $match: { doctorId: new mongoose.Types.ObjectId(String(auth.context.userId)) } },
      { $unwind: "$medications" },
      { $match: { "medications.name": pattern } },
      { $group: { _id: "$medications.name" } },
      { $sort: { _id: 1 } },
      { $limit: MAX_RESULTS },
    ]);
    const previousNames = previous.map((item: any) => String(item._id).trim()).filter(Boolean);
    return NextResponse.json({ success: true, data: previousNames, source: "previous-prescriptions" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load medicine suggestions";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}