import { promises as fs } from "fs";
import path from "path";

export const UPLOAD_DIR = path.join(process.cwd(), "uploads");

const EXT_CONTENT_TYPES: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    gif: "image/gif",
};

const IMAGE_EXTENSIONS = new Set(Object.keys(EXT_CONTENT_TYPES));

export interface LocalUploadResult {
    fileUrl: string;
    key: string;
    fileName: string;
    fileSize: string;
    contentType: string;
    storageProvider: "local";
}

function safeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9.-]/g, "_").toLowerCase();
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * Resolves a storage key ("logos/<file>.png") to an absolute path inside the
 * uploads folder. Returns null for absolute keys, `..` traversal, anything
 * that escapes the folder, or a non-image extension.
 */
export function resolveUploadPath(key: string): string | null {
    const normalized = (key || "").replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    if (!parts.length || parts.includes("..")) return null;

    const resolved = path.join(UPLOAD_DIR, ...parts);
    if (!resolved.startsWith(UPLOAD_DIR + path.sep)) return null;

    const ext = path.extname(resolved).slice(1).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) return null;
    return resolved;
}

/**
 * Writes a buffer into the backend's own uploads folder and returns an app
 * relative URL (the "current path") plus the storage key, so the served file
 * always comes from this deployment regardless of any external image store.
 */
export async function saveUpload(
    buffer: Buffer | Uint8Array,
    originalName: string,
    contentType: string,
    folder = "uploads"
): Promise<LocalUploadResult> {
    const timestamp = Date.now();
    const key = `${folder}/${timestamp}_${safeName(originalName)}`;
    const filePath = resolveUploadPath(key);
    if (!filePath) throw new Error("Invalid upload path.");

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);

    const ext = path.extname(filePath).slice(1).toLowerCase();
    return {
        fileUrl: `/uploads/${key}`,
        key,
        fileName: originalName,
        fileSize: formatBytes(buffer.length),
        contentType: EXT_CONTENT_TYPES[ext] ?? contentType,
        storageProvider: "local",
    };
}

/** Removes a locally stored upload. False when the key is not a local file. */
export async function deleteUpload(key: string): Promise<boolean> {
    const filePath = resolveUploadPath(key);
    if (!filePath) return false;
    try {
        await fs.unlink(filePath);
        return true;
    } catch {
        return false;
    }
}

export function contentTypeForExtension(ext: string): string | undefined {
    return EXT_CONTENT_TYPES[ext.toLowerCase()];
}