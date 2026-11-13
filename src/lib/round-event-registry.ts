/**
 * @file round-event-registry.ts
 * @description Which events are round events (the sales mastermind), as far as this browser has seen. The event room marks its event; the
 * recording bar, which is drawn on other pages too (the canvas page opened from the event), reads it to say the round-event words.
 * Kept in sessionStorage so a reload on that page still knows. Storage can be blocked: it then falls back to memory, and the bar to its general words.
 */
const KEY = 'round-event-ids';
const memory = new Set<string>();

function stored(): string[] {
  try { const v = JSON.parse(sessionStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
}

export function markRoundEvent(eventId: string): void {
  memory.add(eventId);
  try { const ids = new Set(stored()); ids.add(eventId); sessionStorage.setItem(KEY, JSON.stringify([...ids])); } catch { /* memory only */ }
}

export function isRoundEvent(eventId: string | null | undefined): boolean {
  return !!eventId && (memory.has(eventId) || stored().includes(eventId));
}
