/**
 * The bridge between the URL and the page guard.
 *
 * A server layout has no `usePathname`, so the middleware copies the path being
 * rendered onto the request and the dashboard layout reads it back here. Only
 * two things are needed for that to work, and they live together so neither
 * side has to import the other:
 *
 *   - `PATHNAME_HEADER`, the header name.
 *   - `canOpenPage`, the actual question: may this set of permissions open this
 *     path?
 *
 * The header is a convenience, never a security boundary. `canOpenPage` only
 * ever makes a decision from permissions that were resolved from the database,
 * and every API route re-checks itself, so forging or omitting the header grants
 * nothing.
 */

export const PATHNAME_HEADER = "x-pathname";

/**
 * True when the permissions are enough to open the page.
 *
 * A missing catalogue entry is denied. New dashboard pages must be deliberately
 * added to the permission catalogue before a non-Super-Admin can open them.
 */
export function canOpenPage(
  required: readonly string[],
  permissions: { isSuperAdmin?: boolean; all: ReadonlySet<string> },
  explicitlyPublic = false
): boolean {
  if (permissions.isSuperAdmin) return true;
  if (explicitlyPublic) return true;
  if (!required.length) return false;
  return required.some((permission) => permissions.all.has(permission.toLowerCase()));
}
