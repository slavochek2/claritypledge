/**
 * @file useTonightsEvent.ts
 * @description P1351: the signed-in person's event TODAY, if any — drives the header's
 * "Today's event" primary button (P1433: renamed from "Tonight's event").
 *
 * P1433 widens who sees it: a person NOT registered (signed in or out) sees a prep-enabled
 * event while its window is open (todaysEventWindowOpen), so someone at the door can still find
 * the room. A registered person keeps seeing their event all day, as before.
 *
 * "Today" is the event's own calendar date in the event's own timezone, compared with the
 * current date in that same timezone. Events are local, in-person meetups, so the event's
 * zone is the one that matters (spec Risks: ACCEPT).
 *
 * Fail quiet: any error resolves to "no event", so the header still renders normally.
 * Memoised at module scope for CACHE_TTL_MS, so every header on a page shares one query, but a
 * long-lived tab still picks up a new day or a fresh RSVP (review finding, Gemini 3.8).
 */
import { useEffect, useState } from 'react';
import { useAuth } from '@/auth';
import { supabase } from '@/lib/supabase';

export interface TonightsEvent {
  slug: string;
  title: string;
  datetime: string;
  durationMinutes: number | null;
  preparationEnabled: boolean;
  /** P1433: true when it came from the person's own RSVP; false for the public in-window pick. */
  registered?: boolean;
}

interface CandidateEvent {
  slug: string;
  title: string;
  datetime: string;
  timezone: string | null;
  status: string | null;
  duration_minutes?: number | null;
  preparation_enabled?: boolean | null;
}

