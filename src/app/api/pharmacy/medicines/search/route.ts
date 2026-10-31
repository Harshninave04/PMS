import { NextRequest } from "next/server";
import dbConnect from "@/lib/dbConnect";
import { MedicineController } from "@/controllers/medicine.controller";
import { requireAnyPermission } from "@/lib/rbac/guard";

export async function GET(request: NextRequest) {
  const denied = await requireAnyPermission(request, [
    "pharmacy.medicines:view",
    "clinical.rounds:view",
    "clinical.rounds:create",
    "clinical.prescriptions:prescribe",
    "clinical.consultations:create",
    "nursing.medications:create",
    "admissions.discharge:discharge",
  ]);
  if (denied) return denied;

  await dbConnect();
  return MedicineController.search(request);
}
