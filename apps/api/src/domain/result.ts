// Business refusals are returned as values; exceptions are reserved for programmer errors.
export type Result<T, R extends string> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: R };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function fail<R extends string>(reason: R): Result<never, R> {
  return { ok: false, reason };
}
