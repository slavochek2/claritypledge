/**
 * Hand-built Supabase chain mocks that spell out every link (`select → eq → order → range`)
 * predate P1337's `.is('superseded_by', null)` (src/app/data/point-versions.ts). This lets such a
 * chain accept `.is(...)` at any link and carry on with the same link, so those tests keep
 * asserting what they were written for. The version filter itself is asserted where it matters:
 * src/tests/p1376-reproduce.test.tsx (rows in and out) and p1337-current-versions-guard.test.ts.
 */
export function tolerateIs<T>(value: T): T {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return value;
  if (typeof (value as { then?: unknown }).then === 'function') return value; // a result, not a link
  return new Proxy(value as object, {
    get(target, prop, receiver) {
      if (prop === 'is' && !(prop in target)) return () => tolerateIs(target);
      const v = Reflect.get(target, prop, receiver);
      if (typeof v !== 'function') return v;
      return (...args: unknown[]) => tolerateIs((v as (...a: unknown[]) => unknown).apply(target, args));
    },
  }) as T;
}
