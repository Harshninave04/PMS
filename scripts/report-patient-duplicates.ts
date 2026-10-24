import "dotenv/config";
import dbConnect from "@/lib/dbConnect";
import Patient from "@/models/patient.model";
import { isPlaceholderPatientName, normalizePatientName, normalizePatientPhone } from "@/lib/patient-identity";

async function main() {
  await dbConnect();
  const patients = await Patient.find().select("name uhid age gender contact").lean();
  const duplicates = new Map<string, typeof patients>();
  const byPhone = new Map<string, typeof patients>();

  for (const patient of patients) {
    const name = normalizePatientName(patient.name);
    const phone = normalizePatientPhone(patient.contact);
    if (!isPlaceholderPatientName(patient.name) && name && phone) {
      const key = `${name}\u0000${phone}`;
      duplicates.set(key, [...(duplicates.get(key) ?? []), patient]);
    }
    if (phone) byPhone.set(phone, [...(byPhone.get(phone) ?? []), patient]);
  }

  const formatGroup = (group: typeof patients) => group.map(({ _id, name, uhid, age, gender, contact }) => ({
    id: String(_id), name, uhid, age, gender, phone: contact,
  }));
  const duplicateGroups = [...duplicates.values()].filter((group) => group.length > 1).map(formatGroup);
  const sharedPhoneGroups = [...byPhone.values()].filter((group) => {
    const names = new Set(group.filter((patient) => !isPlaceholderPatientName(patient.name)).map((patient) => normalizePatientName(patient.name)));
    return group.length > 1 && names.size > 1;
  }).map(formatGroup);

  process.stdout.write(`${JSON.stringify({
    duplicateGroups: duplicateGroups.length,
    groups: duplicateGroups,
    sharedPhoneGroups: sharedPhoneGroups.length,
    sharedPhones: sharedPhoneGroups,
  }, null, 2)}\n`);
  await Patient.db?.close();
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Could not report patient duplicates"}\n`);
  process.exitCode = 1;
});
