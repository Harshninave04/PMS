export interface DischargeAdmissionState {
  status: string;
  dischargeRequested?: boolean;
  billingRequested?: boolean;
}

export interface FinalInvoiceState {
  status?: string;
  billingStatus?: string;
}

export function isReadyForDischarge(
  admission: DischargeAdmissionState,
  invoice?: FinalInvoiceState | null,
): boolean {
  return (
    (admission.status === "ADMITTED" || admission.status === "TRANSFERRED") &&
    Boolean(admission.dischargeRequested) &&
    Boolean(admission.billingRequested) &&
    isBillingCompleted(invoice)
  );
}

/**
 * Payment state does not determine whether billing has finalized the bill.
 * Legacy non-cancelled invoices predate billingStatus and remain completed.
 */
export function isBillingCompleted(invoice?: FinalInvoiceState | null): boolean {
  return Boolean(
    invoice &&
      invoice.status !== "CANCELLED" &&
      (!invoice.billingStatus || invoice.billingStatus === "BILLING_COMPLETED"),
  );
}

export function dischargeBlockReason(
  admission: DischargeAdmissionState,
  invoice?: FinalInvoiceState | null,
): string | null {
  if (admission.status === "DISCHARGED") return "Patient is already discharged";
  if (admission.status !== "ADMITTED" && admission.status !== "TRANSFERRED") {
    return `Cannot discharge a ${admission.status} admission`;
  }
  if (!admission.dischargeRequested || !admission.billingRequested) {
    return "Discharge is pending. The doctor request, nursing billing handoff, and final bill must be completed first.";
  }
  if (!isBillingCompleted(invoice)) {
    return "The accountant must complete the final bill before this patient can be discharged.";
  }
  return null;
}

export const CLOSED_ADMISSION_NURSING_MESSAGE =
  "Patient discharged. This admission is closed; new nursing entries are not allowed.";
