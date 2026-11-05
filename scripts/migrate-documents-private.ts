/**
 * Backfills `documents.storageKey` by deriving it from each legacy public URL.
 *
 * DRY-RUN BY DEFAULT: without flags it only reports how many document records
 * carry a public URL but no storage key, and the key derived from each URL.
 * Nothing is written unless `--apply` is passed.
 *
 * Idempotent: derived keys are only written where the field is still missing,
 * so the script can run repeatedly. It never deletes a document record or an
 * object, and it never touches a record whose key could not be derived (those
 * are reported for manual review instead).
 *
 * Bucket and object visibility are managed manually, out of code — see
 * docs/private-documents-rollout.md for the rollout order.
 *
 * Usage: npx tsx scripts/migrate-documents-private.ts [--apply]
 */
import "dotenv/config";
import dbConnect from "@/lib/dbConnect";
import Patient from "@/models/patient.model";
import { deriveStorageKeyFromUrl } from "@/lib/document-url";

interface Candidate {
    patientId: unknown;
    documentId: unknown;
    fileUrl: string;
    key: string | null;
}

async function main() {
    const apply = process.argv.includes("--apply");
    await dbConnect();

    const patients = await Patient.find({
        "documents.fileUrl": { $exists: true, $ne: null }
    })
        .select("documents")
        .lean();

    const candidates: Candidate[] = [];
    for (const patient of patients) {
        for (const document of patient.documents ?? []) {
            if (!document.fileUrl || document.storageKey) continue;
            candidates.push({
                patientId: patient._id,
                documentId: document._id,
                fileUrl: document.fileUrl,
                key: deriveStorageKeyFromUrl(document.fileUrl)
            });
        }
    }

    const resolvable = candidates.filter((candidate) => candidate.key);
    const unresolvable = candidates.filter((candidate) => !candidate.key);

    process.stdout.write(
        `${apply ? "APPLY run" : "DRY RUN (no data changed)"} — ` +
        `checked ${patients.length} patients, found ${candidates.length} document ` +
        `records with a public URL and no storageKey\n`
    );
    for (const candidate of candidates) {
        process.stdout.write(
            `  patient ${candidate.patientId} -> doc ${candidate.documentId} -> ` +
            (candidate.key ? `derived storage key: ${candidate.key}` : "(no key derivable from that URL; left unchanged)") +
            "\n"
        );
    }

    if (!apply) {
        process.stdout.write(
            `Resolvable for migration: ${resolvable.length}. ` +
            `Unresolvable, left for manual review: ${unresolvable.length}.\n` +
            "Review the keys above, then re-run with --apply to backfill them.\n"
        );
    } else {
        let migrated = 0;
        for (const candidate of resolvable) {
            // The record was selected because the key was missing; matching on
            // the missing field again makes the write idempotent.
            const update = await Patient.updateOne(
                {
                    _id: candidate.patientId,
                    "documents._id": candidate.documentId,
                    "documents.storageKey": { $in: [null, undefined] }
                },
                { $set: { "documents.$.storageKey": candidate.key } }
            );
            migrated += update.modifiedCount ?? 0;
        }
        process.stdout.write(
            `Backfilled ${migrated} document record(s) of ${resolvable.length} derivable ` +
            `(${unresolvable.length} untouched for manual review).\n`
        );
    }

    await Patient.db?.close();
}

main().catch(async (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Could not migrate patient documents"}\n`);
    await Patient.db?.close();
    process.exitCode = 1;
});
