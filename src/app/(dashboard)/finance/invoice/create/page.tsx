"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  FilePlus2,
  RefreshCw,
  Loader2,
  Search,
  BedDouble,
  Stethoscope,
  Pill,
  Wallet,
  CheckCircle2,
  AlarmClock,
  StickyNote,
  Plus,
  Trash2,
  Receipt,
  UserRound,
  Eye,
  Printer
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { num, round2, fmtMoney } from "@/lib/money";
import { formatDateIN } from "@/lib/date-format";
import { usePermissions } from "@/components/permissions/permission-context";

interface ItemRow {
  name: string;
  quantity: number;
  price: number;
  // "draft" rows were generated from the clinical records; deleting them from
  // the bill requires a typed reason (kept in the invoice notes).
  source?: "draft" | "manual";
}

const emptyRow: ItemRow = { name: "", quantity: 1, price: 0 };

interface ServiceOption {
  _id: string;
  name: string;
  category: string;
  defaultRate: number;
}

// A bill discount above this share of the gross needs the billing discount
// permission ("Discount above limit" on Create Bill). Configured here and in
// the invoice controller — one management decision, two simple constants.
const BILL_DISCOUNT_CAP = 0.1;

const PAYMENT_METHODS = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "INSURANCE_TPA"];

function lineMath(rows: ItemRow[]) {
  let gross = 0;
  const computed = rows.map((row) => {
    const lineTotal = round2(num(row.price) * num(row.quantity));
    gross = round2(gross + lineTotal);
    return { ...row, lineTotal };
  });
  return { computed, gross };
}

