"use client";

import * as React from "react";
import { AlertTriangle, Lock, LogIn } from "lucide-react";
import { describeApiError, type AuthFailure } from "@/lib/api-client";

interface ApiErrorNoticeProps {
  error: unknown;
  /** Extra context, e.g. "the doctor list" so the message is specific. */
  context?: string;
  className?: string;
}

/**
 * Renders an explicit 401 / 403 / load-failure state.
 *
 * Without this, a permission failure on a reference-data request (doctor
 * roster, departments, staff) leaves an empty dropdown that looks like valid
 * "no records" data.
 */
export function ApiErrorNotice({ error, context, className }: ApiErrorNoticeProps) {
  const { title, description, authFailure } = describeApiError(error);

  if (!error) return null;

  const Icon = authFailure === "unauthenticated" ? LogIn : authFailure === "forbidden" ? Lock : AlertTriangle;

  const tone =
    authFailure === "forbidden"
      ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100"
      : authFailure === "unauthenticated"
        ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-100"
        : "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${tone} ${className ?? ""}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold">
          {title}
          {context ? ` - could not load ${context}` : ""}
        </p>
        <p className="leading-relaxed">{description}</p>
        {authFailure === "forbidden" ? (
          <p className="text-xs opacity-80">
            Ask an administrator to grant your role the missing permission, or sign in with an account that has it.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Compact variant for replacing a table body when a list request is rejected.
 */
export function ApiErrorEmptyState({ error, context }: ApiErrorNoticeProps) {
  const { title, description, authFailure } = describeApiError(error);

  if (!error) return null;

  const Icon = authFailure === "unauthenticated" ? LogIn : authFailure === "forbidden" ? Lock : AlertTriangle;

  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div
        className={
          authFailure === "forbidden"
            ? "rounded-full bg-amber-100 p-3 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
            : "rounded-full bg-rose-100 p-3 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
        }
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="text-base font-semibold text-slate-900 dark:text-white">
        {title}
        {context ? ` - could not load ${context}` : ""}
      </p>
      <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}

export type { AuthFailure };
