/**
 * P1369: "{age}" in the offline strip — "Offline · saved copy from {age}".
 * Coarse on purpose: the reader needs "how stale", not a timestamp.
 */
export function formatSeenAge(storedAt: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - storedAt) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  const w = Math.floor(d / 7);
  return w === 1 ? '1 week ago' : `${w} weeks ago`;
}
