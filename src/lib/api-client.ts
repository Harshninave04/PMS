/**
 * Shared browser-side API helper.
 *
 * The RBAC guards answer with real HTTP status codes: 401 when there is no
 * valid session and 403 when the session lacks the permission. Plain
 * `fetch(...).then(r => r.json())` swallows that distinction - the JSON body is
 * `{ success: false }`, which components happily treat as "no data", so an
 * empty dropdown looks like an empty table instead of a permission failure.
 *
 * `apiFetch` preserves the status so callers can render an explicit state.
 */

export type AuthFailure = "unauthenticated" | "forbidden";

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  /** Classifies the failure, or null when it is not an auth failure. */
  get authFailure(): AuthFailure | null {
    if (this.status === 401) return "unauthenticated";
    if (this.status === 403) return "forbidden";
    return null;
  }
}

/**
 * fetch + JSON parse that throws `ApiError` on a non-2xx response.
 */
export async function apiFetch<T = unknown>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      (body as { message?: string } | null)?.message ||
      response.statusText ||
      `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message, body);
  }

  return body as T;
}

/**
 * User-facing copy for a failed request.
 *
 * Reference data loaders (doctor roster, departments, staff) fail this way when
 * the signed-in role is missing the permission or its branch scope, and the
 * message has to say so - otherwise the operator thinks the hospital has no
 * doctors.
 */
export function describeApiError(error: unknown): { title: string; description: string; authFailure: AuthFailure | null } {
  if (error instanceof ApiError) {
    if (error.authFailure === "unauthenticated") {
      return {
        title: "Session expired",
        description: "Your session has expired or you are not signed in. Sign in again to continue.",
        authFailure: "unauthenticated"
      };
    }
    if (error.authFailure === "forbidden") {
      return {
        title: "Access denied",
        description: error.message || "Your role does not have permission to view this list.",
        authFailure: "forbidden"
      };
    }
    return { title: "Could not load data", description: error.message, authFailure: null };
  }

  return {
    title: "Could not load data",
    description: error instanceof Error ? error.message : "An unexpected error occurred.",
    authFailure: null
  };
}
