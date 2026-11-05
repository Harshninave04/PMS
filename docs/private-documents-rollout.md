# Making patient documents private

Patient documents used to live behind public object URLs. This rollout moves
read access behind signed, five-minute links without ever changing the live
bucket from application code.

## What the code does

- New buckets given to `src/lib/storage.ts` are created with `public: false`.
  The visibility of an existing bucket is never changed from code.
- Objects are uploaded without any `ACL` (no more `public-read`).
- Every uploaded document stores its object's `storageKey` next to `fileUrl`.
- `GET /api/patient/documents/<documentId>/url` checks the
  `patients.documents:view` permission plus the same branch scoping the other
  patient routes use, then returns a signed URL valid for 5 minutes
  (Supabase `createSignedUrl`, or the S3 gateway presigner). Records that only
  have a public URL get that URL unchanged until they are migrated.
- The documents vault page asks this endpoint on click instead of opening
  `fileUrl` directly.
- `scripts/migrate-documents-private.ts` backfills `storageKey` from the
  existing public URLs. Dry-run by default; writes only with `--apply`; it
  never deletes anything and is safe to repeat.

## Rollout order

1. **Deploy the code.** New uploads already record `storageKey`; reads fall
   back to the legacy public URL where there is no key yet, so nothing breaks.
2. **Run the dry run** and review every derived key:

   ```
   npx tsx scripts/migrate-documents-private.ts
   ```

   Records listed as "(no key derivable from that URL; left unchanged)" need a
   manual look — the script will not invent keys.
3. **Run the backfill** once the dry run looks sane:

   ```
   npx tsx scripts/migrate-documents-private.ts --apply
   ```

   Re-running is harmless; already-migrated records are skipped.
4. **Then make the bucket private** (dashboard/CLI, done by an operator — not
   from code) and **review the ACLs on old objects**; anything carrying an
   explicit `public-read` ACL needs to be cleared. Direct object URLs stop
   resolving publicly from here; the signed-URL endpoint keeps working.
5. Optionally repeat the dry run afterwards: it should report 0 unreviewed
   records.
