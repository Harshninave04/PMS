import { Types } from "mongoose";

/**
 * Sentinel ObjectId emitted by ScopeResolver whenever a grant cannot be
 * satisfied for the current actor (e.g. BRANCH scope but no branch assigned,
 * WARD scope but no wards assigned, OWN scope but no doctor profile).
 *
 * It is a syntactically valid but practically non-existent _id, so a Mongo
 * query carrying it matches zero documents. Controllers MUST treat it as a
 * hard deny instead of dropping it from the query, otherwise an unassignable
 * scope silently degrades into "return everything".
 */
export const DENY_ALL_OBJECT_ID = "000000000000000000000000";

const DENY_ALL_SENTINEL = new Types.ObjectId(DENY_ALL_OBJECT_ID).toString();

function isDenyAllSentinel(value: unknown): boolean {
  return value instanceof Types.ObjectId && value.toString() === DENY_ALL_SENTINEL;
}

/**
 * Detects the deny-all sentinel anywhere inside a scope filter, including
 * inside `$and` / `$or` combinators produced by ScopeResolver.combineFilters.
 *
 * A filter is considered deny-all when any `_id` constraint is pinned to the
 * sentinel ObjectId. Query operators such as `$in` are intentionally not
 * treated as a deny, because a legitimate caller may legitimately narrow a
 * list down to a specific set of ids.
 */
export function isDenyAllFilter(filter: unknown): boolean {
  if (!filter || typeof filter !== "object") return false;

  // The filter itself may be the bare sentinel.
  if (isDenyAllSentinel(filter)) return true;

  const stack: unknown[] = [filter];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;

    const obj = current as Record<string, unknown>;

    // A pinned `_id` is the only shape ScopeResolver emits for a denial.
    if (isDenyAllSentinel(obj._id)) return true;

    // Follow the logical combinators only. Operator arguments such as `$in` are
    // deliberately NOT traversed: a caller may legitimately narrow a list to a
    // specific set of ids, and a sentinel appearing there is a value rather
    // than a scope denial.
    for (const combinator of ["$and", "$or"] as const) {
      const clauses = obj[combinator];
      if (!Array.isArray(clauses)) continue;
      for (const clause of clauses) {
        if (clause && typeof clause === "object") stack.push(clause);
      }
    }
  }

  return false;
}

export type ScopeQueryResult =
  | { denied: true; query: null }
  | { denied: false; query: Record<string, unknown> };

/**
 * Combines an immutable authorization filter with a controller-supplied query
 * into a single Mongo filter, preserving both sets of constraints.
 *
 * Returns `denied: true` when the authorization filter is unsatisfiable, so the
 * caller can short-circuit to an empty result set instead of executing a query
 * that would silently ignore the restriction.
 */
export function buildScopedQuery(
  scopeFilter: unknown,
  extraQuery?: Record<string, unknown>
): ScopeQueryResult {
  if (isDenyAllFilter(scopeFilter)) {
    return { denied: true, query: null };
  }

  const hasScope = Boolean(scopeFilter && typeof scopeFilter === "object" && Object.keys(scopeFilter as object).length > 0);
  const hasExtra = Boolean(extraQuery && Object.keys(extraQuery).length > 0);

  if (!hasScope && !hasExtra) return { denied: false, query: {} };
  if (hasScope && !hasExtra) return { denied: false, query: { ...(scopeFilter as Record<string, unknown>) } };
  if (!hasScope && hasExtra) return { denied: false, query: { ...extraQuery } };

  return {
    denied: false,
    query: {
      $and: [
        { ...(scopeFilter as Record<string, unknown>) },
        { ...(extraQuery as Record<string, unknown>) }
      ]
    }
  };
}

/**
 * Applies an authorization filter to an already-materialized (in-memory)
 * document. Used when a controller must post-filter after a populate, or to
 * verify a single record fetched by id.
 *
 * Reuses Mongo's query engine semantics via `matchesScopeFilter` when possible;
 * falls back to a structural comparison of the deny-all sentinel.
 */
export async function documentMatchesScope(
  document: object | null | undefined,
  scopeFilter: unknown
): Promise<boolean> {
  if (!document) return false;
  if (isDenyAllFilter(scopeFilter)) return false;
  if (!scopeFilter || typeof scopeFilter !== "object" || Object.keys(scopeFilter as object).length === 0) {
    return true;
  }
  return await matchesQuery(document as Record<string, unknown>, scopeFilter as Record<string, unknown>);
}

/**
 * Minimal Mongo query matcher supporting the operators that ScopeResolver can
 * emit: implicit equality, `$and`, `$or`, `$in`, and nested dotted paths.
 */
async function matchesQuery(
  document: Record<string, unknown>,
  query: Record<string, unknown>
): Promise<boolean> {
  for (const [key, condition] of Object.entries(query)) {
    if (key === "$and") {
      const clauses = condition as Record<string, unknown>[];
      for (const clause of clauses) {
        if (!(await matchesQuery(document, clause))) return false;
      }
      continue;
    }

    if (key === "$or") {
      const clauses = condition as Record<string, unknown>[];
      let matched = false;
      for (const clause of clauses) {
        if (await matchesQuery(document, clause)) {
          matched = true;
          break;
        }
      }
      if (!matched) return false;
      continue;
    }

    const actual = readPath(document, key);

    if (condition && typeof condition === "object" && !(condition instanceof Types.ObjectId) && !Array.isArray(condition)) {
      const operators = condition as Record<string, unknown>;

      if ("$in" in operators) {
        const candidates = (operators.$in as unknown[]).map((v) => normalizeId(v));
        if (!candidates.includes(normalizeId(actual))) return false;
        continue;
      }

      if ("$ne" in operators) {
        if (normalizeId(actual) === normalizeId(operators.$ne)) return false;
        continue;
      }

      // Unsupported operator combination -> fail closed.
      return false;
    }

    if (normalizeId(actual) !== normalizeId(condition)) return false;
  }

  return true;
}

function readPath(source: Record<string, unknown>, path: string): unknown {
  if (!path.includes(".")) return source[path];

  return path.split(".").reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, source);
}

function normalizeId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;

  if (value instanceof Types.ObjectId) return value.toString();

  if (typeof value === "object" && value !== null && "_id" in (value as Record<string, unknown>)) {
    return normalizeId((value as Record<string, unknown>)._id);
  }

  return String(value);
}
