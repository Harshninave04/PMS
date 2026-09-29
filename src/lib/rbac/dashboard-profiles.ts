import {
  Activity,
  ArrowRightLeft,
  BadgeCheck,
  Banknote,
  Bed,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarPlus,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Droplets,
  Eye,
  FilePlus,
  FileText,
  FlaskConical,
  HeartPulse,
  Microscope,
  Package,
  Pill,
  PlusCircle,
  Receipt,
  ScanLine,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Siren,
  Stethoscope,
  TestTube,
  TrendingUp,
  Truck,
  UserCog,
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

const profiles: Record<string, DashboardProfile> = {
  /* ------------------------------------------------------------------ *
   * Administrative / managerial — full operational overview
   * ------------------------------------------------------------------ */
  administration: {
    key: "administration",
    label: "Administration",
    subtitle: "Institution-wide operational overview across every department.",
    moduleDashboard: "/wards/dashboard",
    stats: [
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.emerald),
      metric("totalDoctors", "Active Doctors", "Registered in system", Stethoscope, TONE.teal),
      metric("todayAppointments", "Appointments Today", "Scheduled for today", CalendarCheck, TONE.cyan),
      {
        kind: "composite",
        title: "Bed Occupancy",
        hint: "Occupied against total capacity",
        icon: Bed,
        color: TONE.indigo,
        left: "occupiedBeds",
        right: "totalBeds",
        rightPrefix: " / "
      }
    ],
    quickActions: [
      { title: "Add New Patient", href: "/patients/register", icon: UserPlus, color: ACTION.emerald },
      { title: "Book Appointment", href: "/appointments/book", icon: CalendarPlus, color: ACTION.teal },
      { title: "New Admission", href: "/admissions/new", icon: PlusCircle, color: ACTION.cyan },
      { title: "Create Invoice", href: "/finance/invoice/create", icon: FilePlus, color: ACTION.slate }
    ],
    showRecentPatients: true
  },

  itAdministration: {
    key: "itAdministration",
    label: "System Administration",
    subtitle: "Platform configuration, users and system health.",
    moduleDashboard: null,
    stats: [
      metric("totalDoctors", "Clinical Accounts", "Doctors and staff logins", UserCog, TONE.teal),
      metric("totalAppointments", "Total Transactions", "Recorded system wide", Activity, TONE.cyan),
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.indigo),
      metric("todayAppointments", "Activity Today", "Events recorded today", TrendingUp, TONE.amber)
    ],
    quickActions: [
      { title: "User Accounts", href: "/admin/users", icon: UserCog, color: ACTION.emerald },
      { title: "Roles & Permissions", href: "/admin/roles", icon: ShieldCheck, color: ACTION.teal },
      { title: "System Settings", href: "/config/general", icon: Settings, color: ACTION.cyan },
      { title: "Audit Logs", href: "/audit/logs", icon: ScrollText, color: ACTION.slate }
    ],
    showRecentPatients: false
  },

  /* ------------------------------------------------------------------ *
   * Read-only oversight
   * ------------------------------------------------------------------ */
  audit: {
    key: "audit",
    label: "Compliance & Audit",
    subtitle: "Read-only oversight. No record-modifying actions are surfaced here.",
    moduleDashboard: null,
    stats: [
      metric("totalPatients", "Total Patients", "Records in scope", Users, TONE.emerald),
      metric("totalDoctors", "Clinical Staff", "Accounts in scope", Stethoscope, TONE.teal),
      metric("totalAppointments", "Total Appointments", "Historical volume", Calendar, TONE.cyan),
      metric("todayAppointments", "Activity Today", "Events recorded today", TrendingUp, TONE.amber)
    ],
    quickActions: [
      { title: "Audit Logs", href: "/audit/logs", icon: ScrollText, color: ACTION.emerald },
      { title: "User Access Review", href: "/audit/access", icon: Eye, color: ACTION.teal },
      { title: "Audit Reports", href: "/audit/reports", icon: FileText, color: ACTION.cyan },
      { title: "Security Events", href: "/audit/security", icon: ShieldCheck, color: ACTION.slate }
    ],
    showRecentPatients: false
  },

  /* ------------------------------------------------------------------ *
   * Clinical
   * ------------------------------------------------------------------ */
  clinical: {
    key: "clinical",
    label: "Clinical Practice",
    subtitle: "Your consultation list, orders and prescriptions for today.",
    moduleDashboard: "/clinical/dashboard",
    stats: [
      metric("todayAppointments", "Today's Appointments", "Your scheduled consultations", CalendarCheck, TONE.emerald),
      metric("totalAppointments", "Total Appointments", "All recorded consultations", Calendar, TONE.teal),
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.cyan),
      {
        kind: "composite",
        title: "Bed Occupancy",
        hint: "Occupied against total capacity",
        icon: Bed,
        color: TONE.rose,
        left: "occupiedBeds",
        right: "totalBeds",
        rightPrefix: " / "
      }
    ],
    quickActions: [
      { title: "Consultations", href: "/clinical/consultations", icon: Stethoscope, color: ACTION.emerald },
      { title: "Clinical Notes", href: "/clinical/notes", icon: ClipboardList, color: ACTION.teal },
      { title: "Prescriptions", href: "/clinical/prescriptions", icon: FileText, color: ACTION.cyan },
      { title: "Lab & Imaging Orders", href: "/clinical/orders", icon: TestTube, color: ACTION.slate }
    ],
    showRecentPatients: true
  },

  nursing: {
    key: "nursing",
    label: "Nursing Station",
    subtitle: "Ward workload, vitals capture and pending care tasks.",
    moduleDashboard: "/nursing/dashboard",
    stats: [
      {
        kind: "composite",
        title: "Bed Occupancy",
        hint: "Occupied against total capacity",
        icon: Bed,
        color: TONE.emerald,
        left: "occupiedBeds",
        right: "totalBeds",
        rightPrefix: " / "
      },
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.teal),
      metric("todayAppointments", "Today's Appointments", "Scheduled today", CalendarCheck, TONE.cyan),
      metric("totalDoctors", "Attending Doctors", "On the roster", Stethoscope, TONE.violet)
    ],
    quickActions: [
      { title: "Record Vitals", href: "/nursing/vitals", icon: HeartPulse, color: ACTION.emerald },
      { title: "My Patients", href: "/nursing/patients", icon: Users, color: ACTION.teal },
      { title: "Care Tasks", href: "/nursing/tasks", icon: ClipboardCheck, color: ACTION.cyan },
      { title: "Shift Handover", href: "/nursing/handover", icon: ClipboardList, color: ACTION.slate }
    ],
    showRecentPatients: true
  },

  /* ------------------------------------------------------------------ *
   * Diagnostics
   * ------------------------------------------------------------------ */
  laboratory: {
    key: "laboratory",
    label: "Laboratory",
    subtitle: "Sample workload, pending results and verification queue.",
    moduleDashboard: "/lab/dashboard",
    stats: [
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.emerald),
      metric("todayAppointments", "Orders Today", "Investigations requested today", FlaskConical, TONE.teal),
      metric("totalAppointments", "Total Orders", "Historical order volume", ClipboardList, TONE.cyan),
      {
        kind: "composite",
        title: "Bed Occupancy",
        hint: "Occupied against total capacity",
        icon: Bed,
        color: TONE.violet,
        left: "occupiedBeds",
        right: "totalBeds",
        rightPrefix: " / "
      }
    ],
    quickActions: [
      { title: "Worklist", href: "/lab/worklist", icon: ClipboardList, color: ACTION.emerald },
      { title: "Sample Collection", href: "/lab/collection", icon: TestTube, color: ACTION.teal },
      { title: "Enter Results", href: "/lab/results", icon: Microscope, color: ACTION.cyan },
      { title: "Verify & Publish", href: "/lab/verify", icon: BadgeCheck, color: ACTION.slate }
    ],
    showRecentPatients: false
  },

  radiology: {
    key: "radiology",
    label: "Radiology & Imaging",
    subtitle: "Imaging schedule, worklist and reporting queue.",
    moduleDashboard: "/radiology/dashboard",
    stats: [
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.emerald),
      metric("todayAppointments", "Studies Today", "Studies scheduled today", ScanLine, TONE.teal),
      metric("totalAppointments", "Total Studies", "Historical study volume", Activity, TONE.cyan),
      {
        kind: "composite",
        title: "Bed Occupancy",
        hint: "Occupied against total capacity",
        icon: Bed,
        color: TONE.violet,
        left: "occupiedBeds",
        right: "totalBeds",
        rightPrefix: " / "
      }
    ],
    quickActions: [
      { title: "Imaging Worklist", href: "/radiology/worklist", icon: ClipboardList, color: ACTION.emerald },
      { title: "Perform Studies", href: "/radiology/studies", icon: ScanLine, color: ACTION.teal },
      { title: "Write Reports", href: "/radiology/imaging-reports", icon: FileText, color: ACTION.cyan },
      { title: "Verify Reports", href: "/radiology/verify", icon: BadgeCheck, color: ACTION.slate }
    ],
    showRecentPatients: false
  },

  /* ------------------------------------------------------------------ *
   * Pharmacy / supply chain
   * ------------------------------------------------------------------ */
  pharmacy: {
    key: "pharmacy",
    label: "Pharmacy",
    subtitle: "Dispensing queue, prescription volume and stock position.",
    moduleDashboard: "/pharmacy/dashboard",
    stats: [
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.emerald),
      metric("todayAppointments", "Dispenses Today", "Medicines issued today", Pill, TONE.teal),
      metric("totalAppointments", "Total Prescriptions", "Historical prescription volume", ClipboardList, TONE.cyan),
      {
        kind: "composite",
        title: "Bed Occupancy",
        hint: "Occupied against total capacity",
        icon: Bed,
        color: TONE.violet,
        left: "occupiedBeds",
        right: "totalBeds",
        rightPrefix: " / "
      }
    ],
    quickActions: [
      { title: "Dispensing Queue", href: "/pharmacy/dispensing", icon: Pill, color: ACTION.emerald },
      { title: "Prescriptions", href: "/pharmacy/prescriptions", icon: ClipboardList, color: ACTION.teal },
      { title: "Stock & Returns", href: "/pharmacy/stock", icon: Package, color: ACTION.cyan },
      { title: "Expiry Tracking", href: "/pharmacy/expiry", icon: Calendar, color: ACTION.slate }
    ],
    showRecentPatients: false
  },

  inventory: {
    key: "inventory",
    label: "Inventory & Stores",
    subtitle: "Stock levels, movement and replenishment status.",
    moduleDashboard: "/inventory/dashboard",
    stats: [
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.emerald),
      metric("todayAppointments", "Movements Today", "Issues and receipts today", ArrowRightLeft, TONE.teal),
      metric("totalAppointments", "Total Movements", "Historical stock movement", Package, TONE.cyan),
      {
        kind: "composite",
        title: "Bed Occupancy",
        hint: "Occupied against total capacity",
        icon: Bed,
        color: TONE.violet,
        left: "occupiedBeds",
        right: "totalBeds",
        rightPrefix: " / "
      }
    ],
    quickActions: [
      { title: "Receive Stock", href: "/inventory/stock-in", icon: Package, color: ACTION.emerald },
      { title: "Issue Stock", href: "/inventory/stock-out", icon: ArrowRightLeft, color: ACTION.teal },
      { title: "Stock Transfer", href: "/inventory/transfer", icon: Truck, color: ACTION.cyan },
      { title: "Low Stock Alerts", href: "/inventory/low-stock", icon: ShoppingCart, color: ACTION.slate }
    ],
    showRecentPatients: false
  },

  procurement: {
    key: "procurement",
    label: "Procurement",
    subtitle: "Requisition pipeline, purchase orders and supplier activity.",
    moduleDashboard: "/procurement/dashboard",
    stats: [
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.emerald),
      metric("todayAppointments", "Requests Today", "Requisitions raised today", ShoppingCart, TONE.teal),
      metric("totalAppointments", "Total Orders", "Historical purchase volume", ClipboardList, TONE.cyan),
      metric("totalDoctors", "Active Suppliers", "Approved vendor list", Building2, TONE.violet)
    ],
    quickActions: [
      { title: "Raise Request", href: "/procurement/requests", icon: ShoppingCart, color: ACTION.emerald },
      { title: "Purchase Orders", href: "/procurement/orders", icon: ClipboardList, color: ACTION.teal },
      { title: "Goods Receipt", href: "/procurement/receipt", icon: Package, color: ACTION.cyan },
      { title: "Suppliers", href: "/procurement/suppliers", icon: Building2, color: ACTION.slate }
    ],
    showRecentPatients: false
  },

  /* ------------------------------------------------------------------ *
   * Front desk / finance
   * ------------------------------------------------------------------ */
  frontDesk: {
    key: "frontDesk",
    label: "Front Desk",
    subtitle: "Registration desk throughput, queue and bookings.",
    moduleDashboard: null,
    stats: [
      metric("todayAppointments", "Appointments Today", "Booked for today", CalendarCheck, TONE.emerald),
      metric("totalAppointments", "Total Appointments", "All recorded bookings", Calendar, TONE.teal),
      metric("totalPatients", "Total Patients", "All time registrations", Users, TONE.cyan),
      metric("totalDoctors", "Doctors On Roster", "Available for booking", Stethoscope, TONE.violet)
    ],
    quickActions: [
      { title: "Register Patient", href: "/patients/register", icon: UserPlus, color: ACTION.emerald },
      { title: "Book Appointment", href: "/appointments/book", icon: CalendarPlus, color: ACTION.teal },
      { title: "New Admission", href: "/admissions/new", icon: PlusCircle, color: ACTION.cyan },
      { title: "Waiting Queue", href: "/appointments/queue", icon: ClipboardList, color: ACTION.slate }
    ],
    showRecentPatients: true
  },

  finance: {
    key: "finance",
    label: "Finance & Billing",
    subtitle: "Collections, outstanding balances and invoice volume.",
    moduleDashboard: "/finance/dashboard",
    stats: [
      metric("totalAppointments", "Total Invoices", "Historical invoice volume", Receipt, TONE.emerald),
      metric("todayAppointments", "Transactions Today", "Payments captured today", Banknote, TONE.teal),
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.cyan),
      metric("totalDoctors", "Active Payers", "Billing counterparties", CreditCard, TONE.violet)
    ],
    quickActions: [
      { title: "Create Invoice", href: "/finance/invoice/create", icon: FilePlus, color: ACTION.emerald },
      { title: "Collect Payment", href: "/finance/payments", icon: Wallet, color: ACTION.teal },
      { title: "Outstanding", href: "/finance/outstanding", icon: Receipt, color: ACTION.cyan },
      { title: "Finance Reports", href: "/finance/reports", icon: FileText, color: ACTION.slate }
    ],
    showRecentPatients: false
  },

  /* ------------------------------------------------------------------ *
   * People / ancillary
   * ------------------------------------------------------------------ */
  humanResources: {
    key: "humanResources",
    label: "Human Resources",
    subtitle: "Workforce roster, attendance and leave status.",
    moduleDashboard: null,
    stats: [
      metric("totalDoctors", "Clinical Staff", "Active roster strength", Stethoscope, TONE.emerald),
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.teal),
      metric("todayAppointments", "Attendance Today", "Staff marked present", BadgeCheck, TONE.cyan),
      metric("totalAppointments", "Leave Requests", "Pending and processed", Calendar, TONE.violet)
    ],
    quickActions: [
      { title: "Employee Directory", href: "/hr/employees", icon: Users, color: ACTION.emerald },
      { title: "Attendance", href: "/hr/attendance", icon: BadgeCheck, color: ACTION.teal },
      { title: "Leave Management", href: "/hr/leave", icon: Calendar, color: ACTION.cyan },
      { title: "HR Reports", href: "/hr/reports", icon: FileText, color: ACTION.slate }
    ],
    showRecentPatients: false
  },

  bloodBank: {
    key: "bloodBank",
    label: "Blood Bank",
    subtitle: "Donor registry, screening and issue approvals.",
    moduleDashboard: "/blood-bank/dashboard",
    stats: [
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.rose),
      metric("todayAppointments", "Collections Today", "Units collected today", Droplets, TONE.emerald),
      metric("totalAppointments", "Total Collections", "Historical donation volume", Activity, TONE.cyan),
      {
        kind: "composite",
        title: "Bed Occupancy",
        hint: "Occupied against total capacity",
        icon: Bed,
        color: TONE.amber,
        left: "occupiedBeds",
        right: "totalBeds",
        rightPrefix: " / "
      }
    ],
    quickActions: [
      { title: "Donor Registry", href: "/blood-bank/donors", icon: Droplets, color: ACTION.rose },
      { title: "Collection", href: "/blood-bank/collection", icon: Droplets, color: ACTION.emerald },
      { title: "Cross Matching", href: "/blood-bank/cross-matching", icon: BadgeCheck, color: ACTION.cyan },
      { title: "Issue Approvals", href: "/blood-bank/issue", icon: TestTube, color: ACTION.slate }
    ],
    showRecentPatients: false
  },

  insurance: {
    key: "insurance",
    label: "Insurance & TPA",
    subtitle: "Policy eligibility, pre-authorisation and claim settlement.",
    moduleDashboard: null,
    stats: [
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.emerald),
      metric("totalAppointments", "Total Claims", "Historical claim volume", FileText, TONE.teal),
      metric("todayAppointments", "Claims Today", "Raised for processing today", ClipboardList, TONE.cyan),
      metric("totalDoctors", "Panel Hospitals", "Empanelled providers", Building2, TONE.violet)
    ],
    quickActions: [
      { title: "Policies", href: "/insurance/policies", icon: FileText, color: ACTION.emerald },
      { title: "Pre-Authorisation", href: "/insurance/preauth", icon: ClipboardCheck, color: ACTION.teal },
      { title: "Claims", href: "/insurance/claims", icon: Receipt, color: ACTION.cyan },
      { title: "Settlement", href: "/insurance/settlement", icon: Banknote, color: ACTION.slate }
    ],
    showRecentPatients: false
  },

  emergency: {
    key: "emergency",
    label: "Emergency",
    subtitle: "Triage, casualty queue and time-critical admissions.",
    moduleDashboard: "/emergency/dashboard",
    stats: [
      metric("todayAppointments", "Casualty Today", "Cases registered today", Siren, TONE.rose),
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.emerald),
      {
        kind: "composite",
        title: "Bed Occupancy",
        hint: "Occupied against total capacity",
        icon: Bed,
        color: TONE.amber,
        left: "occupiedBeds",
        right: "totalBeds",
        rightPrefix: " / "
      },
      metric("totalAppointments", "Total Admissions", "Historical emergency volume", Activity, TONE.cyan)
    ],
    quickActions: [
      { title: "Casualty Registration", href: "/emergency/registration", icon: Siren, color: ACTION.rose },
      { title: "Triage", href: "/emergency/triage", icon: Activity, color: ACTION.emerald },
      { title: "Waiting Queue", href: "/emergency/queue", icon: ClipboardList, color: ACTION.cyan },
      { title: "Emergency Admission", href: "/emergency/admission", icon: PlusCircle, color: ACTION.slate }
    ],
    showRecentPatients: true
  },

  operationTheatre: {
    key: "operationTheatre",
    label: "Operation Theatre",
    subtitle: "Surgical schedule, team allocation and peri-op stages.",
    moduleDashboard: "/ot/dashboard",
    stats: [
      metric("todayAppointments", "Surgeries Today", "Procedures scheduled today", CalendarCheck, TONE.emerald),
      metric("totalAppointments", "Total Surgeries", "Historical procedure volume", Activity, TONE.teal),
      {
        kind: "composite",
        title: "Bed Occupancy",
        hint: "Occupied against total capacity",
        icon: Bed,
        color: TONE.indigo,
        left: "occupiedBeds",
        right: "totalBeds",
        rightPrefix: " / "
      },
      metric("totalDoctors", "Surgical Teams", "Allocated OT teams", Stethoscope, TONE.violet)
    ],
    quickActions: [
      { title: "OT Schedule", href: "/ot/schedule", icon: CalendarCheck, color: ACTION.emerald },
      { title: "Book Surgery", href: "/ot/booking", icon: PlusCircle, color: ACTION.teal },
      { title: "Pre-Op Check", href: "/ot/preop", icon: ClipboardCheck, color: ACTION.cyan },
      { title: "Intra-Op Log", href: "/ot/intraop", icon: Activity, color: ACTION.slate }
    ],
    showRecentPatients: true
  },

  wards: {
    key: "wards",
    label: "Ward Administration",
    subtitle: "Bed allocation, occupancy and transfer activity.",
    moduleDashboard: "/wards/dashboard",
    stats: [
      {
        kind: "composite",
        title: "Bed Occupancy",
        hint: "Occupied against total capacity",
        icon: Bed,
        color: TONE.emerald,
        left: "occupiedBeds",
        right: "totalBeds",
        rightPrefix: " / "
      },
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.teal),
      metric("totalDoctors", "Attending Doctors", "On the roster", Stethoscope, TONE.cyan),
      metric("todayAppointments", "Admissions Today", "New admissions today", Activity, TONE.violet)
    ],
    quickActions: [
      { title: "Bed Allocation", href: "/wards/allocate", icon: Bed, color: ACTION.emerald },
      { title: "Bed Availability", href: "/wards/availability", icon: ClipboardList, color: ACTION.teal },
      { title: "Transfer Patient", href: "/wards/transfer", icon: ArrowRightLeft, color: ACTION.cyan },
      { title: "Occupancy Report", href: "/wards/occupancy", icon: FileText, color: ACTION.slate }
    ],
    showRecentPatients: true
  },

  /* Fallback for any role without an explicit profile */
  default: {
    key: "default",
    label: "Staff",
    subtitle: "Operational summary for today.",
    moduleDashboard: "/wards/dashboard",
    stats: [
      metric("todayAppointments", "Appointments Today", "Scheduled today", CalendarCheck, TONE.emerald),
      metric("totalPatients", "Total Patients", "All time total", Users, TONE.teal),
      {
        kind: "composite",
        title: "Bed Occupancy",
        hint: "Occupied against total capacity",
        icon: Bed,
        color: TONE.cyan,
        left: "occupiedBeds",
        right: "totalBeds",
        rightPrefix: " / "
      },
      metric("totalDoctors", "Active Doctors", "Registered in system", Stethoscope, TONE.violet)
    ],
    quickActions: [
      { title: "My Tasks", href: "/dashboard/tasks", icon: ClipboardList, color: ACTION.emerald },
      { title: "Patients", href: "/patients/list", icon: Users, color: ACTION.teal },
      { title: "Appointments", href: "/appointments/list", icon: CalendarPlus, color: ACTION.cyan },
      { title: "Alerts", href: "/dashboard/alerts", icon: Activity, color: ACTION.slate }
    ],
    showRecentPatients: true
  }
};

