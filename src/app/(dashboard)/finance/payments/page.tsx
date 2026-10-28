"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CreditCard,
  RefreshCw,
  Loader2,
  Search,
  Printer,
  Receipt,
  PlusCircle,
  RotateCcw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { usePermissions } from "@/components/permissions/permission-context";

const fmtMoney = (value: number) => `₹${(Number(value) || 0).toLocaleString("en-IN")}`;

const METHODS = ["ALL", "CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "INSURANCE_TPA"];

export default function PaymentsLedgerPage() {
  const { toast } = useToast();
  const { can } = usePermissions();
  const canRecordPayments = can("billing.payments:create");
  const canRefund = can("billing.payments:refund");
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [receipt, setReceipt] = useState<any>(null);
  const [refundLoading, setRefundLoading] = useState(false);

  // Advance (deposit) intake — a receipt for a stay before any bill exists.
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceSearch, setAdvanceSearch] = useState("");
  const [advanceSearching, setAdvanceSearching] = useState(false);
  const [advancePatients, setAdvancePatients] = useState<Array<{ _id: string; name: string; uhid?: string }>>([]);
  const [advancePatientId, setAdvancePatientId] = useState("");
  const [advancePatientName, setAdvancePatientName] = useState("");
  const [advanceAdmissions, setAdvanceAdmissions] = useState<Array<{ _id: string; status: string; admissionDate?: string }>>([]);
  const [advanceAdmissionId, setAdvanceAdmissionId] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState("CASH");
  const [advanceNotes, setAdvanceNotes] = useState("");
  const [advanceSaving, setAdvanceSaving] = useState(false);

  const loadPayments = async () => {
    try {
      const res = await fetch("/api/payment");
      const data = await res.json();
      if (data.success) {
        setPayments(data.data || []);
      } else {
        toast(data.message || "Failed to load payments", "error");
      }
    } catch {
      toast("Failed to load payments", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setLoading(true);
    loadPayments();
  };

  const filtered = useMemo(() => {
    return payments.filter((pay) => {
      if (methodFilter !== "ALL" && (pay.method || "") !== methodFilter) return false;
      const q = search.toLowerCase().trim();
      if (!q) return true;
      const patientName = (pay.patientId?.name || "").toLowerCase();
      const uhid = (pay.patientId?.uhid || "").toLowerCase();
      const receiptNumber = (pay.receiptNumber || "").toLowerCase();
      const invoiceNumber = (pay.invoiceId?.invoiceNumber || "").toLowerCase();
      return (
        patientName.includes(q) ||
        uhid.includes(q) ||
        receiptNumber.includes(q) ||
        invoiceNumber.includes(q)
      );
    });
  }, [payments, search, methodFilter]);

  const totals = useMemo(() => {
    // Refunds return money, so the net collections subtract them.
    const sum = filtered.reduce(
      (acc, pay) => acc + ((pay.type || "PAYMENT") === "REFUND" ? -(Number(pay.amount) || 0) : Number(pay.amount) || 0),
      0
    );
    const byMethod: Record<string, number> = {};
    for (const pay of filtered) {
      if (pay.type === "REFUND") continue;
      const method = pay.method || "UNKNOWN";
      byMethod[method] = (byMethod[method] || 0) + (Number(pay.amount) || 0);
    }
    return { sum, byMethod };
  }, [filtered]);

  const searchAdvancePatients = async () => {
    const q = advanceSearch.trim();
    if (!q) {
      toast("Type a patient name or UHID to search", "error");
      return;
    }
    setAdvanceSearching(true);
    try {
      const res = await fetch(`/api/patient?query=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success) {
        setAdvancePatients(data.data || []);
        if ((data.data || []).length === 0) toast("No matching patients found", "error");
      } else {
        toast(data.message || "Patient search failed", "error");
      }
    } catch {
      toast("Patient search failed", "error");
    } finally {
      setAdvanceSearching(false);
    }
  };

  const pickAdvancePatient = async (patient: { _id: string; name: string; uhid?: string }) => {
    setAdvancePatientId(patient._id);
    setAdvancePatientName(patient.name);
    setAdvancePatients([]);
    setAdvanceSearch("");
    setAdvanceAdmissionId("");
    try {
      const res = await fetch(`/api/admission?patientId=${patient._id}`);
      const data = await res.json();
      const active = (data.data || []).filter((adm: { _id: string; status: string; admissionDate?: string }) => adm.status === "ADMITTED" || adm.status === "TRANSFERRED");
      setAdvanceAdmissions(active);
      if (active.length === 1) setAdvanceAdmissionId(active[0]._id);
      if (active.length === 0) toast("No active stay found for this patient", "error");
    } catch {
      toast("Failed to load the patient's stays", "error");
    }
  };

  const openAdvanceDialog = () => {
    setAdvanceSearch("");
    setAdvancePatients([]);
    setAdvancePatientId("");
    setAdvancePatientName("");
    setAdvanceAdmissions([]);
    setAdvanceAdmissionId("");
    setAdvanceAmount("");
    setAdvanceMethod("CASH");
    setAdvanceNotes("");
    setAdvanceOpen(true);
  };

  const submitAdvance = async () => {
    const amount = Number(advanceAmount);
    if (!advancePatientId || !advanceAdmissionId) {
      toast("Choose the patient and the stay the advance covers", "error");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast("Advance amount must be greater than zero", "error");
      return;
    }
    setAdvanceSaving(true);
    try {
      const res = await fetch("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ADVANCE",
          patientId: advancePatientId,
          admissionId: advanceAdmissionId,
          amount,
          method: advanceMethod,
          notes: advanceNotes,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toast(data.message || "Could not record the advance", "error");
        return;
      }
      toast(`Advance ${data.data?.receiptNumber ?? ""} recorded — it applies to this stay's bill automatically`.trim(), "success");
      setAdvanceOpen(false);
      await loadPayments();
    } catch {
      toast("Could not record the advance", "error");
    } finally {
      setAdvanceSaving(false);
    }
  };

  const refundReceipt = async () => {
    if (!receipt) return;
    const invoiceId = receipt.invoiceId?._id || receipt.invoiceId;
    const patientId = receipt.patientId?._id || receipt.patientId;
    if (!invoiceId || (receipt.type || "PAYMENT") === "REFUND") return;
    if (!window.confirm(`Refund ${fmtMoney(receipt.amount)} of receipt ${receipt.receiptNumber || ""}? The invoice balance increases again.`)) {
      return;
    }
    setRefundLoading(true);
    try {
      const res = await fetch("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "REFUND",
          invoiceId,
          patientId,
          amount: receipt.amount,
          method: receipt.method,
          notes: `Refund of receipt ${receipt.receiptNumber || receipt._id}`,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toast(data.message || "Refund failed", "error");
        return;
      }
      toast(`Refund ${data.data?.receiptNumber ?? ""} recorded — the invoice is updated`.trim(), "success");
      setReceipt(null);
      await loadPayments();
    } catch {
      toast("Refund failed", "error");
    } finally {
      setRefundLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-teal-600" />
            Payments
          </h1>
          <p className="text-sm text-muted-foreground">
            Every receipt recorded against invoices — audit trail for the billing desk.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openAdvanceDialog} disabled={!canRecordPayments} className="gap-1.5">
            <PlusCircle className="h-4 w-4" />
            Record advance
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-1.5">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Net collections (refunds subtracted)</p>
            <p className="text-xl font-bold text-teal-700">{fmtMoney(totals.sum)}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Receipts</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">By method</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(totals.byMethod).map(([method, amount]) => (
                <Badge key={method} variant="outline" className="text-[10px]">
                  {method}: {fmtMoney(amount)}
                </Badge>
              ))}
              {Object.keys(totals.byMethod).length === 0 && <span className="text-xs text-slate-400">—</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Receipt ledger</CardTitle>
          <CardDescription>
            Showing {filtered.length} of {payments.length} receipts
          </CardDescription>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search patient, UHID, receipt or invoice number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            <Select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} className="h-9 text-xs sm:w-48">
              {METHODS.map((method) => (
                <option key={method} value={method}>
                  {method === "ALL" ? "All methods" : method}
                </option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-10">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading payments…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-slate-500 py-10 text-center">
              No receipts match. Payments recorded in the bill workspace or the Bills list appear here.
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    <th className="text-left p-2.5 font-semibold">Receipt</th>
                    <th className="text-left p-2.5 font-semibold">Date</th>
                    <th className="text-left p-2.5 font-semibold">Patient</th>
                    <th className="text-left p-2.5 font-semibold">Invoice</th>
                    <th className="text-left p-2.5 font-semibold">Method</th>
                    <th className="text-right p-2.5 font-semibold">Amount</th>
                    <th className="p-2.5 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((pay) => (
                    <tr key={pay._id} className="border-t hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="p-2.5 font-mono">{pay.receiptNumber || pay._id}</td>
                      <td className="p-2.5">
                        {pay.date ? new Date(pay.date).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </td>
                      <td className="p-2.5">
                        <div className="font-semibold text-slate-900 dark:text-white">{pay.patientId?.name || "Patient"}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{pay.patientId?.uhid || ""}</div>
                      </td>
                      <td className="p-2.5 font-mono">{pay.invoiceId?.invoiceNumber || "—"}</td>
                      <td className="p-2.5">
                        <div className="flex flex-col items-start gap-0.5">
                          <Badge variant="outline" className="text-[10px]">{pay.method || "—"}</Badge>
                          {(pay.type || "PAYMENT") === "ADVANCE" && (
                            <Badge className="text-[9px] bg-amber-100 text-amber-800 hover:bg-amber-100">ADVANCE</Badge>
                          )}
                          {(pay.type || "PAYMENT") === "REFUND" && (
                            <Badge className="text-[9px] bg-rose-100 text-rose-800 hover:bg-rose-100">REFUND</Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-2.5 text-right font-mono font-semibold text-teal-700">{fmtMoney(pay.amount)}</td>
                      <td className="p-2.5">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-500" title="Open receipt" onClick={() => setReceipt(pay)}>
                          <Receipt className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!receipt} onOpenChange={(open) => !open && setReceipt(null)}>
        <DialogContent className="max-w-sm" id="print-area">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-teal-600" />
              Payment receipt
            </DialogTitle>
            <DialogDescription>
              {receipt?.receiptNumber || receipt?._id}
            </DialogDescription>
          </DialogHeader>
          {receipt && (
            <div className="space-y-2 text-xs font-mono">
              <div className="text-center border-b pb-2">
                <p className="font-bold text-sm">MEDISTRA HEALTHCARE SYSTEM</p>
                <p className="text-[10px]">OFFICIAL PAYMENT RECEIPT</p>
                <p className="text-[10px] mt-0.5">Receipt No: {receipt.receiptNumber || receipt._id}</p>
              </div>
              <Row label="Patient" value={receipt.patientId?.name || "—"} />
              <Row label="UHID" value={receipt.patientId?.uhid || "—"} />
              <Row label="Type" value={receipt.type || "PAYMENT"} />
              <Row label="Invoice" value={receipt.invoiceId?.invoiceNumber || "—"} />
              <Row label="Method" value={receipt.method || "—"} />
              <Row label="Date" value={receipt.date ? new Date(receipt.date).toLocaleString() : "—"} />
              <Row label="Amount" value={fmtMoney(receipt.amount)} bold />
              {receipt.notes && <Row label="Notes" value={receipt.notes} />}
              <p className="text-center text-[9px] pt-1 border-t">Computer-generated receipt. No physical signature required.</p>
            </div>
          )}
          <div className="space-y-1.5 no-print">
            {(receipt?.type || "PAYMENT") !== "REFUND" && receipt?.invoiceId && canRefund && (
              <Button variant="destructive" size="sm" className="w-full gap-1.5" onClick={refundReceipt} disabled={refundLoading}>
                {refundLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Refund this receipt
              </Button>
            )}
            {!canRefund && (receipt?.type || "PAYMENT") !== "REFUND" && receipt?.invoiceId && (
              <p className="text-[10px] text-slate-400 text-center">Refunds need the &quot;Refund&quot; permission on Payments.</p>
            )}
            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" />
              Print receipt
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={advanceOpen} onOpenChange={(open) => !open && setAdvanceOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-teal-600" />
              Record advance
            </DialogTitle>
            <DialogDescription>
              A deposit received for an active stay before billing. It applies to the bill automatically when the bill is raised.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {advancePatientId ? (
              <p className="text-sm font-medium text-emerald-700">Advance for {advancePatientName}</p>
            ) : (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Find patient *</label>
                <div className="flex gap-2">
                  <Input
                    value={advanceSearch}
                    onChange={(e) => setAdvanceSearch(e.target.value)}
                    placeholder="Name or UHID"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchAdvancePatients(); } }}
                  />
                  <Button variant="outline" onClick={searchAdvancePatients} disabled={advanceSearching}>
                    {advanceSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                {advancePatients.length > 0 && (
                  <div className="max-h-32 overflow-y-auto rounded-md border divide-y">
                    {advancePatients.map((patient) => (
                      <button
                        key={patient._id}
                        type="button"
                        className="block w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                        onClick={() => pickAdvancePatient(patient)}
                      >
                        {patient.name} · {patient.uhid || "—"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {advancePatientId && (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Stay *</label>
                  <Select value={advanceAdmissionId} onChange={(e) => setAdvanceAdmissionId(e.target.value)}>
                    <option value="">Select the active stay…</option>
                    {advanceAdmissions.map((adm) => (
                      <option key={adm._id} value={adm._id}>
                        {adm.status === "TRANSFERRED" ? "Transferred stay" : "Admitted stay"} · {adm.admissionDate ? new Date(adm.admissionDate).toLocaleDateString("en-IN") : "—"}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Amount ₹ *</label>
                    <Input type="number" min={1} value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Method *</label>
                    <Select value={advanceMethod} onChange={(e) => setAdvanceMethod(e.target.value)}>
                      {METHODS.filter((m) => m !== "ALL").map((method) => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Notes</label>
                  <Textarea rows={2} value={advanceNotes} onChange={(e) => setAdvanceNotes(e.target.value)} placeholder="Optional — printed on the receipt" />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdvanceOpen(false)} disabled={advanceSaving}>Cancel</Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={submitAdvance} disabled={advanceSaving || !advancePatientId}>
              {advanceSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Record advance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-semibold text-teal-700" : ""}`}>
      <span className="text-slate-500 font-sans">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
