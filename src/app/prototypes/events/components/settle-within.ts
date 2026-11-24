/**
 * @file settle-within.ts
 * @description P1718: Ready is a note, never a gate. A read or a save that stalls (venue wifi, a captive portal) must
 * not hold the person on a loader or a dead button, and the client's fetch has no timeout of its own. This rejects
 * with `SettleTimeout` once `ms` pass; the work itself is not cancelled.
 */
export class SettleTimeout extends Error {
  constructor(ms: number) {
    super(`did not settle within ${ms} ms`);
    this.name = 'SettleTimeout';
  }
}

export function settleWithin<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SettleTimeout(ms)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
