import { withAuth } from "next-auth/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { PATHNAME_HEADER } from "@/lib/rbac/page-guard";

/**
 * Signs every request in and hands the path being rendered to the dashboard
 * layout, which resolves the caller's role from the database and answers 403 for
 * a page the role may not open. A server layout has no `usePathname`, so the real
 * URL is copied onto the request here — the one place that sees it before the
 * render. The header name and the guard live in `lib/rbac/page-guard` so the
 * layout never has to import this file.
 *
 * The header is a convenience, never a security boundary. Everything that
 * matters is re-checked against the database in the layout and in every API
 * route, so forging or omitting the header grants nothing.
 */

/** Lets the request through with the pathname attached. */
function withPathname(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export default withAuth(withPathname as never, {
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};