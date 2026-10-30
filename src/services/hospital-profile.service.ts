import { cache } from "react";
import dbConnect from "@/lib/dbConnect";
import Organization from "@/models/organization.model";
import OrganizationSetting from "@/models/organization-setting.model";
import { hospitalProfileFromRecords } from "@/types/hospital-profile";

export const getHospitalProfile = cache(async () => {
  await dbConnect();
  const [organization, settings] = await Promise.all([
    Organization.findOne({ branchType: "MAIN", isActive: true })
      .select("organizationName organizationId email phone address city state pincode country logo")
      .lean(),
    OrganizationSetting.findOne().select("gstin timeZone").lean(),
  ]);
  return hospitalProfileFromRecords(
    organization as Record<string, unknown> | null,
    settings as Record<string, unknown> | null,
  );
});
