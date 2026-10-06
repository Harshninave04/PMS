import dbConnect from "@/lib/dbConnect";
import SoftwareMetadata from "@/models/software-metadata.model";
import {
  DEFAULT_SOFTWARE_BRANDING,
  SOFTWARE_BRANDING_LIMITS,
  isSafeLogoUrl,
  type SoftwareBranding,
} from "@/lib/software-branding";

type RawDocument = Partial<Record<keyof SoftwareBranding, unknown>>;

const FIELD_LABELS: Readonly<Record<keyof SoftwareBranding, string>> = {
  softwareName: "Software name",
  tagline: "Tagline",
  description: "Description",
  logoUrl: "Logo",
  logoKey: "Logo",
  authorName: "Author name",
  authorWebsite: "Author website",
  version: "Version",
  copyright: "Copyright",
};

/**
 * Fields the settings screen always sends. The logo pair is deliberately left
 * out: it is sent only when the admin actually uploads or removes a logo, so an
 * unrelated edit never touches the stored file.
 */
const TEXT_FIELDS = [
  "softwareName",
  "tagline",
  "description",
  "authorName",
  "authorWebsite",
  "version",
  "copyright",
] as const;

/** True while `next build` is prerendering, when there is no database to ask. */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/** Merges a stored document over the defaults, so missing fields fall back cleanly. */
export function brandingFrom(doc: RawDocument | null | undefined): SoftwareBranding {
  const branding: SoftwareBranding = { ...DEFAULT_SOFTWARE_BRANDING };
  if (!doc) return branding;

  for (const field of Object.keys(DEFAULT_SOFTWARE_BRANDING) as (keyof SoftwareBranding)[]) {
    const value = doc[field];
    if (typeof value === "string") branding[field] = value.trim();
  }
  if (!branding.softwareName) branding.softwareName = DEFAULT_SOFTWARE_BRANDING.softwareName;
  return branding;
}

export class SoftwareMetadataService {
  /**
   * The current software metadata, always resolvable: a build without a
   * database, or a database that is briefly unreachable, falls back to the
   * shipped defaults instead of failing the page that asked.
   */
  static async getBranding(): Promise<SoftwareBranding> {
    if (isBuildPhase()) return { ...DEFAULT_SOFTWARE_BRANDING };
    try {
      await dbConnect();
      const doc = await SoftwareMetadata.findOne().lean();
      return brandingFrom(doc as RawDocument | null);
    } catch {
      return { ...DEFAULT_SOFTWARE_BRANDING };
    }
  }

  /**
   * Validates and saves an administrator's edit of the software metadata.
   * Only whitelisted fields are written; anything unrecognised is ignored and
   * any value that fails validation is reported without touching the document.
   */
  static async updateBranding(input: unknown): Promise<{ branding: SoftwareBranding; error?: string }> {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return { branding: await this.getBranding(), error: "Invalid request body." };
    }
    const body = input as Record<string, unknown>;
    const patch: Partial<Record<keyof SoftwareBranding, string>> = {};
    const current = await this.getBranding();
    const reject = (message: string) => ({ branding: current, error: message });

    for (const field of TEXT_FIELDS) {
      if (!(field in body) || body[field] === undefined || body[field] === null) continue;
      if (typeof body[field] !== "string") return reject(`${FIELD_LABELS[field]} must be text.`);

      const value = (body[field] as string).trim();
      if (!value && field === "softwareName") return reject("Software name is required.");
      if (value.length > SOFTWARE_BRANDING_LIMITS[field]) {
        return reject(`${FIELD_LABELS[field]} must be ${SOFTWARE_BRANDING_LIMITS[field]} characters or fewer.`);
      }
      patch[field] = value;
    }

    if ("logoUrl" in body && body.logoUrl !== undefined && body.logoUrl !== null) {
      if (typeof body.logoUrl !== "string") return reject(`${FIELD_LABELS.logoUrl} must be a URL.`);
      const value = body.logoUrl.trim();
      if (value.length > SOFTWARE_BRANDING_LIMITS.logoUrl) {
        return reject(`${FIELD_LABELS.logoUrl} must be ${SOFTWARE_BRANDING_LIMITS.logoUrl} characters or fewer.`);
      }
      if (!isSafeLogoUrl(value)) return reject("Logo must be an image URL starting with https:// or /.");
      patch.logoUrl = value;
    }

    if ("logoKey" in body && body.logoKey !== undefined && body.logoKey !== null) {
      if (typeof body.logoKey !== "string") return reject(`${FIELD_LABELS.logoKey} is invalid.`);
      const value = body.logoKey.trim();
      if (value.length > SOFTWARE_BRANDING_LIMITS.logoKey) {
        return reject(`${FIELD_LABELS.logoKey} must be ${SOFTWARE_BRANDING_LIMITS.logoKey} characters or fewer.`);
      }
      patch.logoKey = value;
    }

    await dbConnect();
    const before = await SoftwareMetadata.findOne().lean();

    if (!Object.keys(patch).length) {
      return { branding: brandingFrom(before as RawDocument | null) };
    }

    const doc = await SoftwareMetadata.findOneAndUpdate(
      {},
      { $set: patch },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
    const branding = brandingFrom(doc.toObject() as RawDocument);

    const previousKey = typeof (before as RawDocument | null)?.logoKey === "string"
      ? String((before as RawDocument).logoKey)
      : "";
    if (previousKey && previousKey !== branding.logoKey) {
      try {
        const { deleteUpload } = await import("@/lib/uploads");
        await deleteUpload(previousKey);
      } catch {
        // Replacing a logo must never fail the save because cleanup did.
      }
    }

    return { branding };
  }
}
