/**
 * @file calendar-sources.ts
 * @description P1447: "Suggest a source" on /cm — anyone, signed in or not, can send the founder a
 * link to an events source for the Chiang Mai calendar.
 *
 * Write-only from the client: the table has no client grants or policies (migration
 * 20261009150000_p1447_calendar_source_suggestions.sql) and submit_calendar_source returns nothing.
 * The founder reads new suggestions through /day. Nothing fetches or publishes a submitted link.
 */
import { supabase } from '@/lib/supabase';

export const SOURCE_URL_MAX = 500;
export const SOURCE_NOTE_MAX = 280;

export type SubmitSourceResult = 'ok' | 'invalid-link' | 'rate-limited' | 'failed';

/** Client-side pre-check only; the server repeats it and is the authority. */
export function looksLikeSourceUrl(raw: string): boolean {
  const v = raw.trim();
  if (v.length === 0 || v.length > SOURCE_URL_MAX) return false;
  try {
    const u = new URL(v);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.');
  } catch {
    return false;
  }
}

export async function submitCalendarSource(url: string, note: string): Promise<SubmitSourceResult> {
  const { error } = await supabase.rpc('submit_calendar_source', {
    p_url: url.trim(),
    p_note: note.trim() || null,
  });
  if (!error) return 'ok';
  if (error.message === 'invalid link') return 'invalid-link';
  if (error.message === 'rate limit') return 'rate-limited';
  console.error('[cm] submit_calendar_source failed:', error.code, error.message);
  return 'failed';
}
