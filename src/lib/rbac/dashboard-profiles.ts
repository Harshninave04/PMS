import {
  Bed,
  Calendar,
  CalendarCheck,
  CalendarPlus,
  ClipboardList,
  FilePlus,
  FileText,
  HeartPulse,
  Package,
  Pill,
  PlusCircle,
  Receipt,
  Stethoscope,
  UserPlus,
  Users,
  Wallet
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Metric keys returned by GET /api/dashboard/stats */
export type DashboardMetricKey =
  | "totalPatients"
  | "totalDoctors"
  | "totalAppointments"
  | "todayAppointments"
  | "occupiedBeds"
  | "totalBeds";

export type DashboardStat =
  | {
      kind: "metric";
      metric: DashboardMetricKey;
      title: string;
      hint: string;
      icon: LucideIcon;
      color: string;
    }
  | {
      kind: "composite";
      title: string;
      hint: string;
      icon: LucideIcon;
      color: string;
      left: DashboardMetricKey;
      right: DashboardMetricKey;
      leftSuffix?: string;
      rightPrefix?: string;
    };

export interface DashboardQuickAction {
  title: string;
  href: string;
  icon: LucideIcon;
  color: string;
}

export interface DashboardProfile {
  key: string;
  /** Human label for the role, rendered as the dashboard badge */
  label: string;
  /** Role-aware welcome line */
  subtitle: string;
  /** Deep link to the role's own operational module */
  moduleDashboard: string | null;
  stats: DashboardStat[];
  quickActions: DashboardQuickAction[];
  showRecentPatients: boolean;
}

const TONE = {
  emerald: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
  teal: "text-teal-600 bg-teal-500/10 border-teal-500/20",
  cyan: "text-cyan-600 bg-cyan-500/10 border-cyan-500/20",
  indigo: "text-indigo-600 bg-indigo-500/10 border-indigo-500/20",
  violet: "text-violet-600 bg-violet-500/10 border-violet-500/20",
  amber: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  rose: "text-rose-600 bg-rose-500/10 border-rose-500/20",
  sky: "text-sky-600 bg-sky-500/10 border-sky-500/20"
} as const;

const ACTION = {
  emerald: "bg-emerald-600 hover:bg-emerald-700 text-white",
  teal: "bg-teal-600 hover:bg-teal-700 text-white",
  cyan: "bg-cyan-600 hover:bg-cyan-700 text-white",
  indigo: "bg-indigo-600 hover:bg-indigo-700 text-white",
  violet: "bg-violet-600 hover:bg-violet-700 text-white",
  amber: "bg-amber-500 hover:bg-amber-600 text-white",
  rose: "bg-rose-600 hover:bg-rose-700 text-white",
  sky: "bg-sky-600 hover:bg-sky-700 text-white",
  slate: "bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-700 dark:hover:bg-slate-600"
} as const;

const metric = (
  metricKey: DashboardMetricKey,
  title: string,
  hint: string,
  icon: LucideIcon,
  color: string
): DashboardStat => ({ kind: "metric", metric: metricKey, title, hint, icon, color });

const bedOccupancy = (color: string): DashboardStat => ({
  kind: "composite",
  title: "Bed Occupancy",
  hint: "Occupied against total beds",
  icon: Bed,
  color,
  left: "occupiedBeds",
  right: "totalBeds",
  rightPrefix: " / "
});

const profiles: Record<string, DashboardProfile> = {
  administration: {
    key: "administration",
    label: "Administration",
    subtitle: "Today's overview of the whole hospital.",
    moduleDashboard: "/reports",
    stats: [
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.emerald),
      metric("totalDoctors", "Active Doctors", "Registered in system", Stethoscope, TONE.teal),
      metric("todayAppointments", "Appointments Today", "Scheduled for today", CalendarCheck, TONE.cyan),
      bedOccupancy(TONE.indigo)
    ],
    quickActions: [
      { title: "Register Patient", href: "/patients/register", icon: UserPlus, color: ACTION.emerald },
      { title: "Book Appointment", href: "/appointments/book", icon: CalendarPlus, color: ACTION.teal },
      { title: "New Admission", href: "/admissions/new", icon: PlusCircle, color: ACTION.cyan },
      { title: "Create Bill", href: "/finance/invoice/create", icon: FilePlus, color: ACTION.slate }
    ],
    showRecentPatients: true
  },

  clinical: {
    key: "clinical",
    label: "Doctor",
    subtitle: "Your OPD patients, consultations and prescriptions for today.",
    moduleDashboard: "/appointments/queue",
    stats: [
      metric("todayAppointments", "Today's Appointments", "Your OPD patients today", CalendarCheck, TONE.emerald),
      metric("totalAppointments", "Total Appointments", "All your consultations", Calendar, TONE.teal),
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.cyan),
      bedOccupancy(TONE.rose)
    ],
    quickActions: [
      { title: "Today's Queue", href: "/appointments/queue", icon: ClipboardList, color: ACTION.emerald },
      { title: "Consultations", href: "/clinical/consultations", icon: Stethoscope, color: ACTION.teal },
      { title: "Prescriptions", href: "/clinical/prescriptions", icon: FileText, color: ACTION.cyan },
      { title: "Admitted Patients", href: "/admissions/current", icon: Bed, color: ACTION.slate }
    ],
    showRecentPatients: true
  },

  nursing: {
    key: "nursing",
    label: "Nursing Station",
    subtitle: "Admitted patients, vitals and medication rounds.",
    moduleDashboard: "/nursing",
    stats: [
      bedOccupancy(TONE.emerald),
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.teal),
      metric("todayAppointments", "Today's Appointments", "Scheduled today", CalendarCheck, TONE.cyan),
      metric("totalDoctors", "Doctors", "On the roster", Stethoscope, TONE.violet)
    ],
    quickActions: [
      { title: "Record Vitals", href: "/nursing/vitals", icon: HeartPulse, color: ACTION.emerald },
      { title: "Admitted Patients", href: "/nursing/patients", icon: Users, color: ACTION.teal },
      { title: "Medication Rounds", href: "/nursing/medications", icon: Pill, color: ACTION.cyan },
      { title: "Nursing Notes", href: "/nursing/notes", icon: ClipboardList, color: ACTION.slate }
    ],
    showRecentPatients: true
  },

  frontDesk: {
    key: "frontDesk",
    label: "Reception",
    subtitle: "Registrations, OPD bookings and admissions.",
    moduleDashboard: null,
    stats: [
      metric("todayAppointments", "Appointments Today", "Booked for today", CalendarCheck, TONE.emerald),
      metric("totalAppointments", "Total Appointments", "All recorded bookings", Calendar, TONE.teal),
      metric("totalPatients", "Total Patients", "All time registrations", Users, TONE.cyan),
      bedOccupancy(TONE.violet)
    ],
    quickActions: [
      { title: "Register Patient", href: "/patients/register", icon: UserPlus, color: ACTION.emerald },
      { title: "Book Appointment", href: "/appointments/book", icon: CalendarPlus, color: ACTION.teal },
      { title: "New Admission", href: "/admissions/new", icon: PlusCircle, color: ACTION.cyan },
      { title: "Today's Queue", href: "/appointments/queue", icon: ClipboardList, color: ACTION.slate }
    ],
    showRecentPatients: true
  },

  pharmacy: {
    key: "pharmacy",
    label: "Pharmacy",
    subtitle: "Prescriptions to dispense and medicine stock.",
    moduleDashboard: "/pharmacy",
    stats: [
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.emerald),
      metric("todayAppointments", "OPD Today", "Patients seen today", CalendarCheck, TONE.teal),
      metric("totalDoctors", "Doctors", "Prescribing doctors", Stethoscope, TONE.cyan),
      bedOccupancy(TONE.violet)
    ],
    quickActions: [
      { title: "Dispense Medicines", href: "/pharmacy/dispensing", icon: Pill, color: ACTION.emerald },
      { title: "Prescriptions", href: "/pharmacy/prescriptions", icon: ClipboardList, color: ACTION.teal },
      { title: "Stock", href: "/pharmacy/stock", icon: Package, color: ACTION.cyan },
      { title: "Expiry", href: "/pharmacy/expiry", icon: Calendar, color: ACTION.slate }
    ],
    showRecentPatients: false
  },

  finance: {
    key: "finance",
    label: "Billing & Accounts",
    subtitle: "Bills, collections and outstanding dues.",
    moduleDashboard: "/finance",
    stats: [
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.emerald),
      metric("todayAppointments", "OPD Today", "Visits to bill today", CalendarCheck, TONE.teal),
      bedOccupancy(TONE.cyan),
      metric("totalDoctors", "Doctors", "Consulting doctors", Stethoscope, TONE.violet)
    ],
    quickActions: [
      { title: "Create Bill", href: "/finance/invoice/create", icon: FilePlus, color: ACTION.emerald },
      { title: "Collect Payment", href: "/finance/invoices", icon: Wallet, color: ACTION.teal },
      { title: "Outstanding Dues", href: "/finance/outstanding", icon: Receipt, color: ACTION.cyan },
      { title: "Billing Report", href: "/reports/billing", icon: FileText, color: ACTION.slate }
    ],
    showRecentPatients: false
  },

  /* Fallback for any role without an explicit profile */
  default: {
    key: "default",
    label: "Staff",
    subtitle: "Operational summary for today.",
    moduleDashboard: null,
    stats: [
      metric("todayAppointments", "Appointments Today", "Scheduled today", CalendarCheck, TONE.emerald),
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.teal),
      bedOccupancy(TONE.cyan),
      metric("totalDoctors", "Active Doctors", "Registered in system", Stethoscope, TONE.violet)
    ],
    quickActions: [
      { title: "Patients", href: "/patients/list", icon: Users, color: ACTION.teal },
      { title: "Appointments", href: "/appointments/list", icon: CalendarPlus, color: ACTION.cyan }
    ],
    showRecentPatients: true
  }
};

/** Role name -> dashboard profile key. */
const ROLE_PROFILE_MAP: Record<string, keyof typeof profiles> = {
  ADMIN: "administration",
  DOCTOR: "clinical",
  NURSE: "nursing",
  RECEPTIONIST: "frontDesk",
  PHARMACIST: "pharmacy",
  ACCOUNTANT: "finance"
};

export function resolveDashboardProfile(roleName?: string | null): DashboardProfile {
  if (!roleName) return profiles.default;
  const key = ROLE_PROFILE_MAP[roleName];
  return (key && profiles[key]) || profiles.default;
}

export function listRoleProfileAssignments(): { role: string; profile: string }[] {
  return Object.entries(ROLE_PROFILE_MAP).map(([role, key]) => ({ role, profile: key }));
}
