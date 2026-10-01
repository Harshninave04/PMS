"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Users,
  Calendar,
  UserCheck,
  Bed,
  Pill,
  CreditCard,
  RefreshCw,
  Printer,
  IndianRupee,
  ChevronRight,
  ArrowUpRight,
  Hospital
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export default function ReportsHubPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState("ALL_TIME");
  const { toast } = useToast();

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/reports/summary?timeframe=${timeframe}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        toast("Failed to load reports summary: " + json.message, "error");
      }
    } catch (err: any) {
      toast("Error fetching summary: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [timeframe]);

  const overview = data?.overview || {
    totalPatients: 0,
    totalAppointments: 0,
    totalAdmissions: 0,
    activeInpatients: 0,
    totalBeds: 0,
    occupiedBeds: 0,
    availableBeds: 0,
    bedOccupancyRate: "0%",
    totalRevenue: 0,
    totalBilled: 0,
    totalOutstanding: 0,
    lowStockAlerts: 0
  };

  const reportModules = [
    {
      category: "Patients & OPD",
      items: [
        {
          title: "Patient Reports",
          path: "/reports/patients",
          icon: Users,
          color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
          description: "New registrations, age groups, gender and blood group breakdown.",
          metric: `${overview.totalPatients} Registered`
        },
        {
          title: "Appointment Reports",
          path: "/reports/appointments",
          icon: Calendar,
          color: "text-purple-600 bg-purple-50 dark:bg-purple-950/40",
          description: "OPD bookings, completed vs cancelled visits and no-shows.",
          metric: `${overview.totalAppointments} Booked`
        },
        {
          title: "Doctor Reports",
          path: "/reports/doctors",
          icon: UserCheck,
          color: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/40",
          description: "Consultations per doctor and department.",
          metric: "Doctor Roster"
        }
      ]
    },
    {
      category: "IPD, Pharmacy & Billing",
      items: [
        {
          title: "Admission Reports",
          path: "/reports/admissions",
          icon: Hospital,
          color: "text-teal-600 bg-teal-50 dark:bg-teal-950/40",
          description: "Admissions, discharges and ward-wise inpatient census.",
          metric: `${overview.totalAdmissions} Total IPD`
        },
        {
          title: "Pharmacy Reports",
          path: "/reports/pharmacy",
          icon: Pill,
          color: "text-green-600 bg-green-50 dark:bg-green-950/40",
          description: "Medicines dispensed, fast-moving items and pharmacy sales.",
          metric: `${overview.lowStockAlerts} Low Stock`
        },
        {
          title: "Billing & Collection Reports",
          path: "/reports/billing",
          icon: CreditCard,
          color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
          description: "Amount billed, collected and outstanding, by payment mode.",
          metric: `₹${overview.totalRevenue.toLocaleString("en-IN")}`
        }
      ]
    }
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Hospital Intelligence Unit
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Hospital Reports & Analytics Hub
          </h1>
          <p className="text-muted-foreground text-sm">
            Key numbers for patients, OPD, IPD, pharmacy and billing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Timeframe Selector */}
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="h-8 text-xs rounded-md border border-input bg-background px-2.5 text-foreground focus:ring-1 focus:ring-primary"
          >
            <option value="ALL_TIME">All Time</option>
            <option value="TODAY">Today</option>
            <option value="7_DAYS">Last 7 Days</option>
            <option value="30_DAYS">Last 30 Days</option>
            <option value="QUARTER">Last 90 Days</option>
            <option value="YTD">Year to Date (YTD)</option>
          </select>
          <Button variant="outline" size="sm" onClick={fetchSummary} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Print Overview
          </Button>
        </div>
      </div>

      {/* High-Level Executive KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border-l-4 border-l-emerald-500">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Net Realized Revenue</p>
              <h3 className="text-2xl font-bold mt-1 text-emerald-600">
                ₹{overview.totalRevenue.toLocaleString("en-IN")}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                From ₹{overview.totalBilled.toLocaleString("en-IN")} billed
              </p>
            </div>
            <div className="h-11 w-11 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600">
              <IndianRupee className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-l-4 border-l-primary">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bed Occupancy Rate</p>
              <h3 className="text-2xl font-bold mt-1 text-primary">
                {overview.bedOccupancyRate}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {overview.occupiedBeds} occupied / {overview.totalBeds} total beds
              </p>
            </div>
            <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Bed className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-l-4 border-l-purple-500">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inpatient Census</p>
              <h3 className="text-2xl font-bold mt-1 text-purple-600">
                {overview.activeInpatients} Active
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {overview.totalAdmissions} cumulative admissions
              </p>
            </div>
            <div className="h-11 w-11 rounded-lg bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center text-purple-600">
              <Hospital className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-l-4 border-l-amber-500">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outstanding Receivables</p>
              <h3 className="text-2xl font-bold mt-1 text-amber-600">
                ₹{overview.totalOutstanding.toLocaleString("en-IN")}
              </h3>
              <p className="text-xs text-amber-600 font-medium mt-1">
                Patient dues pending collection
              </p>
            </div>
            <div className="h-11 w-11 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center text-amber-600">
              <CreditCard className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Specialized Reports Categorized Workstation Grid */}
      <div className="space-y-6">
        {reportModules.map((modGroup, gIdx) => (
          <div key={gIdx} className="space-y-3">
            <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary inline-block" />
              {modGroup.category}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {modGroup.items.map((report, rIdx) => {
                const Icon = report.icon;
                return (
                  <Link key={rIdx} href={report.path} className="group">
                    <Card className="h-full shadow-sm hover:shadow-md transition-all hover:border-primary/50 group-hover:bg-muted/10 cursor-pointer">
                      <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                        <div className="flex items-start justify-between">
                          <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${report.color}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-foreground">
                            {report.metric}
                          </span>
                        </div>

                        <div>
                          <h3 className="font-semibold text-foreground text-base group-hover:text-primary transition-colors flex items-center gap-1">
                            {report.title}
                            <ArrowUpRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </h3>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {report.description}
                          </p>
                        </div>

                        <div className="flex items-center text-xs font-medium text-primary pt-2 border-t border-border/40">
                          <span>View Detailed Report</span>
                          <ChevronRight className="h-3.5 w-3.5 ml-1 transition-transform group-hover:translate-x-1" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
