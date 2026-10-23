import "dotenv/config";
import dbConnect from "@/lib/dbConnect";
import Patient from "@/models/patient.model";

async function main() {
  await dbConnect();

  const duplicatePairs = await Patient.aggregate([
    { $match: { normalizedName: { $type: "string" }, normalizedContact: { $type: "string" } } },
    { $group: { _id: { name: "$normalizedName", phone: "$normalizedContact" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 10 },
  ]);
  if (duplicatePairs.length) {
    throw new Error("Cannot create the name and phone unique index: duplicate normalized name and phone pairs exist. Review scripts/report-patient-duplicates.ts first.");
  }

  const indexes = await Patient.collection.indexes();
  for (const index of indexes) {
    const keys = index.key as Record<string, number>;
    const isNormalizedNameOnly = Object.keys(keys).length === 1 && keys.normalizedName === 1;
    const isNormalizedPhoneOnly = Object.keys(keys).length === 1 && keys.normalizedContact === 1;
    if (index.unique && (isNormalizedNameOnly || isNormalizedPhoneOnly) && index.name) {
      await Patient.collection.dropIndex(index.name);
      process.stdout.write(`Dropped unique index ${index.name}\n`);
    }
  }

  await Patient.collection.createIndex(
    { normalizedName: 1, normalizedContact: 1 },
    {
      name: "normalizedName_1_normalizedContact_1",
      unique: true,
      partialFilterExpression: { normalizedName: { $type: "string" }, normalizedContact: { $type: "string" } },
    },
  );
  process.stdout.write("Created unique normalized name and phone index.\n");
  await Patient.db?.close();
}

main().catch(async (error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Could not migrate patient indexes"}\n`);
  await Patient.db?.close();
  process.exitCode = 1;
});
