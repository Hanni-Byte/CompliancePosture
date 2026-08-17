/**
 * Result<T,E> is the error channel across every layer boundary (D20).
 * No exceptions cross layers: adapters catch and map to typed errors,
 * use cases compose Results, the UI renders them.
 */
export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function map<T, U, E>(r: Result<T, E>, f: (value: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r;
}

export function mapErr<T, E, F>(r: Result<T, E>, f: (error: E) => F): Result<T, F> {
  return r.ok ? r : err(f(r.error));
}

export function andThen<T, U, E>(
  r: Result<T, E>,
  f: (value: T) => Result<U, E>,
): Result<U, E> {
  return r.ok ? f(r.value) : r;
}

export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

/** Collects an array of Results into a Result of array; first error wins. */
export function all<T, E>(rs: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const r of rs) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return ok(values);
}