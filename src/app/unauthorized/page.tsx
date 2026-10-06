import React, { Suspense } from "react";
import { ShieldAlert } from "lucide-react";
import UnauthorizedContent from "./content";

/**
 * Shown when a signed-in user opens a URL outside their role's modules.
 * The sidebar already hides these panels; this is the server-side backstop.
 *
 * The attempted path arrives as a query parameter, so the interactive part
 * lives in a Suspense boundary to keep the page statically prerenderable.
 */
export default function UnauthorizedPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
            <Suspense
                fallback={
                    <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                            <ShieldAlert className="h-6 w-6 text-destructive" aria-hidden="true" />
                        </div>
                        <h1 className="text-lg font-semibold text-card-foreground">Access denied</h1>
                    </div>
                }
            >
                <UnauthorizedContent />
            </Suspense>
        </div>
    );
}