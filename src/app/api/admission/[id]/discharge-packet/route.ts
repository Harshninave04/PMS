import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import { authorizeRequest } from "@/lib/rbac/guard";
import { isNurseRole } from "@/lib/rbac/roles";
import admissionService from "@/services/admission.service";
import Invoice from "@/models/invoice.model";
import Payment from "@/models/payment.model";
import Organization from "@/models/organization.model";
import { isBillingCompleted } from "@/lib/discharge-workflow";
import { getHospitalProfile } from "@/services/hospital-profile.service";
import { buildDischargeFullFile } from "@/services/discharge-packet.service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest(request, "admissions.summary:print", "Admission");
  if (!auth.isAuthorized) return auth.response;

  try {
    await dbConnect();
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid admission ID." }, { status: 400 });
    }

    const admission = await admissionService.getAdmissionById(new Types.ObjectId(id));
    if (!admission) return NextResponse.json({ success: false, message: "Admission not found." }, { status: 404 });

    if (isNurseRole(auth.context.roleName)) {
      const assigned = (admission.assignedNurses ?? []).some((nurse: any) => String(nurse?._id ?? nurse) === auth.context.userId.toString());
      if (!assigned) return NextResponse.json({ success: false, message: "Admission not found." }, { status: 404 });
    }
    if (auth.grant.relScope === "OWN" && !isNurseRole(auth.context.roleName)) {
      const doctorId = String((admission.doctorId as any)?._id ?? admission.doctorId);
      if (doctorId !== auth.context.userId.toString()) {
        return NextResponse.json({ success: false, message: "You can only view your own admissions." }, { status: 403 });
      }
    }

    const branch = admission.branchId as any;
    const branchId = String(branch?._id ?? branch ?? "");
    if (auth.grant.orgScope === "BRANCH") {
      if (!auth.context.branchId || !branchId || branchId !== auth.context.branchId.toString()) {
        return NextResponse.json({ success: false, message: "Admission belongs to another branch." }, { status: 403 });
      }
    }
    if (auth.grant.orgScope === "ORGANIZATION") {
      if (!auth.context.organizationId || !branchId) {
        return NextResponse.json({ success: false, message: "Admission is outside your organization." }, { status: 403 });
      }
      const branchRecord = branch?.headQuarter !== undefined
        ? branch
        : await Organization.findById(branchId).select("headQuarter").lean();
      const organizationId = auth.context.organizationId.toString();
      if (branchId !== organizationId && String((branchRecord as any)?.headQuarter ?? "") !== organizationId) {
        return NextResponse.json({ success: false, message: "Admission is outside your organization." }, { status: 403 });
      }
    }

    if (admission.status !== "DISCHARGED") {
      return NextResponse.json({ success: false, message: "This admission has not been discharged yet." }, { status: 409 });
    }

    const invoice = await Invoice.findOne({ admissionId: new Types.ObjectId(id), status: { $ne: "CANCELLED" } })
      .sort({ createdAt: -1 })
      .lean();
    if (!isBillingCompleted(invoice)) {
      return NextResponse.json({ success: false, message: "No final invoice is linked to this admission." }, { status: 409 });
    }

    const advances = await Payment.find({ invoiceId: invoice._id, type: "ADVANCE" }).select("amount").lean();
    const advanceReceived = advances.reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0);
    const advanceAdjusted = Math.min(advanceReceived, Math.max(0, Number(invoice.paidAmount) || 0), Math.max(0, Number(invoice.finalAmount) || 0));
    const hospital = await getHospitalProfile();
    const fullFile = await buildDischargeFullFile(admission, hospital.timeZone);

    return NextResponse.json({ success: true, data: { admission, invoice, advanceAdjusted, fullFile, documentId: `DSP-${id.toUpperCase()}` } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load the discharge packet.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
