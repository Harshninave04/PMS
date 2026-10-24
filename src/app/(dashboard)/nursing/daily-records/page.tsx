import { redirect } from "next/navigation";

export default async function DailyRecordsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { admissionId, patientId } = await searchParams;
  const query = new URLSearchParams();

  if (typeof patientId === "string") query.set("patientId", patientId);
  if (typeof admissionId === "string") query.set("admissionId", admissionId);

  const suffix = query.size ? `?${query.toString()}` : "";
  redirect(`/nursing/notes${suffix}`);
}
