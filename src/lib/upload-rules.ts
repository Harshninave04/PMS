/**
 * Upload rules for patient documents: a hard size cap plus a strict
 * extension + magic-byte allow-list (PDF, JPG, JPEG, PNG, WEBP).
 *
 * The browser's Content-Type is never trusted: the extension and the real
 * bytes of the buffered file must both agree before a document is stored.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const EXTENSION_MIME: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
};

export type UploadVerdict =
    | { ok: true; mimeType: string }
    | { ok: false; status: 400 | 413; message: string };

export function extensionOf(fileName: string): string {
    const dot = fileName.lastIndexOf(".");
    return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

function magicBytesMatch(buffer: Buffer, expected: number[], offset = 0): boolean {
    return expected.every((byte, i) => buffer.length > offset + i && buffer[offset + i] === byte);
}

function isPdfMagic(buffer: Buffer): boolean {
    return magicBytesMatch(buffer, [0x25, 0x50, 0x44, 0x46]); // "%PDF"
}

function isJpegMagic(buffer: Buffer): boolean {
    return magicBytesMatch(buffer, [0xff, 0xd8, 0xff]);
}

function isPngMagic(buffer: Buffer): boolean {
    return magicBytesMatch(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function isWebpMagic(buffer: Buffer): boolean {
    // "RIFF" at the start, "WEBP" at offset 8
    return magicBytesMatch(buffer, [0x52, 0x49, 0x46, 0x46]) && magicBytesMatch(buffer, [0x57, 0x45, 0x42, 0x50], 8);
}

function magicOkFor(extension: string, buffer: Buffer): boolean {
    switch (extension) {
        case "pdf": return isPdfMagic(buffer);
        case "jpg":
        case "jpeg": return isJpegMagic(buffer);
        case "png": return isPngMagic(buffer);
        case "webp": return isWebpMagic(buffer);
        default: return false;
    }
}

export function validateUploadFile(buffer: Buffer, fileName: string): UploadVerdict {
    if (buffer.length > MAX_UPLOAD_BYTES) {
        return { ok: false, status: 413, message: "File exceeds the 10 MB upload limit" };
    }
    const extension = extensionOf(fileName);
    const mimeType = EXTENSION_MIME[extension];
    if (!mimeType) {
        return {
            ok: false,
            status: 400,
            message: 'File type is not allowed — upload a PDF, JPG, JPEG, PNG or WEBP file',
        };
    }
    if (!magicOkFor(extension, buffer)) {
        return {
            ok: false,
            status: 400,
            message: "File contents do not match the file type — the upload was rejected",
        };
    }
    return { ok: true, mimeType };
}