/**
 * Explicit role name -> profile key map.
 * Every role seeded in src/seed.ts must be listed here, otherwise it falls back
 * to the generic "default" profile.
 */
const ROLE_PROFILE_MAP: Record<string, keyof typeof profiles> = {
  // Platform
  SYSTEM_SUPER_ADMIN: "administration",
  SYSTEM_AUDITOR: "audit",
  SYSTEM_IT_ADMIN: "itAdministration",

  // Organization
  ORGANIZATION_ADMIN: "administration",
  ORGANIZATION_AUDITOR: "audit",

  // Hospital
  HOSPITAL_ADMIN: "administration",
  HOSPITAL_AUDITOR: "audit",

  // Branch
  BRANCH_MANAGER: "wards",

  // Clinical
  DOCTOR: "clinical",
  CONSULTANT: "clinical",
  EMERGENCY_DOCTOR: "emergency",

  // Nursing
  NURSE: "nursing",
  NURSE_MANAGER: "nursing",
  EMERGENCY_NURSE: "emergency",
  OT_NURSE: "operationTheatre",

  // Laboratory
  LAB_TECHNICIAN: "laboratory",
  LAB_SUPERVISOR: "laboratory",

  // Radiology
  RADIOLOGY_TECHNICIAN: "radiology",
  RADIOLOGIST: "radiology",

  // Pharmacy
  PHARMACIST: "pharmacy",
  PHARMACY_MANAGER: "pharmacy",

  // Front desk
  RECEPTIONIST: "frontDesk",
  FRONT_DESK_MANAGER: "frontDesk",

  // Finance
  CASHIER: "finance",
  BILLING_OFFICER: "finance",
  BILLING_MANAGER: "finance",
  FINANCE_MANAGER: "administration",

  // Inventory
  STOREKEEPER: "inventory",
  INVENTORY_MANAGER: "inventory",

  // Procurement
  PROCUREMENT_OFFICER: "procurement",
  PROCUREMENT_MANAGER: "procurement",

  // HR
  HR_OFFICER: "humanResources",
  HR_MANAGER: "humanResources",

  // Emergency
  EMERGENCY_MANAGER: "emergency",

  // Operation theatre
  OT_MANAGER: "operationTheatre",

  // Blood bank
  BLOOD_BANK_TECHNICIAN: "bloodBank",
  BLOOD_BANK_MANAGER: "bloodBank",

  // Insurance
  INSURANCE_OFFICER: "insurance",
  INSURANCE_MANAGER: "insurance"
};

export function resolveDashboardProfile(roleName?: string | null): DashboardProfile {
  if (!roleName) return profiles.default;
  const key = ROLE_PROFILE_MAP[roleName];
  return (key && profiles[key]) || profiles.default;
}

export function listRoleProfileAssignments(): { role: string; profile: string }[] {
  return Object.entries(ROLE_PROFILE_MAP).map(([role, key]) => ({ role, profile: key }));
}
