"use client";

import React from "react";
import { useHospitalProfile } from "@/components/hospital-profile/hospital-profile-context";

/** Hospital letterhead shared by invoices, receipts, and discharge packets. */
export function HospitalHeader({ className = "", includeGstin = true, compact = false }: { className?: string; includeGstin?: boolean; compact?: boolean }) {
  const hospital = useHospitalProfile();
  if (![hospital.name, hospital.address, hospital.phone, includeGstin ? hospital.gstin : "", hospital.logo].some(Boolean)) return null;

  return (
    <header className={`flex items-center gap-3 border-b ${compact ? "pb-2" : "pb-4"} ${className}`}>
      {hospital?.logo && <img src={hospital.logo} alt="Hospital logo" className={`${compact ? "h-10 w-10" : "h-14 w-14"} object-contain`} />}
      <div className="min-w-0">
        {hospital.name && <h1 className={`${compact ? "text-base" : "text-xl"} font-bold text-slate-900`}>{hospital.name}</h1>}
        {compact ? (
          <p className="flex flex-wrap gap-x-3 text-[10px] text-slate-600">
            {hospital.address && <span>{hospital.address}</span>}
            {hospital.phone && <span>Phone: {hospital.phone}</span>}
            {includeGstin && hospital.gstin && <span>GSTIN: {hospital.gstin}</span>}
          </p>
        ) : <>
          {hospital.address && <p className="text-xs text-slate-600">{hospital.address}</p>}
          <div className="flex flex-wrap gap-x-3 text-xs text-slate-600">
          {hospital.phone && <span>Phone: {hospital.phone}</span>}
          {includeGstin && hospital.gstin && <span>GSTIN: {hospital.gstin}</span>}
          </div>
        </>}
      </div>
    </header>
  );
}
