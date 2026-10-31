import React from "react";

interface FieldIfPresentProps {
  label: string;
  value?: string | number | null;
  className?: string;
  valueClassName?: string;
  allowNotRecorded?: boolean;
}

export function FieldIfPresent({
  label,
  value,
  className = "",
  valueClassName = "",
  allowNotRecorded = false,
}: FieldIfPresentProps) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text || (!allowNotRecorded && /^(not recorded|not provided)$/i.test(text))) return null;

  return (
    <div className={className}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 whitespace-pre-wrap text-sm text-slate-900 dark:text-slate-100 ${valueClassName}`}>
        {text}
      </p>
    </div>
  );
}
