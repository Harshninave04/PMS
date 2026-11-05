import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { createHmac, createHash } from "node:crypto";

// Support both SUPABASE_URL and typo SUPERBASE_URL from env
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPERBASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || "";
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET_NAME || process.env.S3_BUCKET_NAME || "medistra-documents";

// S3 Configurations
const S3_ENDPOINT = process.env.S3_ENDPOINT || (SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/s3` : "");
const S3_REGION = process.env.S3_REGION || "us-east-1";
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "";
const S3_SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "";
const S3_BUCKET = process.env.S3_BUCKET_NAME || SUPABASE_BUCKET;

export interface UploadResult {
    fileUrl: string;
    key: string;
    fileName: string;
    fileSize: string;
    contentType: string;
    storageProvider: "supabase" | "s3" | "local_fallback";
}

/** Thrown when no real storage provider is configured outside development. */
export class StorageUnconfiguredError extends Error {
    constructor() {
        super("Object storage is not configured for this deployment");
        this.name = "StorageUnconfiguredError";
    }
}

export function isDevelopmentEnvironment(): boolean {
    return process.env.NODE_ENV === "development";
}

export interface SignedUrlResult {
    url: string;
    expiresIn: number;
}

/* -------------------------------------------------------------------------- */
/* S3 SigV4 presigned GET (no s3-request-presigner dependency)                */
/* -------------------------------------------------------------------------- */

/** RFC 3986 percent-encoding (AWS canonical-URI rules). */
function uriEncode(value: string): string {
    return encodeURIComponent(value).replace(/[!'()*]/g, (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase());
}

function sha256Hex(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmacSha256(key: Buffer | string, value: string): Buffer {
    return createHmac("sha256", key).update(value, "utf8").digest();
}

/**
 * Presigns a GET for `key` using SigV4 query encoding. Only used by the S3
 * gateway path; the Supabase client signs URLs with `createSignedUrl`.
 */
function presignS3GetObject(key: string, expireSeconds: number): string {
    const base = S3_ENDPOINT
        ? new URL(S3_ENDPOINT)
        : new URL(`https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`);
    const path = (S3_ENDPOINT ? `/${S3_BUCKET}/${key}` : `/${key}`)
        .split("/")
        .filter(Boolean)
        .map(uriEncode)
        .join("/");
    const authority = base.host;

    const timestamp = new Date();
    const amzDate = timestamp.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}$/, "");
    const dateStamp = amzDate.slice(0, 8);

    const credential = `${S3_ACCESS_KEY}/${dateStamp}/${S3_REGION}/s3/aws4_request`;
    // AWS requires query names in byte order — this list already is.
    const canonicalQuery = [
        ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
        ["X-Amz-Credential", credential],
        ["X-Amz-Date", amzDate],
        ["X-Amz-Expires", String(expireSeconds)],
        ["X-Amz-SignedHeaders", "host"],
    ].map(([name, value]) => `${name}=${uriEncode(value)}`).join("&");

    const canonicalRequest = [
        "GET",
        path,
        canonicalQuery,
        `host:${authority}`,
        "",
        "host",
        "UNSIGNED-PAYLOAD"
    ].join("\n");

    const stringToSign = [
        "AWS4-HMAC-SHA256",
        amzDate,
        `${dateStamp}/${S3_REGION}/s3/aws4_request`,
        sha256Hex(canonicalRequest)
    ].join("\n");

    const kDate = hmacSha256(`AWS4${S3_SECRET_KEY}`, dateStamp);
    const kRegion = hmacSha256(kDate, S3_REGION);
    const kService = hmacSha256(kRegion, "s3");
    const kSigning = hmacSha256(kService, "aws4_request");
    const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

    return `${base.protocol}//${authority}/${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

class StorageService {
    private supabaseClient: SupabaseClient | null = null;
    private s3Client: S3Client | null = null;
    private bucketInitialized = false;

    constructor() {
        // Initialize Supabase Client if URL and Key are available
        if (SUPABASE_URL && SUPABASE_KEY) {
            try {
                this.supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
                    auth: { persistSession: false }
                });
            } catch (err) {
                console.error("Failed to initialize Supabase client:", err);
            }
        }

        // Initialize S3 Client if S3 credentials are provided
        if (S3_ACCESS_KEY && S3_SECRET_KEY) {
            try {
                this.s3Client = new S3Client({
                    region: S3_REGION,
                    endpoint: S3_ENDPOINT || undefined,
                    forcePathStyle: true, // Necessary for Supabase S3 & MinIO
                    credentials: {
                        accessKeyId: S3_ACCESS_KEY,
                        secretAccessKey: S3_SECRET_KEY
                    }
                });
            } catch (err) {
                console.error("Failed to initialize S3 client:", err);
            }
        }
    }

    /**
     * Ensures that the target storage bucket exists.
     */
    async ensureBucket(): Promise<void> {
        if (this.bucketInitialized) return;

        if (this.supabaseClient) {
            try {
                const { data: buckets, error } = await this.supabaseClient.storage.listBuckets();
                if (!error && buckets) {
                    const exists = buckets.some((b) => b.name === SUPABASE_BUCKET);
                    if (!exists) {
                        // New buckets start out private. The visibility of an
                        // existing bucket is never changed from code — that is
                        // a manual operator task after data migration.
                        await this.supabaseClient.storage.createBucket(SUPABASE_BUCKET, {
                            public: false,
                            fileSizeLimit: 52428800 // 50 MB
                        });
                    }
                }
            } catch (err) {
                console.warn("Could not verify Supabase bucket existence (may already exist):", err);
            }
        } else if (this.s3Client) {
            try {
                await this.s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
            } catch (err) {
                try {
                    await this.s3Client.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
                } catch (createErr) {
                    // Bucket may already exist or permissions prevent creation
                }
            }
        }

        this.bucketInitialized = true;
    }

    /**
     * A short-lived, authorized download link for an object this service knows
     * by key. Never changes bucket visibility or object ACLs.
     */
    async createSignedUrl(key: string, expireSeconds = 300): Promise<SignedUrlResult> {
        if (!key) throw new Error("A storage key is required to create a signed URL");

        // 1. Supabase storage API signs URLs for both public and private buckets.
        if (this.supabaseClient) {
            try {
                const { data, error } = await this.supabaseClient.storage
                    .from(SUPABASE_BUCKET)
                    .createSignedUrl(key, expireSeconds);
                if (!error && data?.signedUrl) return { url: data.signedUrl, expiresIn: expireSeconds };
                console.warn("Supabase signed URL failed, trying the S3 gateway instead:", error);
            } catch (err) {
                console.warn("Supabase signed URL request failed, trying the S3 gateway instead:", err);
            }
        }

        // 2. S3-compatible gateway: presign a GET with SigV4 query parameters.
        if (this.s3Client) {
            return { url: presignS3GetObject(key, expireSeconds), expiresIn: expireSeconds };
        }

        // 3. Development fallback (same fake host the fallback upload used),
        // so the signed-URL endpoint keeps working while credentials are filled in.
        if (isDevelopmentEnvironment()) {
            return {
                url: `https://storage.medistra.hospital/${SUPABASE_BUCKET}/${key}`,
                expiresIn: expireSeconds
            };
        }

        throw new StorageUnconfiguredError();
    }

    /**
     * Uploads a file buffer or stream to object storage.
     */
    async uploadFile(
        fileBuffer: Buffer | Uint8Array,
        originalName: string,
        contentType: string,
        folder = "documents"
    ): Promise<UploadResult> {
        await this.ensureBucket();

        const timestamp = Date.now();
        const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_").toLowerCase();
        const key = `${folder}/${timestamp}_${safeName}`;
        const sizeBytes = fileBuffer.length;
        const fileSizeFormatted = this.formatBytes(sizeBytes);

        // 1. Try S3 SDK (Supabase S3 or AWS S3)
        if (this.s3Client) {
            try {
                const command = new PutObjectCommand({
                    Bucket: S3_BUCKET,
                    Key: key,
                    Body: fileBuffer,
                    ContentType: contentType
                });

                await this.s3Client.send(command);

                let fileUrl = "";
                if (S3_ENDPOINT && S3_ENDPOINT.includes("supabase.co")) {
                    const baseUrl = S3_ENDPOINT.replace(/\/storage\/v1\/s3\/?$/, "");
                    fileUrl = `${baseUrl}/storage/v1/object/public/${S3_BUCKET}/${key}`;
                } else if (SUPABASE_URL) {
                    fileUrl = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${S3_BUCKET}/${key}`;
                } else if (S3_ENDPOINT) {
                    fileUrl = `${S3_ENDPOINT}/${S3_BUCKET}/${key}`;
                } else {
                    fileUrl = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
                }

                return {
                    fileUrl,
                    key,
                    fileName: originalName,
                    fileSize: fileSizeFormatted,
                    contentType,
                    storageProvider: "s3"
                };
            } catch (s3Err) {
                console.error("S3 upload error:", s3Err);
                throw s3Err;
            }
        }

        // 2. Try Supabase Storage JS SDK
        if (this.supabaseClient) {
            try {
                const { data, error } = await this.supabaseClient.storage
                    .from(SUPABASE_BUCKET)
                    .upload(key, fileBuffer, {
                        contentType,
                        upsert: true
                    });

                if (error) {
                    console.error("Supabase storage upload error:", error);
                    throw error;
                }

                const { data: publicUrlData } = this.supabaseClient.storage
                    .from(SUPABASE_BUCKET)
                    .getPublicUrl(key);

                return {
                    fileUrl: publicUrlData.publicUrl,
                    key,
                    fileName: originalName,
                    fileSize: fileSizeFormatted,
                    contentType,
                    storageProvider: "supabase"
                };
            } catch (supabaseErr) {
                console.warn("Supabase upload attempt failed, trying fallback...", supabaseErr);
            }
        }


        // 3. Development Fallback (when storage keys not yet filled in env)
        // The fallback link is fake and would silently lose the uploaded file,
        // so outside development this is refused instead of reported as success.
        if (!isDevelopmentEnvironment()) {
            throw new StorageUnconfiguredError();
        }
        console.warn("⚠️ No Supabase or S3 credentials found. Using fallback mock storage link.");
        const fallbackUrl = `https://storage.medistra.hospital/${SUPABASE_BUCKET}/${key}`;
        return {
            fileUrl: fallbackUrl,
            key,
            fileName: originalName,
            fileSize: fileSizeFormatted,
            contentType,
            storageProvider: "local_fallback"
        };
    }

    /**
     * Deletes a file from storage.
     */
    async deleteFile(key: string): Promise<boolean> {
        if (this.supabaseClient) {
            try {
                const { error } = await this.supabaseClient.storage
                    .from(SUPABASE_BUCKET)
                    .remove([key]);
                return !error;
            } catch (err) {
                console.error("Supabase file delete error:", err);
                return false;
            }
        }

        if (this.s3Client) {
            try {
                await this.s3Client.send(new DeleteObjectCommand({
                    Bucket: S3_BUCKET,
                    Key: key
                }));
                return true;
            } catch (err) {
                console.error("S3 file delete error:", err);
                return false;
            }
        }

        return true;
    }

    private formatBytes(bytes: number, decimals = 1): string {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
    }
}

export const storage = new StorageService();
export default storage;
