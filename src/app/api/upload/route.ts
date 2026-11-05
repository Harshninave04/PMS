import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import storage, { StorageUnconfiguredError } from "@/lib/storage";
import patientService from "@/services/patient.service";
import dbConnect from "@/lib/dbConnect";
import { authorizeRequest, requirePermission } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";
import { isDoctorActor, isPatientAssignedToDoctor } from "@/lib/rbac/doctor-scope";
import { isBranchConfined, recordBranchOutsideScope } from "@/lib/rbac/branch-scope";
import { validateUploadFile } from "@/lib/upload-rules";

export async function POST(request: NextRequest): Promise<NextResponse> {
    const denied = await requirePermission(request, "patients.documents:upload");
    if (denied) return denied;

    try {
        await dbConnect();
        // The linked patient is resolved through the same scoped authorization
        // PatientController.addDocument uses, so branch-confined callers can
        // never attach files to another branch's patient (404/403 below).
        const auth = await authorizeRequest(request, PERMISSION_KEYS.PATIENT_DOC_UPLOAD, "Patient");
        if (!auth.isAuthorized) return auth.response;

        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const category = (formData.get("category") as string) || "OTHER";
        const folder = (formData.get("folder") as string) || "documents";
        const title = (formData.get("title") as string) || (file ? file.name : "Uploaded Document");
        const notes = (formData.get("notes") as string) || "";
        const patientIdRaw = formData.get("patientId") as string | null;
        const patientId = patientIdRaw?.trim() || null;

        if (!file) {
            return NextResponse.json(
                { success: false, message: "No file provided in the request" },
                { status: 400 }
            );
        }

        // Convert File to ArrayBuffer and Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Size cap + extension and magic-byte allow-list; the browser's
        // Content-Type is never trusted. Invalid patient IDs are rejected
        // instead of being silently skipped.
        const verdict = validateUploadFile(buffer, file.name);
        if (!verdict.ok) {
            return NextResponse.json(
                { success: false, message: verdict.message },
                { status: verdict.status }
            );
        }

        let patient: unknown = null;
        if (patientId) {
            if (!Types.ObjectId.isValid(patientId)) {
                return NextResponse.json(
                    { success: false, message: "Valid patient ID is required" },
                    { status: 400 }
                );
            }
            const existingPatient = await patientService.getPatientById(new Types.ObjectId(patientId));
            if (!existingPatient) {
                return NextResponse.json(
                    { success: false, message: "Patient not found" },
                    { status: 404 }
                );
            }
            if (isBranchConfined(auth) && recordBranchOutsideScope(auth, (existingPatient as { branchId?: unknown }).branchId)) {
                return NextResponse.json(
                    { success: false, message: "Forbidden: Patient belongs to another branch" },
                    { status: 403 }
                );
            }
            if (isDoctorActor(auth.context)) {
                const assigned = await isPatientAssignedToDoctor(
                    auth.context.doctorProfileId!,
                    new Types.ObjectId(patientId)
                );
                if (!assigned) {
                    return NextResponse.json(
                        { success: false, message: "Forbidden: Cannot upload documents for a patient not assigned to you" },
                        { status: 403 }
                    );
                }
            }
            patient = existingPatient;
        }

        // Upload to Supabase / S3 bucket
        let uploadResult;
        try {
            uploadResult = await storage.uploadFile(
                buffer,
                file.name,
                // MIME derived from the validated extension, not the client
                verdict.mimeType,
                folder
            );
        } catch (storageError: unknown) {
            if (storageError instanceof StorageUnconfiguredError) {
                return NextResponse.json(
                    { success: false, message: "Document storage is not configured for this deployment" },
                    { status: 503 }
                );
            }
            throw storageError;
        }

        let patientDocument = null;

        // If a patient ID was supplied, link this document to the patient record
        if (patient) {
            try {
                const validCategory = (["LAB_REPORT", "PRESCRIPTION", "DISCHARGE_SUMMARY", "ID_PROOF", "CONSENT_FORM", "RADIOLOGY", "OTHER"].includes(category)
                    ? category
                    : "OTHER") as "LAB_REPORT" | "PRESCRIPTION" | "DISCHARGE_SUMMARY" | "ID_PROOF" | "CONSENT_FORM" | "RADIOLOGY" | "OTHER";

                const updatedPatient = await patientService.addDocument(
                    new Types.ObjectId(patientId!),
                    {
                        title,
                        category: validCategory,
                        fileName: uploadResult.fileName,
                        // Keep the object-storage key so the document can be read
                        // through signed URLs after the bucket goes private.
                        storageKey: uploadResult.key,
                        fileUrl: uploadResult.fileUrl,
                        fileSize: uploadResult.fileSize,
                        notes
                    }
                );

                patientDocument = updatedPatient?.documents?.[updatedPatient.documents.length - 1] || null;
            } catch (linkErr) {
                console.error("Failed to link document to patient:", linkErr);
                // Never report success when the patient link failed: remove the
                // just-uploaded object so no orphaned file remains.
                try {
                    await storage.deleteFile(uploadResult.key);
                } catch (deleteErr) {
                    console.error("Failed to remove the uploaded object after a failed link:", deleteErr);
                }
                return NextResponse.json(
                    {
                        success: false,
                        message: "Uploaded file was removed because linking the document to the patient failed"
                    },
                    { status: 500 }
                );
            }
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
    } catch (error: unknown) {
        console.error("Upload API Error:", error);
        if (error instanceof StorageUnconfiguredError) {
            return NextResponse.json(
                { success: false, message: "Document storage is not configured for this deployment" },
                { status: 503 }
            );
        }
        const message = error instanceof Error ? error.message : "Failed to upload file to storage";
        return NextResponse.json(
            {
                success: false,
                message
            },
            { status: 500 }
        );
    }
}
