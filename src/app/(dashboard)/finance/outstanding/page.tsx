"use client";

import { useEffect, useState } from "react";
import {
  ClockAlert,
  RefreshCw,
  Loader2,
  Wallet,
  Bell,
  Phone
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

const fmtMoney = (value: number) => `₹${(Number(value) || 0).toLocaleString("en-IN")}`;

const PAYMENT_METHODS = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "INSURANCE_TPA"];

export default function OutstandingPaymentsPage() {
  const { toast } = useToast();
  const [dues, setDues] = useState<any[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [bucketTotals, setBucketTotals] = useState<{ label: string; total: number; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [collectOpen, setCollectOpen] = useState(false);
  const [target, setTarget] = useState<any>(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectMethod, setCollectMethod] = useState("CASH");
  const [collectNotes, setCollectNotes] = useState("");
  const [collecting, setCollecting] = useState(false);

  const loadDues = async () => {
    try {
      const res = await fetch("/api/finance/outstanding");
      const data = await res.json();
      if (data.success) {
        setDues(data.data.allOutstanding || []);
        setGrandTotal(data.data.grandTotalOutstanding || 0);
        const buckets = data.data.buckets || {};
        setBucketTotals([
          { label: "0-30 days", total: buckets.bucket0To30?.total ?? 0, count: buckets.bucket0To30?.count ?? 0 },
          { label: "31-60 days", total: buckets.bucket31To60?.total ?? 0, count: buckets.bucket31To60?.count ?? 0 },
          { label: "61-90 days", total: buckets.bucket61To90?.total ?? 0, count: buckets.bucket61To90?.count ?? 0 },
          { label: "90+ days", total: buckets.bucketOver90?.total ?? 0, count: buckets.bucketOver90?.count ?? 0 },
        ]);
      } else {
        toast(data.message || "Failed to load outstanding dues", "error");
      }
    } catch {
      toast("Failed to load outstanding dues", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDues();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setLoading(true);
    loadDues();
  };

  const openCollect = (row: any) => {
    setTarget(row);
    setCollectAmount(String(row.calculatedBalance ?? ""));
    setCollectMethod("CASH");
    setCollectNotes("");
    setCollectOpen(true);
  };

  const submitCollection = async () => {
    const amount = Number(collectAmount);
    if (!collectAmount || !amount || amount <= 0) {
      toast("Enter the collected amount", "error");
      return;
    }
    setCollecting(true);
    try {
      const res = await fetch("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: target._id,
          patientId: target.patientId?._id || target.patientId,
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
      setCollectOpen(false);
      await loadDues();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to record the payment", "error");
    } finally {
      setCollecting(false);
    }
  };

  const ageBadgeClass = (ageDays: number) =>
    ageDays <= 30
      ? "bg-slate-100 text-slate-700 border-slate-300"
      : ageDays <= 60
        ? "bg-amber-100 text-amber-800 border-amber-300"
        : ageDays <= 90
          ? "bg-orange-100 text-orange-800 border-orange-300"
          : "bg-rose-100 text-rose-800 border-rose-300";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClockAlert className="h-6 w-6 text-orange-500" />
            Outstanding dues
          </h1>
          <p className="text-sm text-muted-foreground">
            Unpaid and partly paid invoices with aging. Collect from here or chase the patient.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-1.5">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <Card className="border border-orange-200 bg-orange-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Total due</p>
            <p className="text-xl font-bold text-orange-600">{fmtMoney(grandTotal)}</p>
          </CardContent>
        </Card>
        {bucketTotals.map((bucket) => (
          <Card key={bucket.label} className="border shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">{bucket.label}</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{fmtMoney(bucket.total)}</p>
              <p className="text-[11px] text-slate-400">{bucket.count} invoice(s)</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Aging register</CardTitle>
          <CardDescription>
            Oldest dues first. Balance follows every recorded payment automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-10">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading outstanding dues…
            </div>
          ) : dues.length === 0 ? (
            <p className="text-xs text-slate-500 py-10 text-center">
              Nothing outstanding — every invoice is paid or cancelled.
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    <th className="text-left p-2.5 font-semibold">Invoice</th>
                    <th className="text-left p-2.5 font-semibold">Patient</th>
                    <th className="text-left p-2.5 font-semibold">Status</th>
                    <th className="text-right p-2.5 font-semibold">Final ₹</th>
                    <th className="text-right p-2.5 font-semibold">Paid ₹</th>
                    <th className="text-right p-2.5 font-semibold">Balance ₹</th>
                    <th className="text-left p-2.5 font-semibold">Age</th>
                    <th className="text-right p-2.5 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dues.map((row) => (
                    <tr key={row._id} className="border-t hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="p-2.5 font-mono">{row.invoiceNumber || row._id}</td>
                      <td className="p-2.5">
                        <div className="font-semibold text-slate-900 dark:text-white">{row.patientId?.name || "Patient"}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {row.patientId?.uhid || ""} {row.patientId?.contact ? `· ${row.patientId.contact}` : ""}
                        </div>
                      </td>
                      <td className="p-2.5">
                        <Badge variant="outline" className="text-[10px]">{row.status || "UNPAID"}</Badge>
                      </td>
                      <td className="p-2.5 text-right font-mono">{fmtMoney(row.finalAmount)}</td>
                      <td className="p-2.5 text-right font-mono text-teal-700">{fmtMoney(row.paidAmount)}</td>
                      <td className="p-2.5 text-right font-mono font-bold text-orange-600">{fmtMoney(row.calculatedBalance)}</td>
                      <td className="p-2.5">
                        <Badge className={`text-[10px] ${ageBadgeClass(row.ageDays)}`}>
                          {row.ageDays}d
                        </Badge>
                      </td>
                      <td className="p-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs bg-teal-600 hover:bg-teal-700 text-white gap-1"
                            onClick={() => openCollect(row)}
                          >
                            <Wallet className="h-3 w-3" />
                            Collect
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs text-slate-500 gap-1"
                            title="Log a follow-up reminder (notification module pending — stays a note for now)"
                            onClick={() =>
                              toast(
                                `Reminder noted for ${row.patientId?.name || "patient"} — balance ${fmtMoney(row.calculatedBalance)}`,
                                "success"
                              )
                            }
                          >
                            <Bell className="h-3 w-3" />
                            Remind
                          </Button>
                          {row.patientId?.contact && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-slate-500"
                              title={`Contact ${row.patientId.contact}`}
                            >
                              <Phone className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={collectOpen} onOpenChange={(open) => !open && !collecting && setCollectOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-teal-600" />
              Quick collection
            </DialogTitle>
            <DialogDescription>
              {target
                ? `${target.invoiceNumber || "Invoice"} — balance ${fmtMoney(target.calculatedBalance)}${target.patientId?.name ? ` for ${target.patientId.name}` : ""}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Amount ₹ *</label>
              <Input
                type="number"
                min={1}
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
            <Button variant="outline" onClick={() => setCollectOpen(false)} disabled={collecting}>
              Cancel
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
