"use client";

import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  CreditCard,
  FileText,
  Package,
  Pill,
  ReceiptText,
  RefreshCw,
  ShoppingCart,
  Stethoscope,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/components/permissions/permission-context";

interface PharmacySalesBucket {
  key: string;
  label: string;
  sales: number;
  count: number;
}

interface PharmacyStats {
  totalPrescriptions: number;
  todayRevenue: number;
  todayDispensedCount: number;
  totalCustomers: number;
  pendingPrescriptionsCount: number;
  totalMedicines: number;
  lowStockCount: number;
  outOfStockCount: number;
  expiringIn30DaysCount: number;
  expiredCount: number;
  range: { from: string; to: string; groupBy: GroupBy; totalSales: number; salesCount: number };
  salesSeries: PharmacySalesBucket[];
}

interface Medicine {
  _id: string;
  name: string;
  stockQuantity: number;
  reorderLevel?: number;
  expiryDate?: string;
  isActive?: boolean;
}

interface PopulatedPerson {
  _id?: string;
  name?: string;
  uhid?: string;
}

interface Prescription {
  _id: string;
  patientId?: PopulatedPerson | string;
  doctorId?: PopulatedPerson | string;
  visitDate?: string;
  createdAt?: string;
  dispenseStatus?: string;
  diagnosis?: string;
  medications?: { name: string }[];
}

interface PharmacySale {
  _id: string;
  billNumber?: string;
  patientName?: string;
  createdAt?: string;
  totalAmount?: number;
  paymentMode?: string;
}

type RangeFilter = "today" | "week" | "month" | "custom";
type GroupBy = "day" | "week" | "month";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

const QUICK_ACTIONS = [
  { title: "View Prescriptions", description: "Review the dispensing queue", href: "/pharmacy/prescriptions", icon: ClipboardList, permission: "pharmacy.prescriptions:view" },
  { title: "Dispense Medicines", description: "Open the pharmacy counter", href: "/pharmacy/dispensing", icon: Pill, permission: "pharmacy.dispensing:dispense" },
  { title: "Manage Stock", description: "Review inventory levels", href: "/pharmacy/stock", icon: Package, permission: "pharmacy.stock:view" },
  { title: "Sales & Billing", description: "Open pharmacy sales reports", href: "/reports/pharmacy", icon: ReceiptText, permission: "reports.pharmacy:view" },
  { title: "Expiry Management", description: "Review batch expiry dates", href: "/pharmacy/expiry", icon: CalendarDays, permission: "pharmacy.expiry:view" },
];

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const json = (await response.json().catch(() => ({}))) as Partial<ApiEnvelope<T>>;
  if (!response.ok || !json.success) {
    throw new Error(json.message || `Request failed (${response.status})`);
  }
  return json.data as T;
}

function getRange(filter: RangeFilter, customFrom: string, customTo: string) {
  const now = new Date();
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

  if (filter === "week") {
    const from = startOfDay(now);
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
    return { from, to: now };
  }
  if (filter === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  if (filter === "custom") {
    const from = customFrom ? startOfDay(new Date(`${customFrom}T00:00:00`)) : startOfDay(now);
    const to = customTo ? endOfDay(new Date(`${customTo}T00:00:00`)) : endOfDay(now);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return { from: startOfDay(now), to: now };
    return from <= to ? { from, to } : { from: startOfDay(now), to: now };
  }
  return { from: startOfDay(now), to: now };
}

function formatCurrency(value: number | undefined) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value ?? 0);
}

function getPersonName(person: PopulatedPerson | string | undefined, fallback: string) {
  return typeof person === "object" && person?.name ? person.name : fallback;
}

