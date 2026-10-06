import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import storage from "@/lib/storage";
import patientService from "@/services/patient.service";
import dbConnect from "@/lib/dbConnect";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/lib/rbac/permissions";

const VALID_DOCUMENT_CATEGORIES = [
    "LAB_REPORT",
    "PRESCRIPTION",
    "DISCHARGE_SUMMARY",
    "ID_PROOF",
    "CONSENT_FORM",
    "RADIOLOGY",
    "OTHER"
] as const;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED_FOLDERS = new Set(["documents", "patients", "radiology", "lab", "discharge"]);

/**
 * Clinical documents are images, PDFs and plain text. Anything else (an
 * executable, an HTML page that would run script when opened from the bucket's
 * public URL) is refused before it reaches storage.
 */
const ALLOWED_CONTENT_TYPES = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/tiff",
    "text/plain"
]);

const EXTENSION_CONTENT_TYPES: Readonly<Record<string, string>> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    tif: "image/tiff",
    tiff: "image/tiff",
    txt: "text/plain"
};

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        await dbConnect();

        // Every authenticated role could previously upload a file and attach it
        // to an arbitrary patientId supplied by the client.
        const authResult = await authorizeRequest(request, PERMISSION_KEYS.PATIENT_DOC_UPLOAD, "Patient");
        if (!authResult.isAuthorized) return authResult.response;

        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const rawCategory = (formData.get("category") as string) || "OTHER";
        const rawFolder = (formData.get("folder") as string) || "documents";
        const title = (formData.get("title") as string) || (file ? file.name : "Uploaded Document");
        const patientId = formData.get("patientId") as string | null;
        const notes = (formData.get("notes") as string) || "";

        if (!file) {
            return NextResponse.json(
                { success: false, message: "No file provided in the request" },
                { status: 400 }
            );
        }

        if (file.size > MAX_UPLOAD_BYTES) {
            return NextResponse.json(
                { success: false, message: "File exceeds the 10 MB upload limit" },
                { status: 413 }
            );
        }

        if (file.size === 0) {
            return NextResponse.json(
                { success: false, message: "The uploaded file is empty" },
                { status: 400 }
            );
        }

        const extension = (file.name.split(".").pop() ?? "").toLowerCase();
        const declaredType = (file.type || "").toLowerCase();
        const expectedType = EXTENSION_CONTENT_TYPES[extension];

        // Browsers are inconsistent about the declared type, so the extension is
        // checked too. An .html or .svg file served from the bucket would execute.
        if (!ALLOWED_CONTENT_TYPES.has(declaredType) || (expectedType && expectedType !== declaredType)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Only PDF, JPG, PNG, WEBP, GIF, TIFF or TXT documents can be uploaded"
                },
                { status: 415 }
            );
        }

        if (patientId && !Types.ObjectId.isValid(patientId)) {
            return NextResponse.json(
                { success: false, message: "Invalid patient ID" },
                { status: 400 }
            );
        }

        // Do not let the caller steer the storage key outside known prefixes.
        const folder = ALLOWED_FOLDERS.has(rawFolder) ? rawFolder : "documents";
        const category = (VALID_DOCUMENT_CATEGORIES as readonly string[]).includes(rawCategory)
            ? rawCategory
            : "OTHER";

        // Confirm the patient is inside the caller's scope *before* writing to
        // storage. Validating afterwards left an unreachable file in the bucket
        // every time the link was rejected.
        let patient: Awaited<ReturnType<typeof patientService.getPatientByIdScoped>> = null;

        if (patientId) {
            patient = await patientService.getPatientByIdScoped(
                new Types.ObjectId(patientId),
                authResult.filter as Record<string, unknown>
            );

            if (!patient) {
                return NextResponse.json(
                    { success: false, message: "Patient not found or not accessible" },
                    { status: 404 }
                );
            }
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const uploadResult = await storage.uploadFile(
            buffer,
            file.name,
            declaredType,
            folder
        );

        let patientDocument = null;

        if (patientId && patient) {
            const updatedPatient = await patientService.addDocument(
                new Types.ObjectId(patientId),
                {
                    title,
                    category: category as (typeof VALID_DOCUMENT_CATEGORIES)[number],
                    fileName: uploadResult.fileName,
                    fileUrl: uploadResult.fileUrl,
                    fileSize: uploadResult.fileSize,
                    notes
                },
                authResult.filter as Record<string, unknown>
            );

            // The file is already stored, so a link failure is reported rather
            // than swallowed: the caller needs to know the chart was not updated.
            if (!updatedPatient) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "File was uploaded but could not be attached to the patient record",
                        data: { ...uploadResult }
                    },
                    { status: 409 }
                );
            }

            patientDocument = updatedPatient?.documents?.[updatedPatient.documents.length - 1] || null;
        }

        return NextResponse.json(
            {
                success: true,
                message: "Document uploaded successfully to storage bucket",
                data: {
                    ...uploadResult,
                    title,
                    category,
                    notes,
                    patientDocument
                }
            },
            { status: 201 }
        );
    } catch (error: any) {
        console.error("Upload API Error:", error);
        return NextResponse.json(
            {
                success: false,
                message: error?.message || "Failed to upload file to storage"
            },
            { status: 500 }
        );
    }
}
