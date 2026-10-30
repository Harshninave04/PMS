export const DEFAULT_HOSPITAL_TIME_ZONE = "Asia/Kolkata";
export const HOSPITAL_PROFILE_UPDATED_EVENT = "hospital-profile:updated";

export interface HospitalProfile {
  organizationId?: string;
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  logo?: string;
  timeZone: string;
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text || undefined;
}

export function hospitalProfileFromRecords(
  organization?: Record<string, unknown> | null,
  settings?: Record<string, unknown> | null,
): HospitalProfile {
  const address = [organization?.address, organization?.city, organization?.state, organization?.pincode, organization?.country]
    .map(optionalText)
    .filter((value): value is string => Boolean(value))
    .join(", ");

  const configuredTimeZone = optionalText(settings?.timeZone);
  let timeZone = DEFAULT_HOSPITAL_TIME_ZONE;
  if (configuredTimeZone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: configuredTimeZone });
      timeZone = configuredTimeZone;
    } catch {
      timeZone = DEFAULT_HOSPITAL_TIME_ZONE;
    }
  }

  return {
    organizationId: organization?._id ? String(organization._id) : undefined,
    name: optionalText(organization?.organizationName),
    address: address || undefined,
    phone: optionalText(organization?.phone),
    email: optionalText(organization?.email),
    gstin: optionalText(settings?.gstin),
    logo: optionalText(organization?.logo),
    timeZone,
  };
}
