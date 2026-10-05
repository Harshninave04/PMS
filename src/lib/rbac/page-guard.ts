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
 * An empty requirement means no catalogue entry guards the path, and the page
 * renders — an unknown route is not evidence of a locked page, and locking
 * everything unlisted would lock out pages nobody has thought about yet.
 */
export function canOpenPage(
  required: readonly string[],
  permissions: { isSuperAdmin?: boolean; all: ReadonlySet<string> }
): boolean {
  if (!required.length) return true;
  if (permissions.isSuperAdmin) return true;
  return required.some((permission) => permissions.all.has(permission.toLowerCase()));
}