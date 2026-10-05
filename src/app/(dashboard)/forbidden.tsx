import Link from "next/link";
import { ShieldAlert } from "lucide-react";

/**
 * Rendered when `forbidden()` is called from the dashboard layout, i.e. when a
 * user opens a URL for a section their role is not allowed to see. The response
 * status is 403.
 */
export default function Forbidden() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
        <ShieldAlert className="h-8 w-8" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          You don&apos;t have access to this page
        </h1>
        <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
          Your role does not include this section, so it is not shown in your menu and
          cannot be opened directly. Ask an administrator to grant it from Settings →
          Roles &amp; Permissions.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}