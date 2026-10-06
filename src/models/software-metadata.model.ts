import mongoose, { Schema, Document } from "mongoose";
import { DEFAULT_SOFTWARE_BRANDING } from "@/lib/software-branding";

export interface ISoftwareMetadata extends Document {
  softwareName: string;
  tagline: string;
  description: string;
  logoUrl: string;
  logoKey: string;
  authorName: string;
  authorWebsite: string;
  version: string;
  copyright: string;
  createdAt: Date;
  updatedAt: Date;
}

const SoftwareMetadataSchema: Schema = new Schema(
  {
    softwareName: { type: String, required: true, trim: true, default: DEFAULT_SOFTWARE_BRANDING.softwareName },
    tagline: { type: String, trim: true, default: DEFAULT_SOFTWARE_BRANDING.tagline },
    description: { type: String, trim: true, default: DEFAULT_SOFTWARE_BRANDING.description },
    logoUrl: { type: String, trim: true, default: DEFAULT_SOFTWARE_BRANDING.logoUrl },
    logoKey: { type: String, trim: true, default: DEFAULT_SOFTWARE_BRANDING.logoKey },
    authorName: { type: String, trim: true, default: DEFAULT_SOFTWARE_BRANDING.authorName },
    authorWebsite: { type: String, trim: true, default: DEFAULT_SOFTWARE_BRANDING.authorWebsite },
    version: { type: String, trim: true, default: DEFAULT_SOFTWARE_BRANDING.version },
    copyright: { type: String, trim: true, default: DEFAULT_SOFTWARE_BRANDING.copyright },
  },
  { timestamps: true }
);

export default mongoose.models.SoftwareMetadata ||
  mongoose.model<ISoftwareMetadata>("SoftwareMetadata", SoftwareMetadataSchema);
