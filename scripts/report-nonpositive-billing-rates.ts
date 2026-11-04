import "dotenv/config";
import dbConnect from "@/lib/dbConnect";
import Service from "@/models/service.model";
import Ward from "@/models/ward.model";
import Bed from "@/models/bed.model";
import Doctor from "@/models/doctor.model";
import Medicine from "@/models/medicine.model";

async function main() {
  await dbConnect();
  const invalid = { $type: "number", $lte: 0 };
  const reports = await Promise.all([
    Service.find({ defaultRate: invalid }).select("name defaultRate").lean().then((rows) => ["Service.defaultRate", rows]),
    Ward.find({ $or: [{ bedRatePerDay: invalid }, { nursingRatePerDay: invalid }] }).select("wardName wardCode bedRatePerDay nursingRatePerDay").lean().then((rows) => ["Ward bed/nursing rates", rows]),
    Bed.find({ $or: [{ bedRatePerDay: invalid }, { nursingRatePerDay: invalid }] }).select("bedNumber bedRatePerDay nursingRatePerDay").lean().then((rows) => ["Bed override rates", rows]),
    Doctor.find({ consultationFee: invalid }).select("userId consultationFee").populate("userId", "name").lean().then((rows) => ["Doctor.consultationFee", rows]),
    Medicine.find({ unitPrice: invalid }).select("name unitPrice").lean().then((rows) => ["Medicine.unitPrice", rows]),
  ] as const);

  for (const [label, rows] of reports) {
    process.stdout.write(`${label}: ${rows.length}\n`);
    for (const row of rows) process.stdout.write(`  ${JSON.stringify(row)}\n`);
  }
  await Service.db?.close();
}

main().catch(async (error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Could not report non-positive billing rates"}\n`);
  await Service.db?.close();
  process.exitCode = 1;
});
