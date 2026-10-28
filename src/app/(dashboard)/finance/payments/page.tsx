"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CreditCard,
  RefreshCw,
  Loader2,
  Search,
  Printer,
  Receipt
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

const fmtMoney = (value: number) => `₹${(Number(value) || 0).toLocaleString("en-IN")}`;

const METHODS = ["ALL", "CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "INSURANCE_TPA"];

export default function PaymentsLedgerPage() {
  const { toast } = useToast();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [receipt, setReceipt] = useState<any>(null);

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
    const sum = filtered.reduce((acc, pay) => acc + (Number(pay.amount) || 0), 0);
    const byMethod: Record<string, number> = {};
    for (const pay of filtered) {
      const method = pay.method || "UNKNOWN";
      byMethod[method] = (byMethod[method] || 0) + (Number(pay.amount) || 0);
    }
    return { sum, byMethod };
  }, [filtered]);

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
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-1.5">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Filtered collections</p>
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
                        <Badge variant="outline" className="text-[10px]">{pay.method || "—"}</Badge>
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
        <DialogContent className="max-w-sm">
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
              <Row label="Patient" value={receipt.patientId?.name || "—"} />
              <Row label="UHID" value={receipt.patientId?.uhid || "—"} />
              <Row label="Invoice" value={receipt.invoiceId?.invoiceNumber || "—"} />
              <Row label="Method" value={receipt.method || "—"} />
              <Row label="Date" value={receipt.date ? new Date(receipt.date).toLocaleString() : "—"} />
              <Row label="Amount" value={fmtMoney(receipt.amount)} bold />
              {receipt.notes && <Row label="Notes" value={receipt.notes} />}
            </div>
          )}
          <Button variant="outline" size="sm" className="w-full gap-1.5 mt-2" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            Print receipt
          </Button>
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
