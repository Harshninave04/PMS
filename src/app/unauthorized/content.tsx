"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ShieldAlert, ArrowLeft, Home } from "lucide-react";

export default function UnauthorizedContent() {
    const searchParams = useSearchParams();
    const attempted = searchParams.get("from");

    return (
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <ShieldAlert className="h-6 w-6 text-destructive" aria-hidden="true" />
            </div>

            <h1 className="text-lg font-semibold text-card-foreground">Access denied</h1>

            <p className="mt-2 text-sm text-muted-foreground">
                Your role does not have permission to view this page. If you believe you need
                access, ask an administrator to update your role.
            </p>

            {attempted ? (
                <p className="mt-3 break-all rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
                    {attempted}
                </p>
            ) : null}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Link
                    href="/dashboard/main"
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                    <Home className="h-4 w-4" aria-hidden="true" />
                    Go to dashboard
                </Link>

                <button
                    type="button"
                    onClick={() => window.history.back()}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Go back
                </button>
            </div>
        </div>
    );
}