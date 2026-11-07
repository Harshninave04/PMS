"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import DynamicIcon from "./dynamic-icon";
import { useHospitalProfile } from "@/components/hospital-profile/hospital-profile-context";
import { PERMISSIONS_UPDATED_EVENT } from "@/components/permissions/permission-context";
import { ChevronDown, ChevronRight, Circle, LogOut, Shield } from "lucide-react";

interface MenuItem {
  _id: string;
  name: string;
  path: string;
  icon?: string;
  children?: MenuItem[];
}

interface SidebarProps {
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, setMobileOpen }) => {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const hospital = useHospitalProfile();

  useEffect(() => {
    async function fetchMenus() {
      try {
        const res = await fetch("/api/menu", { cache: "no-store" });
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          // Filter out items that are children of other menus to avoid duplicating top-level renders
          const childIds = new Set<string>();
          json.data.forEach((m: MenuItem) => {
            if (m.children && Array.isArray(m.children)) {
              m.children.forEach((c: MenuItem | string) => {
                if (typeof c === "object" && c && c._id) {
                  childIds.add(c._id.toString());
                } else if (typeof c === "string") {
                  childIds.add(c);
                }
              });
            }
          });
          const topLevel = json.data.filter((m: MenuItem) => {
            if (childIds.has(m._id.toString())) return false;
            return true;
          });
          setMenus(topLevel);

          // Auto-expand menu that matches current pathname
          const initialExpanded: Record<string, boolean> = {};
          topLevel.forEach((m: MenuItem) => {
            if (
              (m.path && m.path !== "/" && pathname.startsWith(m.path)) ||
              (m.children && m.children.some((c: MenuItem) => c.path && (pathname === c.path || pathname.startsWith(c.path))))
            ) {
              initialExpanded[m._id] = true;
            }
          });
          setExpandedItems((prev) => ({ ...initialExpanded, ...prev }));
        }
      } catch (err) {
        console.error("Failed to fetch menus:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchMenus();
    window.addEventListener(PERMISSIONS_UPDATED_EVENT, fetchMenus);
    return () => window.removeEventListener(PERMISSIONS_UPDATED_EVENT, fetchMenus);
  }, [pathname]);


  const isDoctor = session?.user?.roleName?.toUpperCase() === "DOCTOR";
  const isPharmacist = session?.user?.roleName?.toUpperCase() === "PHARMACIST";
  const isDashboardHome = pathname === "/dashboard" || pathname === "/dashboard/main";
  const showBottomLogout = isPharmacist || isDashboardHome;
  const hiddenDoctorMenus = new Set(["Dashboard", "Today's Completed Patients"]);
  const filteredMenus = isDoctor
    ? menus.filter((menu) => !hiddenDoctorMenus.has(menu.name))
    : menus;
  const pharmacyOrder = ["Dashboard", "Prescriptions", "Dispense Medicines", "Medicines", "Categories"];
  const pharmacyIcons: Record<string, string> = {
    Dashboard: "House",
    Prescriptions: "FileText",
    "Dispense Medicines": "Pill",
    Medicines: "BriefcaseMedical",
    Categories: "Layers3",
  };
  const displayMenus = isPharmacist
    ? pharmacyOrder.flatMap((name) => {
        if (name === "Dashboard") {
          const dashboard = menus.find((menu) => menu.name === name);
          const destination = dashboard?.children?.find((child) => child.name === name) ?? dashboard;
          return destination ? [{ ...destination, name, children: undefined, icon: pharmacyIcons[name] }] : [];
        }
        const destination = menus.flatMap((menu) => menu.children ?? []).find((child) => child.name === name);
        return destination ? [{ ...destination, icon: pharmacyIcons[name], children: undefined }] : [];
      })
    : filteredMenus;

  // Home is active while the dashboard page is open. The real route is
  // /dashboard/main (the role-aware reception dashboard); "/dashboard" is
  // treated as the same destination.
  const isLeafActive = (path?: string) =>
    Boolean(path && (pathname === path || (path === "/dashboard/main" && pathname === "/dashboard")));

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen?.(false)}
        />
      )}

      <aside
        className={cn(
          "fixed top-0 bottom-0 left-0 z-50 flex w-[min(15rem,85vw)] flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 transition-transform duration-300 ease-in-out lg:static lg:h-full lg:translate-x-0",
          isPharmacist ? "lg:w-60" : "lg:w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Sidebar Header Brand */}
        <div className={cn("flex shrink-0 items-center gap-3 border-b border-slate-200 dark:border-slate-800/80", isPharmacist ? "h-[3.75rem] px-3" : "h-16 px-6")}>
          {hospital.logo ? (
            <img
              src={hospital.logo}
              alt={hospital.name || ""}
              className="h-9 w-9 rounded-xl object-contain border border-slate-200 dark:border-slate-700 bg-white p-0.5"
            />
          ) : null}
          {hospital.name && <div className="flex flex-col">
            <span className={cn("font-bold tracking-tight text-slate-900 dark:text-white", isPharmacist ? "text-sm" : "text-base")}>
              {hospital.name}
            </span>
          </div>}
        </div>

        {/* Navigation Menu List */}
        <div className={cn("min-h-0 flex-1 overflow-y-auto scrollbar-slim px-3", isPharmacist ? "py-3" : "py-4", "space-y-1")}>
          <div className={cn("font-semibold uppercase text-slate-500 dark:text-slate-400", isPharmacist ? "px-2 pb-3 text-[10px] tracking-wide" : "px-3 pb-2 text-[11px] tracking-wider")}>
            Navigation Menu
          </div>

          <div className={cn(isPharmacist && "space-y-1")}>
          {loading ? (
            <div className={cn("px-3 py-2", isPharmacist ? "space-y-1" : "space-y-2")}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-9 w-full rounded-lg bg-slate-800/50 animate-pulse" />
              ))}
            </div>
          ) : (
            displayMenus.map((menu) => {
              const hasChildren = menu.children && menu.children.length > 0;
              const isExpanded = expandedItems[menu._id];
              const isActive = pathname === menu.path || (hasChildren && menu.children?.some(c => pathname === c.path));

              return (
                <div key={menu._id} className="space-y-1">
                  {hasChildren ? (
                    <button
                      onClick={() => toggleExpand(menu._id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white",
                        isActive ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20" : "text-slate-600 dark:text-slate-300"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <DynamicIcon name={menu.icon || "Folder"} className={cn("h-4 w-4", isActive ? "text-emerald-400" : "text-slate-400")} />
                        <span>{menu.name}</span>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      )}
                    </button>
                  ) : (
                    <Link
                      href={menu.path || "#"}
                      onClick={() => setMobileOpen?.(false)}
                      className={cn(
                        cn("flex items-center gap-3 rounded-lg font-medium transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white", isPharmacist ? "min-h-9 gap-2 px-2.5 py-1 text-[13px]" : "px-3 py-2 text-sm"),
                        isLeafActive(menu.path) ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20" : "text-slate-600 dark:text-slate-300"
                      )}
                    >
                      <DynamicIcon name={menu.icon || "Circle"} className={cn("h-4 w-4 shrink-0", isLeafActive(menu.path) ? "text-white" : "text-slate-400")} />
                      <span>{menu.name}</span>
                    </Link>
                  )}

                  {/* Submenu Accordion */}
                  {hasChildren && isExpanded && (
                    <div className="ml-4 pl-3 border-l border-slate-800 space-y-1 py-1">
                      {menu.children?.map((child: MenuItem) => {
                        const childActive = pathname === child.path;
                        return (
                          <Link
                            key={child._id}
                            href={child.path || "#"}
                            onClick={() => setMobileOpen?.(false)}
                            className={cn(
                              "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:text-slate-900 dark:hover:text-white",
                              childActive
                                ? "bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 font-semibold"
                                : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                            )}
                          >
                            <DynamicIcon name={child.icon || "Circle"} className="h-3.5 w-3.5 opacity-80" />
                            <span>{child.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
          </div>
        </div>

        {/* User Profile & Footer Section */}
        <div className={cn("shrink-0 border-t border-slate-200 bg-slate-50 dark:border-slate-800/80 dark:bg-slate-950/40", isPharmacist ? "p-2" : "p-3")}>
          <div className={cn("flex items-center justify-between rounded-xl border border-slate-100 bg-white shadow-sm dark:border-transparent dark:bg-slate-800/60 dark:shadow-none", isPharmacist ? "p-2.5" : "p-3")}>
            <div className="flex items-center gap-3 overflow-hidden">
              <div className={cn("flex shrink-0 items-center justify-center rounded-full bg-emerald-600 font-bold text-white", isPharmacist ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm")}>
                {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : "U"}
              </div>
              <div className="flex flex-col truncate">
                <span className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                  {session?.user?.name || "User"}
                </span>
                <span className="flex items-center gap-1 truncate text-[10px] text-emerald-600 dark:text-emerald-400">
                  {isPharmacist ? <Circle className="h-2.5 w-2.5" /> : <Shield className="h-3 w-3" />}
                  {session?.user?.roleName?.replace(/_/g, " ") || "Staff"}
                </span>
              </div>
            </div>
            {!showBottomLogout && (
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                title="Sign Out"
                className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
          {showBottomLogout && (
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
