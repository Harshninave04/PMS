import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Medicine from "@/models/medicine.model";
import Prescription from "@/models/prescription.model";
import { authorizeRequest, requirePermission } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { isDoctorRole } from "@/lib/rbac/doctor-scope";

export async function GET(request: NextRequest) {
  const denied = await requirePermission(request, "opd.queue:view");
  if (denied) return denied;

  const auth = await authorizeRequest(request, PERMISSION_KEYS.APPOINTMENT_VIEW, "Appointment");
  if (!auth.isAuthorized) return auth.response;

  try {
    await dbConnect();

    const masterNames = await Medicine.distinct("name", { isActive: true });
    const medicineNames = [...new Set(masterNames.map((name) => String(name).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (medicineNames.length > 0) {
      return NextResponse.json({ success: true, data: medicineNames, source: "medicine-master" });
    }

    if (!isDoctorRole(auth.context.roleName)) {
      return NextResponse.json({ success: true, data: [], source: "previous-prescriptions" });
    }

    const previousNames = await Prescription.distinct("medications.name", { doctorId: auth.context.userId });
    const suggestions = [...new Set(previousNames.map((name) => String(name).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ success: true, data: suggestions, source: "previous-prescriptions" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load medicine suggestions";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