export default function PharmacistDashboard() {
  const { can } = usePermissions();
  const [stats, setStats] = React.useState<PharmacyStats | null>(null);
  const [medicines, setMedicines] = React.useState<Medicine[]>([]);
  const [prescriptions, setPrescriptions] = React.useState<Prescription[]>([]);
  const [sales, setSales] = React.useState<PharmacySale[]>([]);
  const [loading, setLoading] = React.useState({ stats: true, stock: true, prescriptions: true, sales: true });
  const [errors, setErrors] = React.useState({ stats: "", stock: "", prescriptions: "", sales: "" });
  const [refreshing, setRefreshing] = React.useState(false);
  const [rangeFilter, setRangeFilter] = React.useState<RangeFilter>("week");
  const [groupBy, setGroupBy] = React.useState<GroupBy>("day");
  const [customFrom, setCustomFrom] = React.useState("");
  const [customTo, setCustomTo] = React.useState("");

  const range = React.useMemo(() => getRange(rangeFilter, customFrom, customTo), [rangeFilter, customFrom, customTo]);
  const loadData = React.useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    setLoading({ stats: true, stock: true, prescriptions: true, sales: true });
    setErrors({ stats: "", stock: "", prescriptions: "", sales: "" });
    const params = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString(), groupBy });
    const requests = [
      fetchJson<PharmacyStats>(`/api/pharmacy/stats?${params}`),
      fetchJson<Medicine[]>("/api/pharmacy/stock"),
      fetchJson<Prescription[]>("/api/pharmacy/prescriptions"),
      fetchJson<PharmacySale[]>("/api/pharmacy/dispense?limit=5"),
    ] as const;
    const sections = ["stats", "stock", "prescriptions", "sales"] as const;
    const setters = [setStats, setMedicines, setPrescriptions, setSales] as const;
    const results = await Promise.allSettled(requests);

    results.forEach((result, index) => {
      const section = sections[index];
      if (result.status === "fulfilled") {
        setters[index](result.value as never);
      } else {
        const message = result.reason instanceof Error ? result.reason.message : "Unable to load this section.";
        setErrors((previous) => ({ ...previous, [section]: message }));
      }
      setLoading((previous) => ({ ...previous, [section]: false }));
    });
    setRefreshing(false);
  }, [range.from, range.to, groupBy]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const quickActions = React.useMemo(() => QUICK_ACTIONS.filter((action) => can(action.permission)), [can]);
  const activeMedicines = medicines.filter((medicine) => medicine.isActive !== false);
  const now = new Date();
  const expiredMedicines = activeMedicines.filter((medicine) => medicine.expiryDate && new Date(medicine.expiryDate) < now).slice(0, 4);
  const expiringSoon = activeMedicines.filter((medicine) => {
    if (!medicine.expiryDate) return false;
    const expiry = new Date(medicine.expiryDate);
    return expiry >= now && expiry <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  }).sort((a, b) => new Date(a.expiryDate!).getTime() - new Date(b.expiryDate!).getTime()).slice(0, 4);
  const lowStockItems = activeMedicines.filter((medicine) => medicine.stockQuantity <= (medicine.reorderLevel ?? 10)).sort((a, b) => a.stockQuantity - b.stockQuantity).slice(0, 4);
  const byNewest = (a: Prescription, b: Prescription) => new Date(b.visitDate || b.createdAt || 0).getTime() - new Date(a.visitDate || a.createdAt || 0).getTime();
  const pendingPrescriptions = prescriptions.filter((prescription) => !prescription.dispenseStatus || prescription.dispenseStatus === "PENDING" || prescription.dispenseStatus === "PARTIAL").sort((a, b) => new Date(a.createdAt || a.visitDate || 0).getTime() - new Date(b.createdAt || b.visitDate || 0).getTime());
  const currentPrescription = pendingPrescriptions[0];
  const waitingQueue = pendingPrescriptions.slice(0, 5);
  const recentPrescriptions = [...prescriptions].sort(byNewest).slice(0, 4);
  const maxSales = Math.max(...(stats?.salesSeries ?? []).map((point) => point.sales), 0);
  const rangeLabel = rangeFilter === "today" ? "Today" : rangeFilter === "week" ? "This week" : rangeFilter === "month" ? "This month" : "Custom range";

  return (
    <main className="mx-auto max-w-7xl space-y-5 pb-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Pharmacy</span>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Your Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Today’s prescriptions and dispensing progress.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadData(true)} disabled={refreshing || Object.values(loading).some(Boolean)} className="h-9 gap-2 rounded-lg"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh</Button>
        </div>
      </header>

      <section aria-label="Pharmacy queue summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard label="Waiting" value={pendingPrescriptions.length} icon={Clock3} loading={loading.prescriptions} error={errors.prescriptions} hint="Prescriptions ready to dispense" />
        <MetricCard label="Dispensed Today" value={stats?.todayDispensedCount} icon={CheckCircle2} loading={loading.stats} error={errors.stats} hint="Completed pharmacy bills" />
        <MetricCard label="Today's Sales" value={stats?.todayRevenue} currency icon={ShoppingCart} loading={loading.stats} error={errors.stats} hint={`${stats?.todayDispensedCount ?? 0} bills processed`} />
      </section>

      {!errors.stock && (lowStockItems.length > 0 || expiringSoon.length > 0 || expiredMedicines.length > 0) && <div className="flex flex-wrap gap-2">{lowStockItems.length > 0 && <Link href="/pharmacy/stock" className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><AlertTriangle className="h-3.5 w-3.5" />{(stats?.lowStockCount ?? 0) + (stats?.outOfStockCount ?? 0)} need restocking</Link>}{(expiringSoon.length > 0 || expiredMedicines.length > 0) && <Link href="/pharmacy/expiry" className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"><AlertTriangle className="h-3.5 w-3.5" />{(stats?.expiringIn30DaysCount ?? 0) + (stats?.expiredCount ?? 0)} expiry alerts</Link>}</div>}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.95fr)]">
        <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm dark:border-emerald-900 dark:bg-slate-900">
          <div className="border-b border-emerald-100 bg-emerald-50/70 px-5 py-4 dark:border-emerald-900/70 dark:bg-emerald-950/30">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Current / Next Prescription</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Your active prescription or the next one waiting.</p>
          </div>
          {loading.prescriptions ? <div className="space-y-3 p-5"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-56" /><Skeleton className="h-9 w-full" /></div> : errors.prescriptions ? <div className="p-5"><InlineError message={errors.prescriptions} /></div> : currentPrescription ? <div className="flex min-h-[190px] flex-col justify-between gap-5 p-5 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold text-emerald-800 dark:text-emerald-300">#{currentPrescription._id.slice(-7).toUpperCase()}</span><StatusBadge status={currentPrescription.dispenseStatus} /></div>
              <h3 className="mt-3 truncate text-xl font-semibold text-slate-900 dark:text-white">{getPersonName(currentPrescription.patientId, "Patient")}</h3>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400"><span className="inline-flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" />{getPersonName(currentPrescription.doctorId, "Doctor")}</span><span>{currentPrescription.visitDate ? new Date(currentPrescription.visitDate).toLocaleDateString("en-IN") : "Date not recorded"}</span><span>{currentPrescription.medications?.length ?? 0} medicines</span></div>
              {currentPrescription.diagnosis && <p className="mt-2 truncate text-xs text-slate-500">{currentPrescription.diagnosis}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <Link href={`/pharmacy/prescriptions?prescriptionId=${encodeURIComponent(currentPrescription._id)}`} className={buttonVariants({ variant: "outline", size: "sm", className: "h-9 rounded-lg" })}>View details</Link>
              {can("pharmacy.dispensing:dispense") && <Link href={`/pharmacy/dispensing?prescriptionId=${encodeURIComponent(currentPrescription._id)}`} className={buttonVariants({ size: "sm", className: "h-9 gap-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800" })}><ShoppingCart className="h-4 w-4" /> Dispense</Link>}
            </div>
          </div> : <div className="flex min-h-[190px] flex-col items-center justify-center px-5 py-8 text-center"><Clock3 className="h-7 w-7 text-slate-300 dark:text-slate-600" /><p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">No prescriptions waiting</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Your dispensing queue is clear.</p></div>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-5 flex items-start justify-between gap-2"><div><h2 className="text-sm font-semibold text-slate-900 dark:text-white">Waiting</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Next five, priority first</p></div><Link href="/pharmacy/prescriptions" className="shrink-0 pt-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">Full queue →</Link></div>
          {loading.prescriptions ? <div className="space-y-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-10 w-full" />)}</div> : errors.prescriptions ? <InlineError message={errors.prescriptions} /> : waitingQueue.length ? <div className="divide-y divide-slate-100 dark:divide-slate-800">{waitingQueue.map((prescription) => <Link key={prescription._id} href={`/pharmacy/prescriptions?prescriptionId=${encodeURIComponent(prescription._id)}`} className="flex items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">{getPersonName(prescription.patientId, "Patient")}</p><p className="mt-1 truncate text-[11px] text-slate-500">#{prescription._id.slice(-7).toUpperCase()} · {prescription.visitDate ? new Date(prescription.visitDate).toLocaleDateString("en-IN") : "—"}</p></div><StatusBadge status={prescription.dispenseStatus} /></Link>)}</div> : <div className="flex min-h-[84px] items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-500 dark:bg-slate-950 dark:text-slate-400">No prescriptions waiting</div>}
        </section>
      </section>

      <details className="group rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <summary className="cursor-pointer list-none text-sm font-medium text-slate-700 marker:hidden dark:text-slate-200">More pharmacy details <span className="ml-1 text-xs text-slate-400">Sales, stock and recent bills</span></summary>
        <div className="space-y-5 pt-5">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total Prescriptions" value={stats?.totalPrescriptions} icon={FileText} loading={loading.stats} error={errors.stats} hint={`${stats?.pendingPrescriptionsCount ?? 0} awaiting dispense`} />
        <MetricCard label="Total Customers" value={stats?.totalCustomers} icon={Users} loading={loading.stats} error={errors.stats} hint="Customers with pharmacy purchases" />
        <MetricCard label="Total Sales" value={stats?.range.totalSales} currency icon={TrendingUp} loading={loading.stats} error={errors.stats} hint={`${rangeLabel} · ${stats?.range.salesCount ?? 0} bills`} />
        <MetricCard label="Total Medicines" value={stats?.totalMedicines} icon={Package} loading={loading.stats} error={errors.stats} hint="Active medicines in stock" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(330px,0.9fr)]">
        <Panel title="Sales analytics" subtitle={`${rangeLabel} · ${stats?.range.salesCount ?? 0} bills`} icon={TrendingUp} error={errors.stats} loading={loading.stats}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <select aria-label="Sales date range" value={rangeFilter} onChange={(event) => setRangeFilter(event.target.value as RangeFilter)} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="custom">Custom range</option>
            </select>
            <div className="flex items-center gap-2">
              {rangeFilter === "custom" && <><Input type="date" value={customFrom} max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} className="h-8 w-32 text-xs" aria-label="Start date" /><span className="text-xs text-slate-400">to</span><Input type="date" value={customTo} min={customFrom || undefined} onChange={(event) => setCustomTo(event.target.value)} className="h-8 w-32 text-xs" aria-label="End date" /></>}
              <select aria-label="Sales chart interval" value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupBy)} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option>
              </select>
            </div>
          </div>
          {stats?.salesSeries.length ? (
            <div className="flex h-36 items-end gap-2 overflow-x-auto pb-1" role="img" aria-label={`Sales chart, ${rangeLabel.toLowerCase()}, grouped by ${groupBy}`}>
              {stats.salesSeries.map((bucket) => {
                const height = maxSales > 0 && bucket.sales > 0 ? Math.max((bucket.sales / maxSales) * 100, 4) : 1;
                return <div key={bucket.key} className="group flex h-full min-w-[30px] flex-1 flex-col items-center justify-end gap-2" title={`${bucket.label}: ${formatCurrency(bucket.sales)}, ${bucket.count} bills`}><span className="max-w-full truncate text-[10px] text-slate-500 opacity-0 group-hover:opacity-100">{bucket.sales ? formatCurrency(bucket.sales) : ""}</span><div className="w-full rounded-t-md bg-emerald-600/80 transition-colors group-hover:bg-emerald-700" style={{ height: `${height}%` }} /><span className="max-w-full truncate text-[10px] text-slate-400">{bucket.label}</span></div>;
              })}
            </div>
          ) : <EmptyState text="No sales recorded for this period." />}
        </Panel>

        <Panel title="Medicine stock" subtitle="Inventory and items needing attention" icon={Package} error={errors.stock} loading={loading.stock}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
            <StockMetric label="Total medicines" value={stats?.totalMedicines} loading={loading.stats} error={errors.stats} />
            <StockMetric label="Low stock" value={stats?.lowStockCount} tone="amber" loading={loading.stats} error={errors.stats} />
            <StockMetric label="Out of stock" value={stats?.outOfStockCount} tone="rose" loading={loading.stats} error={errors.stats} />
            <StockMetric label="Expiring soon" value={stats?.expiringIn30DaysCount} tone="amber" loading={loading.stats} error={errors.stats} />
            <StockMetric label="Expired" value={stats?.expiredCount} tone="rose" loading={loading.stats} error={errors.stats} />
          </div>
          {errors.stock ? <InlineError message={errors.stock} /> : (
            <div className="mt-4 space-y-2">
              {lowStockItems.length > 0 && <Link href="/pharmacy/stock" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>{(stats?.lowStockCount ?? 0) + (stats?.outOfStockCount ?? 0)} medicines need restocking.</strong> {lowStockItems.map((medicine) => medicine.name).join(", ")}</span></Link>}
              {expiringSoon.length > 0 && <Link href="/pharmacy/expiry" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>{stats?.expiringIn30DaysCount ?? expiringSoon.length} medicines expire within 30 days.</strong> {expiringSoon.map((medicine) => medicine.name).join(", ")}</span></Link>}
              {expiredMedicines.length > 0 && <Link href="/pharmacy/expiry" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>{stats?.expiredCount ?? expiredMedicines.length} expired medicines need review.</strong> {expiredMedicines.map((medicine) => medicine.name).join(", ")}</span></Link>}
              {!lowStockItems.length && !expiringSoon.length && !expiredMedicines.length && <p className="rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">No low-stock or expiry alerts.</p>}
            </div>
          )}
          <Link href="/pharmacy/stock" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400">Open stock <ArrowRight className="h-3.5 w-3.5" /></Link>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="Recent prescriptions" subtitle="Latest prescriptions for dispensing" icon={ClipboardList} actionHref="/pharmacy/prescriptions" actionLabel="All prescriptions" error={errors.prescriptions} loading={loading.prescriptions}>
          {recentPrescriptions.length ? <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left text-xs"><thead><tr className="border-b border-slate-100 text-[10px] uppercase tracking-wide text-slate-400 dark:border-slate-800"><th className="pb-2 font-medium">Prescription</th><th className="pb-2 font-medium">Patient</th><th className="pb-2 font-medium">Doctor</th><th className="pb-2 font-medium">Date</th><th className="pb-2 font-medium">Status</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{recentPrescriptions.map((prescription) => <tr key={prescription._id} className="group"><td className="py-3"><Link href={`/pharmacy/prescriptions?prescriptionId=${encodeURIComponent(prescription._id)}`} className="font-medium text-emerald-800 hover:underline dark:text-emerald-300">#{prescription._id.slice(-7).toUpperCase()}</Link></td><td className="py-3 text-slate-700 dark:text-slate-200">{getPersonName(prescription.patientId, "Patient")}</td><td className="py-3 text-slate-600 dark:text-slate-300">{getPersonName(prescription.doctorId, "Doctor")}</td><td className="py-3 text-slate-500">{prescription.visitDate ? new Date(prescription.visitDate).toLocaleDateString("en-IN") : "—"}</td><td className="py-3"><StatusBadge status={prescription.dispenseStatus} /></td></tr>)}</tbody></table></div> : <EmptyState text="No prescriptions to show yet." />}
        </Panel>

        <Panel title="Recent sales" subtitle="Latest pharmacy bills" icon={ReceiptText} actionHref="/reports/pharmacy" actionLabel="Sales & billing" error={errors.sales} loading={loading.sales}>
          {sales.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead><tr className="border-b border-slate-100 text-[10px] uppercase tracking-wide text-slate-400 dark:border-slate-800"><th className="pb-2 font-medium">Invoice ID</th><th className="pb-2 font-medium">Customer</th><th className="pb-2 font-medium">Sale date</th><th className="pb-2 text-right font-medium">Total</th><th className="pb-2 pl-3 font-medium">Payment</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{sales.map((sale) => <tr key={sale._id}><td className="py-3 font-medium text-slate-800 dark:text-slate-100">{sale.billNumber || `#${sale._id.slice(-7)}`}</td><td className="py-3 text-slate-600 dark:text-slate-300">{sale.patientName || "Walk-in"}</td><td className="py-3 text-slate-500">{sale.createdAt ? new Date(sale.createdAt).toLocaleDateString("en-IN") : "—"}</td><td className="py-3 text-right font-semibold text-slate-900 dark:text-white">{formatCurrency(sale.totalAmount)}</td><td className="py-3 pl-3"><span className="inline-flex items-center gap-1 text-slate-500"><CreditCard className="h-3 w-3" />{sale.paymentMode || "—"}</span></td></tr>)}</tbody></table></div> : <EmptyState text="No pharmacy sales recorded yet." />}
        </Panel>
      </section>

      {quickActions.length > 0 && <nav aria-label="Pharmacy quick actions" className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">{quickActions.map(({ title, href, icon: Icon }) => <Link key={href} href={href} className="inline-flex items-center gap-2 py-1 text-xs font-medium text-slate-600 transition hover:text-emerald-700 dark:text-slate-300 dark:hover:text-emerald-300"><Icon className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />{title}</Link>)}</nav>}
        </div>
      </details>
    </main>
  );
}

function MetricCard({ label, value, currency = false, icon: Icon, loading, error, hint }: { label: string; value?: number; currency?: boolean; icon: LucideIcon; loading: boolean; error: string; hint: string }) {
  return <div className="flex min-h-[92px] items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_20px_-16px_rgba(15,23,42,0.5)] dark:border-slate-800 dark:bg-slate-900"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Icon className="h-5 w-5" /></span><div className="min-w-0"><p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p><div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{error ? "—" : loading ? <Skeleton className="h-7 w-20" /> : currency ? formatCurrency(value) : (value ?? 0).toLocaleString("en-IN")}</div><p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{error ? "Data unavailable" : hint}</p></div></div>;
}

function StockMetric({ label, value, loading, error, tone = "slate" }: { label: string; value?: number; loading: boolean; error: string; tone?: "slate" | "amber" | "rose" }) {
  const colors = { slate: "text-slate-900 dark:text-white", amber: "text-amber-700 dark:text-amber-300", rose: "text-rose-700 dark:text-rose-300" };
  return <div className="flex items-center justify-between gap-2 border-b border-slate-100 py-2 dark:border-slate-800"><p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{label}</p><p className={`text-sm font-semibold ${colors[tone]}`}>{loading ? <Skeleton className="h-4 w-8" /> : error ? "—" : (value ?? 0).toLocaleString("en-IN")}</p></div>;
}

function Panel({ title, subtitle, icon: Icon, actionHref, actionLabel, error, loading, children }: { title: string; subtitle: string; icon: LucideIcon; actionHref?: string; actionLabel?: string; error: string; loading: boolean; children: React.ReactNode }) {
  return <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5"><div className="mb-4 flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Icon className="h-4 w-4" /></span><div className="min-w-0"><h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2><p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p></div></div>{actionHref && actionLabel && <Link href={actionHref} className="shrink-0 pt-1 text-[11px] font-medium text-emerald-700 hover:underline dark:text-emerald-400">{actionLabel} <span aria-hidden="true">→</span></Link>}</div>{loading ? <div className="space-y-2 py-2">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-8 w-full" />)}</div> : error ? <InlineError message={error} /> : children}</section>;
}

function InlineError({ message }: { message: string }) {
  return <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>{message}</p></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex min-h-32 flex-col items-center justify-center rounded-lg bg-slate-50 px-4 text-center dark:bg-slate-950"><ShoppingCart className="h-5 w-5 text-slate-300 dark:text-slate-600" /><p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{text}</p></div>;
}

function StatusBadge({ status }: { status?: string }) {
  const style = status === "DISPENSED" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : status === "PARTIAL" ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : status === "CANCELLED" ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  const label = status === "DISPENSED" ? "Dispensed" : status === "PARTIAL" ? "Partial" : status === "CANCELLED" ? "Cancelled" : "Pending";
  return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${style}`}>{label}</span>;
}
