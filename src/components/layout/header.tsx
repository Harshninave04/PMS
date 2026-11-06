"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { Menu as MenuIcon, Building2, Sun, Moon } from "lucide-react";
import { useHospitalProfile } from "@/components/hospital-profile/hospital-profile-context";

interface HeaderProps {
  onMobileToggle: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMobileToggle }) => {
  const { data: session } = useSession();
  const hospital = useHospitalProfile();
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
      {/* Left: Mobile Toggle & Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMobileToggle}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
        >
          <MenuIcon className="h-5 w-5" />
        </button>

        {hospital.name && <div className="hidden sm:flex items-center gap-2">
          <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {hospital.name}
          </span>
        </div>}
      </div>

      {/* Right: Theme & User Profile */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {resolvedTheme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />

        <div className="hidden flex-col text-right sm:flex">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            {session?.user?.name}
          </span>
          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
            {session?.user?.email}
          </span>
        </div>
      </div>
    </header>
  );
};

export default Header;
