/**
 * The product-level metadata an administrator manages from
 * Settings > Software Metadata: the product name, logo, authorship, version and
 * the copy shown on the login screen, in the sidebar and in the browser tab.
 *
 * Kept free of server-only imports (no mongoose, no storage SDK) so the server
 * layouts, the client sidebar and the settings screen can all share one shape
 * and one set of defaults.
 */

export interface SoftwareBranding {
    /** Product name, e.g. "Medistra HMS". */
    softwareName: string;
    /** Short line under the product name in the sidebar and on the login screen. */
    tagline: string;
    /** Browser meta description. */
    description: string;
    /** Logo URL; empty falls back to the built-in icon. */
    logoUrl: string;
    /** Storage key of the uploaded logo, so a replacement can be cleaned up. */
    logoKey: string;
    /** Person or company credited as the author of the software. */
    authorName: string;
    authorWebsite: string;
    /** Product version, shown on the login screen and the settings page. */
    version: string;
    copyright: string;
}

export const SOFTWARE_BRANDING_FIELDS: readonly (keyof SoftwareBranding)[] = [
    "softwareName",
    "tagline",
    "description",
    "logoUrl",
    "logoKey",
    "authorName",
    "authorWebsite",
    "version",
    "copyright",
];

/** Longest value each field may hold, enforced on every write. */
export const SOFTWARE_BRANDING_LIMITS: Readonly<Record<keyof SoftwareBranding, number>> = {
    softwareName: 80,
    tagline: 120,
    description: 300,
    logoUrl: 500,
    logoKey: 300,
    authorName: 80,
    authorWebsite: 200,
    version: 30,
    copyright: 200,
};

export const DEFAULT_SOFTWARE_BRANDING: SoftwareBranding = {
    softwareName: "Medistra HMS",
    tagline: "Healthcare Admin",
    description: "Medistra Hospital Management System",
    logoUrl: "",
    logoKey: "",
    authorName: "Medistra Technologies",
    authorWebsite: "https://medistra.hospital",
    version: "0.1.0",
    copyright: `© ${new Date().getFullYear()} Medistra Technologies. All rights reserved.`,
};

/**
 * Splits a product name into the part shown plain and the trailing word shown
 * in the accent colour ("Medistra HMS" -> "Medistra" + "HMS"). A single-word
 * name has no accent.
 */
export function splitBrandName(name: string): { head: string; accent: string | null } {
    const trimmed = (name || "").trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) return { head: trimmed, accent: null };
    const accent = parts.pop() as string;
    return { head: parts.join(" "), accent };
}

/**
 * True for values that may be stored as the logo URL: root-relative paths and
 * absolute http(s) URLs. Anything else (`javascript:`, `data:`, ...) is refused.
 */
export function isSafeLogoUrl(value: string): boolean {
    if (!value) return true;
    if (value.startsWith("/") && !value.startsWith("//")) return true;
    return /^https?:\/\/\S+$/i.test(value);
}
