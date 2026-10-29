import mongoose, { Schema, Document } from "mongoose";
import { DEFAULT_HOSPITAL_TIME_ZONE } from "@/types/hospital-profile";

export interface IOrganizationSetting extends Document {
  cinNumber?: string;
  panNumber?: string;
  gstin?: string;
  currency: string;
  currencySymbol: string;
  fiscalYearStart: string;
  fiscalYearEnd: string;
  timeZone: string;
  tagline?: string;
  website?: string;
  emergencyHotline?: string;
  letterheadHeader?: string;
  letterheadFooter?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSettingSchema: Schema = new Schema(
  {
    cinNumber: { type: String, trim: true },
    panNumber: { type: String, trim: true },
    gstin: { type: String, trim: true },
    currency: { type: String, default: "INR" },
    timeZone: { type: String, trim: true, default: DEFAULT_HOSPITAL_TIME_ZONE },
    currencySymbol: { type: String, default: "₹" },
    fiscalYearStart: { type: String, default: "April" },
    fiscalYearEnd: { type: String, default: "March" },
    tagline: { type: String, trim: true },
    website: { type: String, trim: true },
    emergencyHotline: { type: String, trim: true },
    letterheadHeader: { type: String, trim: true },
    letterheadFooter: { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.models.OrganizationSetting ||
  mongoose.model<IOrganizationSetting>("OrganizationSetting", OrganizationSettingSchema);
