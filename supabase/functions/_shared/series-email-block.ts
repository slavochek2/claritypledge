/**
 * @file series-email-block.ts
 * @description P1529 §0: a per-series block for the confirmation and reminder. Any series can add an entry; a series
 * with none gets byte-identical emails. [FOUNDER DECISION: copy.] `observer` drops the laptop line.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeHtml, type EventRow } from './email-helpers.ts';
import { mastermindPrepAtEvent } from './mastermind-prep-email.ts';

/** The event columns that choose the block; selected by the senders. */
export type SeriesEventRow = EventRow & { series_slug?: string | null; flow?: string | null; canvas_timing?: string | null };

const SERIES_EMAIL_LINES: Record<string, (ctx: { observer: boolean; canvasAtEvent: boolean }) => string[]> = {
  // P1529 E4 [FOUNDER DECISION: copy, builder's wording from the spec]: canvas at the event (default) = preparation is required and the canvas is made together there.
  'sales-mastermind': ({ observer, canvasAtEvent }) => [
    ...(canvasAtEvent ? ['Preparation is required: about 15 minutes, at home or 15 minutes early at the venue.'] : []),
    ...(canvasAtEvent && !observer ? ['We make your Clarity Canvas together at the event.'] : []),
    'Bring your phone, charged.',
    ...(observer || canvasAtEvent ? [] : ['Bring a laptop if you are making your Clarity Canvas at the event.']),
    'Doors open 30 minutes before the start.',
    "Places are limited. If you can't come, please cancel so someone else can have your place.",
  ],
};

/** Did this person choose to observe? Only the series block reads it; no answers row reads as not observing. */
export async function choseToObserve(
  supabase: SupabaseClient,
  eventId: string,
  profileId: string | null,
): Promise<boolean> {
  if (!profileId) return false;
  const { data } = await supabase.from('event_registration_answers').select('participation')
    .eq('event_id', eventId).eq('profile_id', profileId).maybeSingle();
  return data?.participation === 'observer';
}

export function withSeriesBlock<T extends { html: string; text: string }>(
  email: T,
  event: SeriesEventRow,
  ctx: { observer: boolean } = { observer: false },
): T {
  const key = event.flow ?? event.series_slug ?? '';
  const lines = SERIES_EMAIL_LINES[key]?.({ ...ctx, canvasAtEvent: mastermindPrepAtEvent(event) });
  if (!lines) return email;
  const items = lines.map((l) => `<li style="margin:0 0 4px;">${escapeHtml(l)}</li>`).join('');
  const block = `<ul style="margin:16px 0 0;padding-left:20px;font-size:14px;color:#4b5563;">${items}</ul>`;
  const marker = '<!-- Footer -->';
  const at = email.html.indexOf(marker);
  const html = at < 0
    ? email.html + block
    : `${email.html.slice(0, at)}<tr><td style="padding:0 40px 24px;">${block}</td></tr>${email.html.slice(at)}`;
  return { ...email, html, text: `${email.text}\n\n${lines.join('\n')}` };
}
