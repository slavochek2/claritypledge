/**
 * @file event-close-service.ts
 * @description P1389: the evening close (/events/:slug/close). Every call is an RPC; the two
 * tables have no client policies (migration 20261002220000_p1389_event_close.sql). Which
 * personal asks a person sees are decided in Postgres (p1389_offered_asks), never here.
 */
import { supabase } from '@/lib/supabase';

export type PersonalAsk = 'community' | 'connect';
export type AskAnswer = 'yes' | 'no';

export interface CloseState {
  isAttendee: boolean;
  score: number | null;
  liked: string | null;
  improve: string | null;
  /** The saved quote permission (null before any feedback): a returning visitor keeps their choice. */
  quoteOk: boolean | null;
  /** The personal asks that still apply, in order (none answered tonight, no yes ever, no recent no). */
  asks: PersonalAsk[];
  /** The thank-you was reached before: a return visit goes straight there. */
  finished: boolean;
}

interface CloseRow {
  is_attendee: boolean;
  score: number | null;
  liked: string | null;
  improve: string | null;
  quote_ok: boolean | null;
  asks: PersonalAsk[] | null;
  finished: boolean | null;
}

export async function getEventClose(eventId: string): Promise<CloseState> {
  const { data, error } = await supabase.rpc('get_event_close', { p_event_id: eventId });
  if (error) {
    console.error('[close] get_event_close failed:', error.code, error.message);
    throw error;
  }
  const r = (data as CloseRow[] | null)?.[0];
  return {
    isAttendee: !!r?.is_attendee,
    score: r?.score ?? null,
    liked: r?.liked ?? null,
    improve: r?.improve ?? null,
    quoteOk: r?.quote_ok ?? null,
    asks: r?.asks ?? [],
    finished: !!r?.finished,
  };
}

/** Marks the close finished (the thank-you was reached), so a return skips the questions. */
export async function finishEventClose(eventId: string): Promise<boolean> {
  const { error } = await supabase.rpc('finish_event_close', { p_event_id: eventId });
  if (error) console.error('[close] finish_event_close failed:', error.code, error.message);
  return !error;
}

export async function saveEventFeedback(
  eventId: string,
  fb: { score: number | null; liked: string; improve: string; quoteOk: boolean },
): Promise<boolean> {
  const { error } = await supabase.rpc('save_event_feedback', {
    p_event_id: eventId,
    p_score: fb.score,
    p_liked: fb.liked,
    p_improve: fb.improve,
    p_quote_ok: fb.quoteOk,
  });
  if (error) console.error('[close] save_event_feedback failed:', error.code, error.message);
  return !error;
}

export async function answerPersonalAsk(
  eventId: string,
  ask: PersonalAsk,
  answer: AskAnswer,
  detail?: string,
): Promise<boolean> {
  const { error } = await supabase.rpc('answer_personal_ask', {
    p_event_id: eventId,
    p_ask: ask,
    p_answer: answer,
    p_detail: detail ?? null,
  });
  if (error) console.error('[close] answer_personal_ask failed:', error.code, error.message);
  return !error;
}

/** Join the community from the close: the membership and the yes in one server transaction. */
export async function joinCommunityFromClose(eventId: string): Promise<boolean> {
  const { error } = await supabase.rpc('join_community_from_close', { p_event_id: eventId });
  if (error) console.error('[close] join_community_from_close failed:', error.code, error.message);
  return !error;
}

/** The slug of the group the community ask invites this person to (null when there is none). */
export async function getCommunitySlug(eventId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_event_community_slug', { p_event_id: eventId });
  if (error || typeof data !== 'string') return null;
  return data;
}

/** How many people came to this series before the given event (a count, never who). */
export async function getSeriesPeople(eventId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('get_event_series_people', { p_event_id: eventId });
  if (error || typeof data !== 'number') return null;
  return data;
}

/** The next Clarity Night after this one: same host, same series, earliest upcoming. */
export function pickNextEvent<T extends { id: string; hostId: string; title: string; datetime: string; status?: string }>(
  current: T,
  upcoming: T[],
): T | null {
  const isNight = (t: string) => /clarity night/i.test(t);
  const after = new Date(current.datetime).getTime();
  return (
    upcoming
      .filter(
        (e) =>
          e.id !== current.id &&
          e.hostId === current.hostId &&
          e.status !== 'cancelled' &&
          isNight(e.title) === isNight(current.title) &&
          new Date(e.datetime).getTime() > after,
      )
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())[0] ?? null
  );
}