/** Calendar date (YYYY-MM-DD) of `instant` in `timeZone`; falls back to UTC on a bad zone. */
export function dateInZone(instant: Date, timeZone: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

/** Pure selection: the earliest non-cancelled event whose local date is today. */
export function pickTonightsEvent(events: CandidateEvent[], now: Date): TonightsEvent | null {
  const today = events
    .filter(e => e.status !== 'cancelled')
    .filter(e => dateInZone(new Date(e.datetime), e.timezone) === dateInZone(now, e.timezone))
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
  const e = today[0];
  return e
    ? {
        slug: e.slug,
        title: e.title,
        datetime: e.datetime,
        durationMinutes: e.duration_minutes ?? null,
        preparationEnabled: !!e.preparation_enabled,
      }
    : null;
}

const HOUR_MS = 60 * 60 * 1000;
/** P1433 D1: the room is the place to be from an hour before the start ... */
export const TODAYS_EVENT_OPENS_BEFORE_MS = 1 * HOUR_MS;
/** ... until three hours after the end; after the end the room shows close and feedback. */
export const TODAYS_EVENT_CLOSES_AFTER_MS = 3 * HOUR_MS;

/**
 * P1433 D1: the event-night window — an hour before the start until three hours after the end.
 * Wider than the room's own arrival window (arrival-text.ts), which still decides when the room
 * asks "Have you arrived?"; this one decides where the header and Back send people.
 */
export function todaysEventWindowOpen(
  event: Pick<TonightsEvent, 'datetime' | 'durationMinutes'>,
  now: Date = new Date(),
): boolean {
  const start = new Date(event.datetime).getTime();
  const end = start + (event.durationMinutes ?? 60) * 60 * 1000;
  const t = now.getTime();
  return t >= start - TODAYS_EVENT_OPENS_BEFORE_MS && t <= end + TODAYS_EVENT_CLOSES_AFTER_MS;
}

/**
 * P1428/P1433: where "Today's event" leads. The room, for an event that runs one (preparation on)
 * while the event-night window is open. Otherwise the event page: hours before, or for an event
 * with no room flow (a hike), the page with the time and place is right.
 */
export function tonightsEventHref(event: TonightsEvent, now: Date = new Date()): string {
  const page = `/events/${event.slug}`;
  return event.preparationEnabled && todaysEventWindowOpen(event, now) ? `${page}/room` : page;
}

/**
 * P1433 D3: the event room, when "Go back" has nowhere in-app to go and the event night is on —
 * else null (the page's own fallback stands). Never from inside the event's own pages: their Back
 * steps through the room's pipeline, and /ready's fallback replaced by /room would loop
 * (/room redirects back to /ready).
 */
export function eventNightBackFallback(event: TonightsEvent | null, pathname: string, now: Date = new Date()): string | null {
  if (!event) return null;
  const page = `/events/${event.slug}`;
  if (pathname === page || pathname.startsWith(`${page}/`)) return null;
  const href = tonightsEventHref(event, now);
  return href.endsWith('/room') ? href : null;
}

/**
 * P1433 D2: the event a NON-registered person sees — a prep-enabled, not-cancelled event whose
 * window is open now; the earliest when two overlap. Prep-off events never qualify (registered only).
 */
export function pickWindowEvent(events: CandidateEvent[], now: Date): TonightsEvent | null {
  const open = events
    .filter(e => e.status !== 'cancelled' && !!e.preparation_enabled)
    .filter(e => todaysEventWindowOpen({ datetime: e.datetime, durationMinutes: e.duration_minutes ?? null }, now))
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
  const e = open[0];
  return e
    ? {
        slug: e.slug,
        title: e.title,
        datetime: e.datetime,
        durationMinutes: e.duration_minutes ?? null,
        preparationEnabled: true,
        registered: false,
      }
    : null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; promise: Promise<TonightsEvent | null> }>();
/** P1433: the public in-window candidates, shared by every viewer on the page (one query). */
let publicCache: { at: number; promise: Promise<CandidateEvent[]> } | null = null;

export function __resetTonightsEventCacheForTest(): void {
  cache.clear();
  publicCache = null;
}

const EVENT_COLUMNS = 'slug, title, datetime, timezone, status, duration_minutes, preparation_enabled';

/**
 * P1433: prep-enabled events that could be in their window around now. `events` is publicly
 * readable (SELECT USING true), so this works signed out. The bounds are generous — the exact
 * window test runs at render time (pickWindowEvent), so a cached list never goes stale on the
 * window's edges, only on new events (CACHE_TTL_MS).
 */
async function fetchPublicWindowCandidates(): Promise<CandidateEvent[]> {
  const now = Date.now();
  // Started up to a day ago (duration + 3h fits in that for any night), or starts within the next
  // day — a page opened hours early must still find the event when its window opens (P1433 review,
  // Codex: a one-hour upper bound missed an event 61 minutes out until the cache expired).
  const from = new Date(now - 24 * 3600 * 1000).toISOString();
  const to = new Date(now + 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('preparation_enabled', true)
    .gte('datetime', from)
    .lte('datetime', to);
  if (error || !data) return [];
  return data as unknown as CandidateEvent[];
}

function publicCandidates(): Promise<CandidateEvent[]> {
  if (!publicCache || Date.now() - publicCache.at > CACHE_TTL_MS) {
    publicCache = { at: Date.now(), promise: fetchPublicWindowCandidates().catch(() => []) };
  }
  return publicCache.promise;
}

async function fetchTonightsEvent(userId: string): Promise<TonightsEvent | null> {
  const now = new Date();
  // A ±36h window covers every timezone's "today"; the exact filter is pickTonightsEvent.
  const from = new Date(now.getTime() - 36 * 3600 * 1000).toISOString();
  const to = new Date(now.getTime() + 36 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('event_rsvps')
    .select(`event:events!inner(${EVENT_COLUMNS})`)
    .eq('profile_id', userId)
    .gte('event.datetime', from)
    .lte('event.datetime', to);
  if (error || !data) return null;
  const events = (data as unknown as { event: CandidateEvent | CandidateEvent[] | null }[])
    .flatMap(r => (Array.isArray(r.event) ? r.event : r.event ? [r.event] : []));
  const picked = pickTonightsEvent(events, now);
  return picked ? { ...picked, registered: true } : null;
}

/**
 * P1433: useGoBack now reads this hook, and Back buttons render in places with no AuthProvider
 * (embeds, isolated tests). There the answer is "signed out", never a crash. useAuth is one
 * useContext call either way, so the hook order is unchanged.
 */
function useAuthOrSignedOut(): Pick<ReturnType<typeof useAuth>, 'user' | 'session'> {
  try {
    return useAuth();
  } catch {
    return { user: null, session: null };
  }
}

export function useTonightsEvent(): TonightsEvent | null {
  const { user, session } = useAuthOrSignedOut();
  const [registered, setRegistered] = useState<TonightsEvent | null>(null);
  // Which user's RSVP lookup has answered. Until the signed-in person's own answer is in, no
  // public pick is shown — else a warm public cache flashes another event's button before theirs
  // (P1433 review, Gemini).
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateEvent[]>([]);
  // P1421: the session's user id is the profile id and is known before the profile loads,
  // so the header's event button is decided early instead of shifting the row on arrival.
  const userId = user?.id ?? session?.user?.id ?? null;

  useEffect(() => {
    let active = true;
    if (!userId) {
      setRegistered(null);
    } else {
      let entry = cache.get(userId);
      if (!entry || Date.now() - entry.at > CACHE_TTL_MS) {
        entry = { at: Date.now(), promise: fetchTonightsEvent(userId).catch(() => null) };
        cache.set(userId, entry);
      }
      entry.promise.then(e => {
        if (!active) return;
        setRegistered(e);
        setResolvedFor(userId);
      });
    }
    // P1433 D2: everyone, signed in or out, may be shown an in-window prep-enabled event.
    publicCandidates().then(list => { if (active) setCandidates(list); });
    return () => { active = false; };
  }, [userId]);

  // Re-decide once a minute while there is anything to decide about, so a window that opens or
  // closes while the page sits still shows up without a navigation (P1433 review).
  const [, setTick] = useState(0);
  const anything = !!registered || candidates.length > 0;
  useEffect(() => {
    if (!anything) return;
    const id = setInterval(() => setTick(t => t + 1), 60 * 1000);
    return () => clearInterval(id);
  }, [anything]);

  // The person's own event wins; otherwise the public in-window pick, re-decided each render so
  // the window's edges are honoured without a refetch.
  // P1434: `registered` answers `resolvedFor`'s lookup — never return it for anyone else (signed
  // out, or another account whose own lookup is still pending).
  if (userId && resolvedFor !== userId) return null;
  if (registered && resolvedFor === userId) return registered;
  return pickWindowEvent(candidates, new Date());
}