export default function CreateInvoicePage() {
  const { toast } = useToast();
  const { can: canPermission, isSuperAdmin } = usePermissions();
  // A management-level discount — e.g. charity cases — needs the clearance that
  // the admin grants on Create Bill ("Discount above limit").
  const canDiscountOverCap = isSuperAdmin || canPermission("billing.create:discount");
  // Charging free-text items outside the rate master ("Custom item") is also a
  // clearance so the billing team cannot invent prices by default.
  const canCustomItem = isSuperAdmin || canPermission("billing.create:custom");

  const [queue, setQueue] = useState<any[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [services, setServices] = useState<ServiceOption[]>([]);

  const [selectedAdmissionId, setSelectedAdmissionId] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [invoiceInfo, setInvoiceInfo] = useState<any>(null);

  const [manualMode, setManualMode] = useState(false);
  const [manualPatients, setManualPatients] = useState<any[]>([]);
  const [manualPatientId, setManualPatientId] = useState("");
  const [manualPatientName, setManualPatientName] = useState("");
  const [manualSearch, setManualSearch] = useState("");
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);

  const [items, setItems] = useState<ItemRow[]>([]);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [collectOpen, setCollectOpen] = useState(false);
  const [collectInvoiceId, setCollectInvoiceId] = useState("");
  const [collectPatientId, setCollectPatientId] = useState("");
  const [collectAmount, setCollectAmount] = useState("");
  const [collectBalance, setCollectBalance] = useState(0);
  const [collectMethod, setCollectMethod] = useState("CASH");
  const [collectNotes, setCollectNotes] = useState("");
  const [collecting, setCollecting] = useState(false);

  // Only the freshest draft response may fill the workspace — stale responses
  // from earlier clicks are dropped, so rapid case switching cannot garble the bill.
  const openCaseRequestId = useRef(0);
  // Signature of the last "clean" workspace; edits after it block switches.
  const cleanSignatureRef = useRef("");

  const loadQueue = async () => {
    setQueueLoading(true);
    try {
      const res = await fetch("/api/admission/billing-queue");
      const data = await res.json();
      if (data.success) {
        setQueue(data.data || []);
      } else {
        toast(data.message || "Failed to load the discharge billing queue", "error");
      }
    } catch {
      toast("Failed to load the discharge billing queue", "error");
    } finally {
      setQueueLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch("/api/service?active=true");
      const data = await res.json();
      if (data.success) {
        const rows = ((data.data || []) as Array<{ _id?: unknown; name?: unknown; category?: unknown; defaultRate?: unknown }>).map((service) => ({
          _id: String(service._id ?? ""),
          name: String(service.name ?? ""),
          category: String(service.category ?? "General"),
          defaultRate: num(service.defaultRate),
        }));
        setServices(rows);
      } else {
        toast(data.message || "Failed to load the service rate list", "error");
      }
    } catch {
      toast("Failed to load the service rate list", "error");
    }
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load is async; every setState happens after the fetch awaits
    fetchServices();
  }, [fetchServices]);

  const openCase = async (row: any) => {
    if (hasUnsavedEdits() && !window.confirm("This bill has unsaved edits. Switch cases and discard them?")) {
      return;
    }
    const requestId = ++openCaseRequestId.current;
    setManualMode(false);
    setManualPatientId("");
    setManualPatientName("");
    setManualPatients([]);
    setSelectedAdmissionId(String(row.admissionId));
    setSelectedCase(row);
    setItems([]);
    setGlobalDiscount(0);
    setDiscountReason("");
    setNotes("");
    setInvoiceInfo(row.invoice ?? null);
    if (row.invoice) {
      markClean({ mode: String(row.admissionId), patient: "", items: [], discount: 0, discountReason: "", notes: "" });
      return;
    }
    setDraftLoading(true);
    try {
      const res = await fetch(`/api/invoice/draft?admissionId=${row.admissionId}`);
      const data = await res.json();
      if (openCaseRequestId.current !== requestId) return; // a newer openCase superseded this fetch
      const draftRows: ItemRow[] =
        res.ok && data.success
          ? (data.data.items as any[]).map((it) => ({
              name: it.name,
              quantity: num(it.quantity),
              price: num(it.price),
              source: "draft",
            }))
          : [{ ...emptyRow }];
      const noteText =
        res.ok && data.success
          ? `IPD bill for ${data.data.context.patient.name} (stay #${String(row.admissionId).slice(-6).toUpperCase()})`
          : "";
      if (!res.ok || !data.success) {
        toast(data.message || "Failed to load the charge draft", "error");
      }
      setItems(draftRows);
      setNotes(noteText);
      markClean({ mode: String(row.admissionId), patient: "", items: draftRows, discount: 0, discountReason: "", notes: noteText });
    } catch {
      if (openCaseRequestId.current !== requestId) return;
      toast("Failed to load the charge draft", "error");
      setItems([{ ...emptyRow }]);
      setNotes("");
      markClean({ mode: String(row.admissionId), patient: "", items: [{ ...emptyRow }], discount: 0, discountReason: "", notes: "" });
    } finally {
      if (openCaseRequestId.current === requestId) setDraftLoading(false);
    }
  };

  const enterManualMode = () => {
    if (hasUnsavedEdits() && !window.confirm("Discard the unsaved edits on this bill and start a manual invoice?")) {
      return;
    }
    openCaseRequestId.current += 1; // an in-flight draft fetch must not land after the switch
    setSelectedAdmissionId(null);
    setSelectedCase(null);
    setInvoiceInfo(null);
    setItems([{ ...emptyRow }]);
    setGlobalDiscount(0);
    setDiscountReason("");
    setNotes("");
    setManualMode(true);
    markClean({ mode: "manual", patient: "", items: [{ ...emptyRow }], discount: 0, discountReason: "", notes: "" });
  };

  const searchPatients = async () => {
    const q = manualSearch.trim();
    if (!q) {
      toast("Type a patient name or UHID to search", "error");
      return;
    }
    setPatientSearchLoading(true);
    try {
      const res = await fetch(`/api/patient?query=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success) {
        setManualPatients(data.data || []);
        if ((data.data || []).length === 0) toast("No matching patients found", "error");
      } else {
        toast(data.message || "Patient search failed", "error");
      }
    } catch {
      toast("Patient search failed", "error");
    } finally {
      setPatientSearchLoading(false);
    }
  };

  const { computed, gross } = useMemo(() => lineMath(items), [items]);
  const billDiscount = num(globalDiscount);
  const reasonValue = discountReason.trim();
  const discountCap = round2(gross * BILL_DISCOUNT_CAP);
  const finalAmount = round2(Math.max(0, gross - billDiscount));
  const unbilled = queue.filter((row) => !row.invoice);
  const billed = queue.filter((row) => row.invoice);
  const selectedQueueRow = queue.find((row) => String(row.admissionId) === selectedAdmissionId) ?? selectedCase;

  // Unsaved-edit detection: every load/reset computes its clean signature from
  // local values (never from lagging state), so a just-loaded draft is clean
  // and any typed edit after that is dirty. Empty baseline = nothing loaded yet.
  type Signature = { mode: string; patient: string; items: ItemRow[]; discount: number; discountReason: string; notes: string };
  const signatureOf = (parts: Signature) => JSON.stringify(parts);
  const currentSignature = () =>
    signatureOf({
      mode: manualMode ? "manual" : selectedAdmissionId ?? "none",
      patient: manualPatientId,
      items,
      discount: num(globalDiscount),
      discountReason: reasonValue,
      notes,
    });
  const markClean = (parts: Signature) => {
    cleanSignatureRef.current = signatureOf(parts);
  };
  const hasUnsavedEdits = () => cleanSignatureRef.current !== "" && currentSignature() !== cleanSignatureRef.current;

  const updateRow = (index: number, patch: Partial<ItemRow>) =>
    setItems((rows: ItemRow[]) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  // Picking a service pre-fills the description and rate from the master; the
  // bill still snapshots whatever is in the row at save time.
  const pickService = (index: number, service: ServiceOption) =>
    setItems((rows: ItemRow[]) =>
      rows.map((row, i) =>
        i === index
          ? { ...row, name: service.name, price: service.defaultRate, quantity: num(row.quantity) || 1 }
          : row
      )
    );

  // Draft rows carry clinical charges, so removing one is an accounting event:
  // it needs a typed reason (appended to the invoice notes). Manual rows go free.
  const removeRow = (index: number, row: ItemRow) => {
    if (row.source === "draft") {
      const reason = window.prompt(`Deleting the auto-generated line "${row.name}" requires a reason (e.g. "patient did not use the service")`, "");
      const trimmed = reason?.trim() ?? "";
      if (!trimmed) {
        toast("A typed reason is required to delete a line that comes from the charge draft", "error");
        return;
      }
      setNotes((prev) => (prev ? `${prev}\nRemoved line (${row.name}): ${trimmed}` : `Removed line (${row.name}): ${trimmed}`));
    }
    setItems((rows: ItemRow[]) =>
      row.source === "draft"
        ? rows.filter((_, i) => i !== index)
        : rows.length === 1
          ? [{ ...emptyRow }]
          : rows.filter((_, i) => i !== index)
    );
  };

  const buildPayload = () => ({
    items: computed.map((row) => ({
      name: row.name?.trim(),
      price: num(row.price),
      quantity: num(row.quantity),
      discount: 0,
      tax: 0,
      total: row.lineTotal,
    })),
    totalAmount: gross,
    discount: billDiscount,
    taxAmount: 0,
    finalAmount,
    notes,
    ...(billDiscount > 0 ? { discountReason: reasonValue } : {}),
    status: "UNPAID",
  });

  const saveInvoice = async () => {
    const validRows = items.filter((row) => row.name?.trim());
    if (manualMode && !manualPatientId) {
      toast("Choose the patient for the manual invoice", "error");
      return;
    }
    if (!manualMode && !selectedAdmissionId) {
      toast("Select a discharge case from the queue", "error");
      return;
    }
    if (validRows.length === 0) {
      toast("Add at least one charge row with a description", "error");
      return;
    }
    const zeroRate = validRows.find((row) => num(row.price) <= 0);
    if (zeroRate) {
      toast(`"${zeroRate.name}" has a rate of ₹0 — enter the rate or delete the line before billing`, "error");
      return;
    }
    const badRow = validRows.find((row) => num(row.quantity) <= 0);
    if (badRow) {
      toast("Quantity must be greater than zero on every row", "error");
      return;
    }
    if (!canCustomItem) {
      const serviceNameSet = new Set(services.map((service) => service.name.trim().toLowerCase()));
      const customRow = validRows.find(
        (row) =>
          row.source !== "draft" &&
          row.name.trim() !== "" &&
          !serviceNameSet.has(row.name.trim().toLowerCase())
      );
      if (customRow) {
        toast(`"${customRow.name}" is not in the rate list — pick a listed service or ask an admin to grant "Custom item"`, "error");
        return;
      }
    }
    if (billDiscount > 0 && !reasonValue) {
      toast("A reason is required when a discount is applied", "error");
      return;
    }
    if (billDiscount > discountCap && !canDiscountOverCap) {
      toast(`Discounts above 10% of the gross (${fmtMoney(discountCap)}) need the billing discount permission — ask an admin to grant "Discount above limit"`, "error");
      return;
    }
    if (finalAmount <= 0) {
      toast("The bill total must be above zero before saving", "error");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = buildPayload();
      if (manualMode) {
        payload.patientId = manualPatientId;
      } else {
        payload.patientId = selectedQueueRow?.patientId;
        payload.admissionId = selectedAdmissionId;
      }

      const res = await fetch("/api/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || "Failed to save the invoice");
      }
      const invoice = result.data;
      toast(`Invoice ${invoice.invoiceNumber ?? ""} saved as UNPAID — collect the payment to close it`.trim(), "success");

      // The right pane switches to "bill already raised" so the saved bill can
      // never be submitted twice by accident; the editor is gone from this point.
      setInvoiceInfo(invoice);
      cleanSignatureRef.current = currentSignature();

      const balance = round2(num(invoice.balanceAmount ?? invoice.finalAmount));
      if (balance > 0) {
        setCollectInvoiceId(invoice._id);
        setCollectPatientId(typeof invoice.patientId === "object" ? invoice.patientId._id : invoice.patientId);
        setCollectAmount(String(balance));
        setCollectBalance(balance);
        setCollectMethod("CASH");
        setCollectNotes("");
        setCollectOpen(true);
      } else {
        await closeCollectAndFinish();
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to save the invoice", "error");
    } finally {
      setSaving(false);
    }
  };

  const resetWorkspace = () => {
    setManualMode(false);
    setManualPatientId("");
    setManualPatientName("");
    setManualPatients([]);
    setManualSearch("");
    setSelectedAdmissionId(null);
    setSelectedCase(null);
    setInvoiceInfo(null);
    setItems([]);
    setGlobalDiscount(0);
    setDiscountReason("");
    setNotes("");
  };

  // Closing the collect dialog — "Collect later" (no payment) or "Record
  // payment" (balance cleared) — must behave the same: reload the queue (the
  // case flips to Billed) and clear the workspace so the invoice cannot be
  // saved again from the stale editor.
  const closeCollectAndFinish = async () => {
    setCollectOpen(false);
    await loadQueue();
    resetWorkspace();
    cleanSignatureRef.current = signatureOf({ mode: "none", patient: "", items: [], discount: 0, discountReason: "", notes: "" });
  };

  const submitCollection = async () => {
    const amount = round2(num(collectAmount));
    if (!collectAmount || amount <= 0) {
      toast("Enter the collected amount", "error");
      return;
    }
    if (amount > collectBalance) {
      toast(`Payment cannot exceed the pending balance of ${fmtMoney(collectBalance)}`, "error");
      return;
    }
    setCollecting(true);
    try {
      const res = await fetch("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: collectInvoiceId,
          patientId: collectPatientId,
          amount,
          method: collectMethod,
          notes: collectNotes.trim() || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || "Failed to record the payment");
      }
      toast(`Payment recorded — receipt ${result.data?.receiptNumber ?? ""}`.trim(), "success");
      await closeCollectAndFinish();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to record the payment", "error");
    } finally {
      setCollecting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FilePlus2 className="h-6 w-6 text-emerald-600" />
            Create bill
          </h1>
          <p className="text-sm text-muted-foreground">
            Discharge cases handed over by nursing pre-compute here. Manual invoices stay available below the queue.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { loadQueue(); }} disabled={queueLoading} className="gap-1.5">
            <RefreshCw className={`h-4 w-4 ${queueLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Link href="/finance/invoices">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Receipt className="h-4 w-4" />
              Bills
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(300px,380px)_1fr] gap-5 items-start">
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlarmClock className="h-4 w-4 text-amber-600" />
              Sent to billing ({unbilled.length})
            </CardTitle>
            <CardDescription>
              Cases prepared by nursing. Oldest handoff first. Billed cases stay listed below with their invoice.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {queueLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-6">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading discharge cases…
              </div>
            ) : queue.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                No discharge cases waiting. Cases appear here as soon as a nurse finishes the discharge process.
              </p>
            ) : (
              <div className="space-y-2">
                {[...unbilled, ...billed].map((row) => (
                  <div
                    key={String(row.admissionId)}
                    className={`rounded-lg border p-3 text-xs ${
                      row.invoice
                        ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/10"
                        : selectedAdmissionId === String(row.admissionId)
                          ? "border-sky-400 bg-sky-50/70 dark:bg-sky-950/20"
                          : "hover:border-sky-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">
                          {row.patientName} <span className="text-slate-400">({row.uhid})</span>
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          Bed {row.bedNumber} · {row.wardName} · {row.doctorName}
                        </p>
                      </div>
                      {row.invoice ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 shrink-0">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Billed
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          className="h-7 px-2 shrink-0 bg-sky-700 hover:bg-sky-800 text-white"
                          onClick={() => openCase(row)}
                        >
                          Prepare bill
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Admitted {row.admissionDate ? formatDateIN(row.admissionDate) : "—"}
                      {row.expectedDischargeAt ? ` · expected out ${formatDateIN(row.expectedDischargeAt)}` : ""}
                      {row.sentByName ? ` · sent by ${row.sentByName}` : ""}
                    </p>
                    {row.invoice && (
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        {row.invoice.invoiceNumber} · {fmtMoney(row.invoice.finalAmount)} · {row.invoice.status}
                      </p>
                    )}
                    {row.invoice && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <Link href={`/finance/invoices?open=${row.invoice.invoiceId}`}>
                          <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1 text-sky-700 border-sky-300">
                            <Eye className="h-3 w-3" />
                            View invoice
                          </Button>
                        </Link>
                        <Link href={`/finance/invoices?print=${row.invoice.invoiceId}`}>
                          <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1 text-slate-600">
                            <Printer className="h-3 w-3" />
                            Print
                          </Button>
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t mt-3">
              <Button
                variant={manualMode ? "default" : "outline"}
                size="sm"
                className={`w-full gap-1.5 ${manualMode ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
                onClick={enterManualMode}
              >
                <FilePlus2 className="h-4 w-4" />
                New manual invoice (outside the pipeline)
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              {manualMode
                ? "Manual invoice"
                : selectedAdmissionId
                  ? `Bill — ${selectedQueueRow?.patientName ?? ""} (${selectedQueueRow?.uhid ?? ""})`
                  : "Charge workspace"}
            </CardTitle>
            <CardDescription>
              {manualMode
                ? "Free-form billing for OPD or services without a stay."
                 : selectedAdmissionId
                   ? "Every row is editable — adjust rates and quantities; the discount is applied once on the bill."
                   : "Pick a case from the billing queue to prepare its bill."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {draftLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-10">
                <Loader2 className="h-4 w-4 animate-spin" /> Compiling charges…
              </div>
            ) : manualMode ? (
              <div className="space-y-4">
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-semibold">Patient</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      placeholder="Search name or UHID"
                      value={manualSearch}
                      onChange={(e) => setManualSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void searchPatients();
                        }
                      }}
                      className="h-9 text-xs"
                    />
                    <Button variant="outline" size="sm" onClick={searchPatients} disabled={patientSearchLoading} className="h-9 gap-1.5">
                      {patientSearchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      Search
                    </Button>
                  </div>
                  {manualPatients.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {manualPatients.map((patient) => (
                        <button
                          key={patient._id}
                          type="button"
                          className={`w-full text-left text-xs rounded-md border px-2.5 py-2 ${
                            manualPatientId === patient._id
                              ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                              : "hover:border-slate-300"
                          }`}
                          onClick={() => {
                            setManualPatientId(patient._id);
                            setManualPatientName(patient.name);
                          }}
                        >
                          {patient.name} · {patient.uhid} · {patient.gender}, {patient.age}y
                        </button>
                      ))}
                    </div>
                  )}
                  {manualPatientId && (
                    <p className="text-[11px] text-emerald-700">
                      Billing {manualPatientName}
                    </p>
                  )}
                </div>
                <ItemsEditor
                  items={items}
                  updateRow={updateRow}
                  pickService={pickService}
                  services={services}
                  addRow={() => setItems((rows) => [...rows, { ...emptyRow }])}
                  removeRow={removeRow}
                  computed={computed}
                  gross={gross}
                  billDiscount={billDiscount}
                  discountCap={discountCap}
                  canDiscountOverCap={canDiscountOverCap}
                  discountReason={discountReason}
                  setDiscountReason={setDiscountReason}
                  setGlobalDiscount={setGlobalDiscount}
                  notes={notes}
                  setNotes={setNotes}
                  saving={saving}
                  saveLabel="Save manual invoice"
                  saveInvoice={saveInvoice}
                />
              </div>
            ) : !selectedAdmissionId ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Select a discharge case from the billing queue, or start a manual invoice.
              </div>
            ) : invoiceInfo ? (
              <div className="py-6 space-y-3">
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Bill already raised for this stay</span>
                </div>
                <p className="text-xs text-slate-500">
                  Invoice {invoiceInfo.invoiceNumber} · {fmtMoney(invoiceInfo.finalAmount)} ({invoiceInfo.status}). Manage payments from the{" "}
                  <Link href="/finance/invoices" className="underline text-sky-700">Bills</Link> list; nursing can no longer recall the case.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedQueueRow && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Ward & Bed</span>
                      <div className="font-bold text-slate-900 dark:text-white mt-0.5">{selectedQueueRow.wardName}</div>
                      <div className="text-slate-500 text-[11px]">
                        Room {selectedQueueRow.roomNumber} · Bed {selectedQueueRow.bedNumber} ({selectedQueueRow.wardType})
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Stay</span>
                      <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                        {selectedQueueRow.admissionDate ? formatDateIN(selectedQueueRow.admissionDate) : "—"}
                      </div>
                      <div className="text-slate-500 text-[11px]">
                        {selectedQueueRow.expectedDischargeAt
                          ? `Cut-off ${formatDateIN(selectedQueueRow.expectedDischargeAt)}`
                          : "Open stay (cut-off = today)"}
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Attending</span>
                      <div className="font-bold text-slate-900 dark:text-white mt-0.5">{selectedQueueRow.doctorName}</div>
                      <div className="text-slate-500 text-[11px]">{selectedQueueRow.insurance}</div>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Flagged by</span>
                      <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                        {selectedQueueRow.flaggedByName ? `Dr. ${selectedQueueRow.flaggedByName}` : "Doctor"}
                      </div>
                      <div className="text-slate-500 text-[11px]">
                        {selectedQueueRow.dischargeRequestNotes || "No doctor note"}
                      </div>
                    </div>
                  </div>
                )}

                {selectedQueueRow?.allergies?.length > 0 && (
                  <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-2">
                    Allergies on file: {selectedQueueRow.allergies.join(", ")}
                  </p>
                )}

                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 flex items-start gap-2 text-[11px] text-amber-800 dark:bg-amber-950/20">
                  <StickyNote className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Nurse notes ({selectedQueueRow?.nurseNoteCount ?? 0})</span>
                    <span className="whitespace-pre-wrap">
                      {selectedQueueRow?.latestNurseNote || "None recorded"}
                    </span>
                  </div>
                </div>

                <ItemsEditor
                  items={items}
                  updateRow={updateRow}
                  pickService={pickService}
                  services={services}
                  addRow={() => setItems((rows) => [...rows, { ...emptyRow }])}
                  removeRow={removeRow}
                  computed={computed}
                  gross={gross}
                  billDiscount={billDiscount}
                  discountCap={discountCap}
                  canDiscountOverCap={canDiscountOverCap}
                  discountReason={discountReason}
                  setDiscountReason={setDiscountReason}
                  setGlobalDiscount={setGlobalDiscount}
                  notes={notes}
                  setNotes={setNotes}
                  saving={saving}
                  saveLabel="Save bill (UNPAID)"
                  saveInvoice={saveInvoice}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={collectOpen}
        onOpenChange={(open) => {
          if (open || collecting) return;
          void closeCollectAndFinish();
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-teal-600" />
              Collect payment
            </DialogTitle>
            <DialogDescription>
              The bill is saved UNPAID. Record the received amount to close the balance (invoice-first, so the ledger counts once).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-[11px] text-slate-500">
              Pending balance: <span className="font-semibold text-amber-600">{fmtMoney(collectBalance)}</span>
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Amount ₹ *</label>
              <Input
                type="number"
                min={1}
                max={collectBalance}
                value={collectAmount}
                onChange={(e) => setCollectAmount(e.target.value)}
                disabled={collecting}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Method *</label>
              <Select value={collectMethod} onChange={(e) => setCollectMethod(e.target.value)} disabled={collecting}>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Receipt notes</label>
              <Textarea
                rows={2}
                value={collectNotes}
                onChange={(e) => setCollectNotes(e.target.value)}
                placeholder="Optional — printed on the payment receipt"
                disabled={collecting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => closeCollectAndFinish()} disabled={collecting}>
              Collect later
            </Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={submitCollection} disabled={collecting}>
              {collecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ItemsEditorProps {
  items: ItemRow[];
  updateRow: (index: number, patch: Partial<ItemRow>) => void;
  addRow: () => void;
  removeRow: (index: number, row: ItemRow) => void;
  computed: any[];
  gross: number;
  billDiscount: number;
  discountCap: number;
  canDiscountOverCap: boolean;
  discountReason: string;
  setDiscountReason: (value: string) => void;
  setGlobalDiscount: (value: number) => void;
  notes: string;
  setNotes: (value: string) => void;
  saving: boolean;
  saveLabel: string;
  saveInvoice: () => void;
  services: ServiceOption[];
  pickService: (index: number, service: ServiceOption) => void;
}

function ItemsEditor(props: ItemsEditorProps) {
  const {
    items,
    updateRow,
    pickService,
    services,
    addRow,
    removeRow,
    computed,
    gross,
    billDiscount,
    discountCap,
    canDiscountOverCap,
    discountReason,
    setDiscountReason,
    setGlobalDiscount,
    notes,
    setNotes,
    saving,
    saveLabel,
    saveInvoice,
  } = props;
  const [suggestOpen, setSuggestOpen] = useState<number | null>(null);
  const overCap = billDiscount > discountCap;
  const reasonMissing = billDiscount > 0 && !discountReason.trim();
  const needsClearance = overCap && !canDiscountOverCap;
  const suggestionsFor = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return services.filter((service) => service.name.toLowerCase().includes(q)).slice(0, 6);
  };
  return (
    <>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="text-left p-2 font-semibold min-w-[240px]">Description</th>
              <th className="text-left p-2 font-semibold w-20">Qty</th>
              <th className="text-left p-2 font-semibold w-24">Rate ₹</th>
              <th className="text-right p-2 font-semibold w-24">Amount</th>
              <th className="p-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {items.map((row, index) => (
              <tr key={index} className="border-t">
                <td className="p-2 relative">
                  <Input
                    value={row.name}
                    onChange={(e) => updateRow(index, { name: e.target.value })}
                    onFocus={() => setSuggestOpen(index)}
                    onBlur={() => setSuggestOpen(null)}
                    className="h-8 text-xs"
                    placeholder={row.source === "draft" ? "Auto-generated from the charge draft" : "Type to search services, e.g. nursing"}
                  />
                  {row.source !== "draft" && suggestOpen === index && suggestionsFor(row.name).length > 0 && (
                    <ul
                      className="absolute z-20 mt-1 w-[min(24rem,90vw)] max-h-44 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800 text-xs"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      {suggestionsFor(row.name).map((service) => (
                        <li key={service._id}>
                          <button
                            type="button"
                            onClick={() => { pickService(index, service); setSuggestOpen(null); }}
                            className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
                          >
                            <span className="truncate">{service.name}</span>
                            <span className="text-slate-400 truncate">{service.category}</span>
                            <span className="font-mono shrink-0">{fmtMoney(service.defaultRate)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="p-2">
                  <Input
                    type="number"
                    min={1}
                    value={row.quantity}
                    onChange={(e) => updateRow(index, { quantity: Number(e.target.value) })}
                    className="h-8 text-xs"
                  />
                </td>
                <td className="p-2">
                  <Input
                    type="number"
                    min={0}
                    value={row.price}
                    onChange={(e) => updateRow(index, { price: Number(e.target.value) })}
                    className={`h-8 text-xs ${num(row.price) <= 0 ? "border-rose-300 bg-rose-50 text-rose-700 font-semibold" : ""}`}
                    title={num(row.price) <= 0 ? "A ₹0 rate cannot be billed — set a rate or delete this line" : undefined}
                  />
                </td>
                <td className="p-2 text-right font-mono font-semibold">
                  {fmtMoney(computed[index]?.lineTotal ?? 0)}
                </td>
                <td className="p-2">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400" onClick={() => removeRow(index, row)} title={row.source === "draft" ? "Remove auto-generated row (reason required)" : "Remove row"}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={addRow}>
        <Plus className="h-3.5 w-3.5" />
        Add row
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Invoice notes</label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="text-xs" />
          </div>
        </div>
        <div className="rounded-lg border p-3 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Gross total</span>
            <span className="font-mono">{fmtMoney(gross)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Discount ₹</span>
            <Input
              type="number"
              min={0}
              max={gross}
              value={billDiscount}
              onChange={(e) => setGlobalDiscount(Math.min(Number(e.target.value) || 0, gross))}
              className={`h-8 w-24 text-xs ${reasonMissing ? "border-rose-300" : overCap ? "border-amber-300" : ""}`}
            />
          </div>
          {billDiscount > 0 && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Discount reason *</label>
              <Input
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                maxLength={300}
                placeholder="Mandatory — e.g. loyalty discount / charity case"
                className={`h-8 text-xs ${reasonMissing ? "border-rose-300" : ""}`}
              />
            </div>
          )}
          {overCap && (
            <p className={`text-[11px] ${needsClearance ? "text-rose-600" : "text-amber-600"}`}>
              {needsClearance
                ? `Above the 10% cap (${fmtMoney(discountCap)}) — billing discount permission required.`
                : `Above the 10% cap (${fmtMoney(discountCap)}) — granted by your billing discount clearance.`}
            </p>
          )}
          <div className="flex justify-between border-t pt-2">
            <span className="font-semibold">Final amount</span>
            <span className="font-mono font-bold text-emerald-700">{fmtMoney(Math.max(0, gross - billDiscount))}</span>
          </div>
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white mt-1"
            onClick={saveInvoice}
            disabled={saving}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? "Saving…" : saveLabel}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-500">
        <span className="flex items-center gap-1"><BedDouble className="h-3 w-3" /> Bed & nursing rates come from Wards & Beds — unset rates show red</span>
        <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" /> Doctor rows bill each doctor&apos;s consultation fee per in-ward round</span>
        <span className="flex items-center gap-1"><Pill className="h-3 w-3" /> Medication rows list every dose recorded as GIVEN — set each rate</span>
        <span className="flex items-center gap-1"><StickyNote className="h-3 w-3" /> Type a name to search the Services rate list (Billing &gt; Rates); custom rows need &quot;Custom item&quot;</span>
      </div>
    </>
  );
}
