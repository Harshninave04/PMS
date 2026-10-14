"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  ClipboardList,
  Clock3,
  Pill,
  Plus,
  RefreshCw,
  ShoppingCart,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface PharmacyStats {
  totalMedicines: number;
  totalStockValuation: number;
  lowStockCount: number;
  outOfStockCount: number;
  expiredCount: number;
  expiringIn30DaysCount: number;
  todayDispensedCount: number;
  todayRevenue: number;
  pendingPrescriptionsCount: number;
  salesSeries: { key: string; label: string; sales: number; count: number }[];
}

interface Medicine {
  _id: string;
  name: string;
  category?: string;
  stockQuantity: number;
  reorderLevel?: number;
}

interface Dispense {
  _id: string;
  billNumber?: string;
  patientName?: string;
  paymentMode?: string;
  totalAmount?: number;
  items?: unknown[];
  createdAt: string;
}

const currency = (value = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

export default function PharmacyHubPage() {
  const [stats, setStats] = useState<PharmacyStats | null>(null);
  const [dispenses, setDispenses] = useState<Dispense[]>([]);
  const [lowStock, setLowStock] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const from = new Date();
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      const [statsRes, dispensesRes, medicinesRes] = await Promise.all([
        fetch(`/api/pharmacy/stats?from=${encodeURIComponent(from.toISOString())}&groupBy=day`),
        fetch("/api/pharmacy/dispense?limit=5"),
        fetch("/api/pharmacy/medicines"),
      ]);
      const [statsJson, dispensesJson, medicinesJson] = await Promise.all([
        statsRes.json(),
        dispensesRes.json(),
        medicinesRes.json(),
      ]);
      if (!statsRes.ok || !statsJson.success) throw new Error("Could not load pharmacy overview");
      setStats(statsJson.data);
      setDispenses(dispensesJson.success ? dispensesJson.data ?? [] : []);
      const medicines: Medicine[] = medicinesJson.success ? medicinesJson.data ?? [] : [];
      setLowStock(
        medicines
          .filter((medicine) => medicine.stockQuantity <= (medicine.reorderLevel ?? 10))
          .sort((a, b) => a.stockQuantity - b.stockQuantity)
          .slice(0, 5)
      );
    } catch (error) {
      console.error(error);
      toast("Unable to load pharmacy overview", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const maxSales = Math.max(...(stats?.salesSeries ?? []).map((point) => point.sales), 0);
  const salesChange = (stats?.salesSeries.at(-1)?.sales ?? 0) - (stats?.salesSeries.at(-2)?.sales ?? 0);

  return (
    <main className="mx-auto max-w-[1500px] space-y-7 pb-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
            Pharmacy
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Good day. Here’s your overview.</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Keep dispensing moving and stay ahead of stock.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="h-9 rounded-lg">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Link href="/pharmacy/dispensing">
            <Button size="sm" className="h-9 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800">
              <Plus className="mr-2 h-4 w-4" /> New dispense
            </Button>
          </Link>
        </div>
      </header>

      <nav aria-label="Pharmacy shortcuts" className="flex flex-wrap gap-2">
        {[
          { href: "/pharmacy/prescriptions", label: "Prescriptions", icon: ClipboardList },
          { href: "/pharmacy/medicines", label: "Medicine catalog", icon: Pill },
          { href: "/pharmacy/stock", label: "Stock", icon: Boxes },
          { href: "/pharmacy/expiry", label: "Expiry tracking", icon: Clock3 },
        ].map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:border-emerald-300 hover:text-emerald-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-emerald-300">
            <Icon className="h-4 w-4" /> {label} <ArrowRight className="h-3.5 w-3.5 opacity-50" />
          </Link>
        ))}
      </nav>

      <section aria-label="Pharmacy summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Today’s sales" value={currency(stats?.todayRevenue)} detail={`${stats?.todayDispensedCount ?? 0} bills processed`} icon={ShoppingCart} loading={loading} />
        <Metric label="Pending prescriptions" value={stats?.pendingPrescriptionsCount ?? 0} detail="Ready for review" icon={ClipboardList} loading={loading} href="/pharmacy/prescriptions" accent="violet" />
        <Metric label="Needs restocking" value={(stats?.lowStockCount ?? 0) + (stats?.outOfStockCount ?? 0)} detail={`${stats?.outOfStockCount ?? 0} items out of stock`} icon={AlertTriangle} loading={loading} href="/pharmacy/stock" accent="amber" />
        <Metric label="Inventory value" value={currency(stats?.totalStockValuation)} detail={`${stats?.totalMedicines ?? 0} medicines in catalog`} icon={Boxes} loading={loading} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">Sales activity</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Last 7 days</p>
            </div>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${salesChange >= 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"}`}>
              {salesChange >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {currency(Math.abs(salesChange))} vs previous day
            </span>
          </div>
          <div className="h-[250px] w-full">
            {stats?.salesSeries?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.salesSeries} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pharmacySalesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#059669" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 5" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(value: number) => value ? `${Math.round(value / 1000)}k` : "0"} />
                  <Tooltip formatter={(value) => [currency(Number(value)), "Sales"]} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,.08)" }} />
                  <Area type="monotone" dataKey="sales" stroke="#059669" strokeWidth={2.5} fill="url(#pharmacySalesFill)" activeDot={{ r: 4, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500 dark:bg-slate-950">{loading ? "Loading sales activity…" : "No sales recorded today"}</div>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm dark:border-slate-800">
            <span className="text-slate-500">Highest daily sales</span>
            <span className="font-semibold text-slate-900 dark:text-white">{currency(maxSales)}</span>
          </div>
        </div>

        <Panel title="Stock to review" description="Items at or below reorder level" icon={AlertTriangle} actionHref="/pharmacy/stock" actionLabel="View stock">
          {lowStock.length ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {lowStock.map((medicine) => {
                const empty = medicine.stockQuantity === 0;
                return (
                  <div key={medicine._id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{medicine.name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{medicine.category || "Medicine"} · Reorder at {medicine.reorderLevel ?? 10}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${empty ? "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>
                      {empty ? "Out of stock" : `${medicine.stockQuantity} left`}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-7 text-center text-sm text-slate-500">{loading ? "Checking stock…" : "Stock levels look healthy."}</p>
          )}
          {(stats?.expiredCount ?? 0) + (stats?.expiringIn30DaysCount ?? 0) > 0 && (
            <Link href="/pharmacy/expiry" className="mt-4 flex items-center justify-between rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
              <span>{stats?.expiredCount ?? 0} expired · {stats?.expiringIn30DaysCount ?? 0} expiring soon</span><ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </Panel>
      </section>

      <Panel title="Recent dispensing" description="Latest pharmacy transactions" icon={ShoppingCart} actionHref="/pharmacy/dispensing" actionLabel="View all">
        {dispenses.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800"><th className="pb-3 font-medium">Bill</th><th className="pb-3 font-medium">Patient</th><th className="pb-3 font-medium">Items</th><th className="pb-3 font-medium">Payment</th><th className="pb-3 text-right font-medium">Amount</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {dispenses.map((dispense) => (
                  <tr key={dispense._id}>
                    <td className="py-3.5 font-medium text-slate-800 dark:text-slate-100">{dispense.billNumber || "—"}<span className="mt-0.5 block text-xs font-normal text-slate-400">{new Date(dispense.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></td>
                    <td className="py-3.5 text-slate-600 dark:text-slate-300">{dispense.patientName || "Walk-in"}</td>
                    <td className="py-3.5 text-slate-500">{dispense.items?.length ?? 0} items</td>
                    <td className="py-3.5 text-slate-500">{dispense.paymentMode || "—"}</td>
                    <td className="py-3.5 text-right font-semibold text-slate-900 dark:text-white">{currency(dispense.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-slate-500">{loading ? "Loading transactions…" : "Your latest dispenses will appear here."}</p>
        )}
      </Panel>
    </main>
  );
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  loading,
  href,
  accent = "emerald",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  loading: boolean;
  href?: string;
  accent?: "emerald" | "violet" | "amber";
}) {
  const tone = {
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  }[accent];
  const content = (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{loading ? <span className="inline-block h-7 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /> : value}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  );
  return href ? <Link href={href} className="block rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2">{content}</Link> : content;
}

function Panel({
  title,
  description,
  icon: Icon,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  actionHref: string;
  actionLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Icon className="h-4 w-4" /></span>
          <div><h2 className="font-semibold text-slate-900 dark:text-white">{title}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p></div>
        </div>
        <Link href={actionHref} className="shrink-0 pt-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400">{actionLabel} <span aria-hidden="true">→</span></Link>
      </div>
      {children}
    </section>
  );
}
