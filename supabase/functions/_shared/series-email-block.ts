/**
 * @file series-email-block.ts
 * @description P1529 §0: a per-series block for the confirmation and reminder. Any series can add an entry; a series
 * with none gets byte-identical emails. [FOUNDER DECISION: copy.] `observer` drops the laptop line.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeHtml, type EventRow } from './email-helpers.ts';
import {
  HIKE_OFFLINE_MAPS_LINE,
  HIKE_ROLE_LEAD,
  HIKE_ROLE_SWEEP,
  HIKE_ROLE_TRANSPORT_LEAD,
  HIKE_ROLE_WELCOMER,
  HIKE_WHATSAPP_FREE_SEATS_LINE,
} from './hike-copy.ts';
import { MM_CANVAS_LINE, MM_CANVAS_LINE_OBSERVER, mastermindPrepAtEvent } from './mastermind-prep-email.ts';

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

/** P1675: the flow an event runs, as the edge functions resolve it everywhere. */
export function eventFlow(event: SeriesEventRow): string {
  return event.flow ?? (['social-hike', 'sales-mastermind'].includes(event.series_slug ?? '') ? (event.series_slug as string) : 'clarity-night');
}

export const isHike = (event: SeriesEventRow): boolean => eventFlow(event) === 'social-hike';

/**
 * P1675 3c: "offers preparation" for emails = the stored flag OR a hike. Returns the same object when nothing
 * changes (every non-hike event, byte-identical); for a hike returns a COPY with the flag on. The stored flag is
 * never written.
 */
export function withPreparationOffered<T extends SeriesEventRow>(event: T): T {
  return !event.preparation_enabled && isHike(event) ? { ...event, preparation_enabled: true } : event;
}

/** The stored hike answers an email reads. help_other is deliberately not part of this type. */
export type HikeEmailAnswers = { transport: string | null; free_seats: number | null; help: string | null };

/** P1675: one person's hike answers (service-role client); null when none, or on a failed read (the email is still sent). */
export async function loadHikeAnswers(
  supabase: SupabaseClient,
  eventId: string,
  profileId: string | null,
): Promise<HikeEmailAnswers | null> {
  if (!profileId) return null;
  const { data, error } = await supabase.from('event_hike_answers').select('transport, free_seats, help')
    .eq('event_id', eventId).eq('profile_id', profileId).maybeSingle();
  if (error) console.warn(`hike answers read failed for event ${eventId}: ${error.message}`);
  return (data as HikeEmailAnswers | null) ?? null;
}

const HIKE_ROLE_LINES: Record<string, string[]> = {
  lead: [HIKE_ROLE_LEAD, HIKE_OFFLINE_MAPS_LINE],
  sweep: [HIKE_ROLE_SWEEP, HIKE_OFFLINE_MAPS_LINE],
  welcomer: [HIKE_ROLE_WELCOMER],
  transport_lead: [HIKE_ROLE_TRANSPORT_LEAD],
};

/** P1675 3c: the lines a hike confirmation adds. 'other' and an unknown help value add nothing. */
export function hikeEmailLines(a: HikeEmailAnswers): string[] {
  const motor = a.transport === 'car' || a.transport === 'motorbike';
  return [
    ...(motor && typeof a.free_seats === 'number' && a.free_seats >= 1 ? [HIKE_WHATSAPP_FREE_SEATS_LINE] : []),
    ...(a.help && Object.hasOwn(HIKE_ROLE_LINES, a.help) ? HIKE_ROLE_LINES[a.help] : []),
  ];
}

/** P1675: the hike's answer-driven lines, same placement as the series block. Non-hike or nothing to add: returned as is. */
export function withHikeBlock<T extends { html: string; text: string }>(
  email: T,
  event: SeriesEventRow,
  answers: HikeEmailAnswers | null,
): T {
  if (!isHike(event) || !answers) return email;
  const lines = hikeEmailLines(answers);
  if (lines.length === 0) return email;
  const items = lines.map((l) => `<li style="margin:0 0 4px;">${escapeHtml(l)}</li>`).join('');
  const block = `<ul style="margin:16px 0 0;padding-left:20px;font-size:14px;color:#4b5563;">${items}</ul>`;
  const marker = '<!-- Footer -->';
  const at = email.html.indexOf(marker);
  const html = at < 0
    ? email.html + block
    : `${email.html.slice(0, at)}<tr><td style="padding:0 40px 24px;">${block}</td></tr>${email.html.slice(at)}`;
  return { ...email, html, text: `${email.text}\n\n${lines.join('\n')}` };
}

export function withSeriesBlock<T extends { html: string; text: string }>(
  email: T,
  event: SeriesEventRow,
  ctx: { observer: boolean } = { observer: false },
): T {
  const key = event.flow ?? event.series_slug ?? '';
  const lines = SERIES_EMAIL_LINES[key]?.({ ...ctx, canvasAtEvent: mastermindPrepAtEvent(event) });
  if (!lines) return email;
  // The hero payoff says "We make your Clarity Canvas together"; an observer does not make one.
  if (ctx.observer) email = { ...email, html: email.html.replace(MM_CANVAS_LINE, MM_CANVAS_LINE_OBSERVER), text: email.text.replace(MM_CANVAS_LINE, MM_CANVAS_LINE_OBSERVER) };
  const items = lines.map((l) => `<li style="margin:0 0 4px;">${escapeHtml(l)}</li>`).join('');
  const block = `<ul style="margin:16px 0 0;padding-left:20px;font-size:14px;color:#4b5563;">${items}</ul>`;
  const marker = '<!-- Footer -->';
  const at = email.html.indexOf(marker);
  const html = at < 0
    ? email.html + block
    : `${email.html.slice(0, at)}<tr><td style="padding:0 40px 24px;">${block}</td></tr>${email.html.slice(at)}`;
  return { ...email, html, text: `${email.text}\n\n${lines.join('\n')}` };
}
