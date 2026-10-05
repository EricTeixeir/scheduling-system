/**
 * Outcome of a domain decision. Expected business refusals are values, not
 * exceptions: `reason` is a machine-readable code the service layer maps to an
 * HTTP response. Exceptions are reserved for programmer errors.
 */
export type Result<T, R extends string> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: R };

/** A successful outcome carrying `value`. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** A refused outcome carrying the reason code. */
export function fail<R extends string>(reason: R): Result<never, R> {
  return { ok: false, reason };
}
