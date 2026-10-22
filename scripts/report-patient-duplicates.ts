import "dotenv/config";
import dbConnect from "@/lib/dbConnect";
import Patient from "@/models/patient.model";
import { isPlaceholderPatientName, normalizePatientName, normalizePatientPhone } from "@/lib/patient-identity";

async function main() {
  await dbConnect();
  const patients = await Patient.find().select("name uhid age gender contact").lean();
  const byName = new Map<string, typeof patients>();
  const byPhone = new Map<string, typeof patients>();
  for (const patient of patients) {
    const name = normalizePatientName(patient.name);
    const phone = normalizePatientPhone(patient.contact);
    if (!isPlaceholderPatientName(patient.name) && name) byName.set(name, [...(byName.get(name) ?? []), patient]);
    if (phone) byPhone.set(phone, [...(byPhone.get(phone) ?? []), patient]);
  }

  const duplicateGroups = new Map<string, { matchedBy: Set<string>; patients: typeof patients }>();
  const addGroups = (lookup: Map<string, typeof patients>, matchedBy: string) => {
    for (const [key, matches] of lookup) {
      if (matches.length < 2) continue;
      const groupKey = matches.map((patient) => String(patient._id)).sort().join(":");
      const existing = duplicateGroups.get(groupKey) ?? { matchedBy: new Set<string>(), patients: matches };
      existing.matchedBy.add(matchedBy);
      duplicateGroups.set(groupKey, existing);
      void key;
    }
  };
  addGroups(byName, "name");
  addGroups(byPhone, "phone");

  const report = [...duplicateGroups.values()].map((group) => ({
    matchedBy: [...group.matchedBy],
    patients: group.patients.map(({ _id, name, uhid, age, gender, contact }) => ({ id: String(_id), name, uhid, age, gender, phone: contact })),
  }));
  process.stdout.write(`${JSON.stringify({ duplicateGroups: report.length, groups: report }, null, 2)}\n`);
  await Patient.db?.close();
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Could not report patient duplicates"}\n`);
  process.exitCode = 1;
});
