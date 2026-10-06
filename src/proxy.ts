import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { canAccessPath } from "@/lib/rbac/page-access";

/**
 * Authentication plus page-level authorization.
 *
 * `withAuth` rejects unauthenticated requests before the wrapper runs, so the
 * handler below only ever sees a valid session. Hiding a menu entry is not
 * access control: without this check any signed-in user could navigate
 * straight to /admin/users or /finance/invoices and render the page. The API
 * guard already blocks the underlying data; this stops the page itself.
 *
 * Next 16 runs Proxy on the Node.js runtime, which is what lets it read the
 * live Role document instead of a possibly stale JWT.
 */
export default withAuth(
    function proxy(request) {
        const { pathname, search } = request.nextUrl;

        return canAccessPath(
            pathname,
            request.nextauth.token?.role as string | undefined,
            (request.nextauth.token?.roleName as string | undefined) ?? null
        ).then((allowed) => {
            if (allowed) return NextResponse.next();

            const url = request.nextUrl.clone();
            url.pathname = "/unauthorized";
            url.search = `?from=${encodeURIComponent(pathname)}${search}`;
            return NextResponse.redirect(url);
        });
    },
    {
        pages: {
            signIn: "/login",
        },
    }
);

export const config = {
    matcher: ["/((?!api/auth|login|unauthorized|_next/static|_next/image|favicon.ico).*)"],
};