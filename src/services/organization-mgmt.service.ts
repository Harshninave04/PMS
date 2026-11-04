import dbConnect from "@/lib/dbConnect";
import OrganizationSetting, { IOrganizationSetting } from "@/models/organization-setting.model";

export class OrganizationMgmtService {
  static async getOrgSettings() {
    await dbConnect();
    const settings = (await OrganizationSetting.findOne().lean()) as IOrganizationSetting | null;
    return settings ? { ...settings, billDiscountCapPercent: settings.billDiscountCapPercent ?? 10 } : { billDiscountCapPercent: 10 };
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
