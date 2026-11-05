/**
 * Pure helpers for opening a patient document without a public link.
 *
 * Documents keep their original `fileUrl`, but every uploaded document created
 * from now on also stores the object-storage `storageKey`. Readers never open
 * `fileUrl` directly again — they ask
 * `GET /api/patient/documents/<id>/url`, which either signs the storage key for
 * five minutes or returns the untouched legacy URL for records that have not
 * been migrated yet.
 *
 * No server-only imports: the migration script, the API and the tests share
 * these functions so a key cannot be derived in three different ways.
 */

/** How long an authorized read link stays usable. */
export const SIGNED_URL_TTL_SECONDS = 5 * 60;

/**
 * The bucket this deployment stores documents in — mirrors
 * `SUPABASE_BUCKET` in `src/lib/storage.ts`, where the upload path derives the
 * same value for its URLs.
 */
const CONFIGURED_BUCKET =
    process.env.SUPABASE_BUCKET_NAME || process.env.S3_BUCKET_NAME || process.env.S3_BUCKET || process.env.SUPABASE_BUCKET || "medistra-documents";

const SUPABASE_OBJECT_PATH = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/;

/** The storage key a legacy public URL points at, or `null` when unknown. */
export function deriveStorageKeyFromUrl(raw: string): string | null {
    const value = (raw || "").trim();
    if (!value) return null;

    let url: URL;
    try {
        url = new URL(value.split(/[?#]/)[0]);
    } catch {
        return null;
    }

    // Supabase/Supabase-S3-style public links: /object/public/<bucket>/<key>
    const supabase = SUPABASE_OBJECT_PATH.exec(url.pathname);
    if (supabase) return supabase[2] || null;

    // Virtual-host S3 links: https://<bucket>.s3.<region>.amazonaws.com/<key>
    const host = url.hostname;
    if (/\.s3[.-]/.test(host) || /\.amazonaws\.com$/.test(host)) {
        return url.pathname.replace(/^\/+/, "") || null;
    }

    // Path-style links (Supabase S3 gateway, MinIO, dev fallback): /<bucket>/<key>
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length >= 2 && segments[0] === CONFIGURED_BUCKET) {
        return segments.slice(1).join("/");
    }

    return null;
}

export type DocumentOpenLink =
    /** Post-migration record: sign this storage key for a short time. */
    | { kind: "signed"; storageKey: string; expiresIn: number }
    /** Legacy record with only a public URL: returned unchanged until migrated. */
    | { kind: "legacy"; url: string };

/** Decides how the URL endpoint serves one document record. */
export function documentOpenLink(
    document: { fileUrl: string; storageKey?: string },
    ttl: number = SIGNED_URL_TTL_SECONDS
): DocumentOpenLink {
    const storageKey = (document.storageKey || "").trim();
    if (storageKey) return { kind: "signed", storageKey, expiresIn: ttl };
    return { kind: "legacy", url: document.fileUrl };
}
