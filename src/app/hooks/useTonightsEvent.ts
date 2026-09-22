/**
 * @file useTonightsEvent.ts
 * @description P1351: the signed-in person's event TODAY, if any — drives the header's
 * "Tonight's event" primary button.
 *
 * "Today" is the event's own calendar date in the event's own timezone, compared with the
 * current date in that same timezone. Events are local, in-person meetups, so the event's
 * zone is the one that matters (spec Risks: ACCEPT).
 *
 * Fail quiet: any error resolves to "no event", so the header still renders normally.
 * One query per signed-in user per page load of the app, memoised at module scope.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '@/auth';
import { supabase } from '@/lib/supabase';

export interface TonightsEvent {
  slug: string;
  title: string;
}

interface CandidateEvent {
  slug: string;
  title: string;
  datetime: string;
  timezone: string | null;
  status: string | null;
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
  return today[0] ? { slug: today[0].slug, title: today[0].title } : null;
}

const cache = new Map<string, Promise<TonightsEvent | null>>();

export function __resetTonightsEventCacheForTest(): void {
  cache.clear();
}

async function fetchTonightsEvent(userId: string): Promise<TonightsEvent | null> {
  const now = new Date();
  // A ±36h window covers every timezone's "today"; the exact filter is pickTonightsEvent.
  const from = new Date(now.getTime() - 36 * 3600 * 1000).toISOString();
  const to = new Date(now.getTime() + 36 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('event_rsvps')
    .select('event:events!inner(slug, title, datetime, timezone, status)')
    .eq('profile_id', userId)
    .gte('event.datetime', from)
    .lte('event.datetime', to);
  if (error || !data) return null;
  const events = (data as unknown as { event: CandidateEvent | CandidateEvent[] | null }[])
    .flatMap(r => (Array.isArray(r.event) ? r.event : r.event ? [r.event] : []));
  return pickTonightsEvent(events, now);
}

export function useTonightsEvent(): TonightsEvent | null {
  const { user } = useAuth();
  const [event, setEvent] = useState<TonightsEvent | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      setEvent(null);
      return;
    }
    let active = true;
    let pending = cache.get(userId);
    if (!pending) {
      pending = fetchTonightsEvent(userId).catch(() => null);
      cache.set(userId, pending);
    }
    pending.then(e => { if (active) setEvent(e); });
    return () => { active = false; };
  }, [userId]);

  return event;
}
