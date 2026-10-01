import dbConnect from "@/lib/dbConnect";
import OrganizationSetting, { IOrganizationSetting } from "@/models/organization-setting.model";

export class OrganizationMgmtService {

  /**
   * Hospital legal & billing settings (PAN, GSTIN, ₹ Currency, letterhead)
   */
  static async getOrgSettings() {
    await dbConnect();

    let settings = await OrganizationSetting.findOne().lean();
    if (!settings) {
      settings = await OrganizationSetting.create({
        cinNumber: "U85110WB2018PTC224890",
        panNumber: "AAACM8912P",
        gstin: "19AAACM8912P1ZV",
        currency: "INR",
        currencySymbol: "₹",
        fiscalYearStart: "April",
        fiscalYearEnd: "March",
        tagline: "Centre of Excellence in Tertiary & Quaternary Healthcare",
        website: "https://medistra.hospital",
        emergencyHotline: "+91 33 2345 6780",
        letterheadHeader: "MEDISTRA HEALTHCARE SYSTEM - TRUSTED CLINICAL EXCELLENCE",
        letterheadFooter: "12 Medical Enclave, Central Avenue, Kolkata | 24x7 Helpline: 1800-200-8899",
      });
    }

    return settings as IOrganizationSetting;
  }

  static async updateOrgSettings(data: Partial<IOrganizationSetting>) {
    await dbConnect();

    let settings = await OrganizationSetting.findOne();
    if (!settings) {
      settings = await OrganizationSetting.create(data);
    } else {
      Object.assign(settings, data);
      await settings.save();
    }

    return settings;
  }

}
