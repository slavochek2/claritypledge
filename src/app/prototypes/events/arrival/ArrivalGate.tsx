/**
 * @file ArrivalGate.tsx
 * @description P1380 — "Have you arrived?" at the room gate, and the `?arrived=1` hand-off from
 * the starting-soon email's **I'm here** button.
 *
 * The room is not proof of presence; the answer is (founder, 2026-10-01). So a registrant who
 * opens the room of an in-person, Preparation-on event, from an hour before the start until it
 * ends, is asked once. **I'm here** records the arrival and continues into the room (the P1336
 * preparation gate comes next); **Not yet** opens the "See you soon" page.
 *
 * Like the preparation gate, it never traps anyone outside the room: offline, a failed read, a
 * read past the deadline or a failed write all let the person in.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth';
import { useConnectivity } from '@/app/contexts/offline-status-context';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import { getMyArrival, markEventArrival } from '@/app/data/event-arrival-service';
import type { EventWithHost } from '@/app/types';
import { arrivalQuestion, arrivalWindowOpen, isOnlineLocation, venueName } from './arrival-text';

const READ_DEADLINE_MS = 5000;

/** Whether the arrival question applies to this viewer of this event, now. Pure — unit-tested. */
export function arrivalApplies(
  event: Pick<EventWithHost, 'preparationEnabled' | 'location' | 'hostId' | 'datetime' | 'durationMinutes'> | null,
  viewerId: string | null,
  now: Date = new Date(),
): boolean {
  return !!(
    event
    && viewerId
    && event.preparationEnabled
    && event.hostId !== viewerId
    && !isOnlineLocation(event.location)
    && arrivalWindowOpen(event, now)
  );
}

/** `gate`: true = ask, false = go on, null = still deciding. */
export function useArrivalGate(event: EventWithHost | null, granted: boolean): { gate: boolean | null; answered: () => void } {
  const { user, session } = useAuth();
  const viewerId = session?.user?.id ?? user?.id ?? null;
  const { offline } = useConnectivity();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromEmail = searchParams.get('arrived') === '1';
  const applies = granted && !offline && arrivalApplies(event, viewerId);
  const [state, setState] = useState<'unknown' | 'arrived' | 'not-arrived' | 'error'>('unknown');
  const [timedOut, setTimedOut] = useState(false);
  const handledEmail = useRef(false);

  // **I'm here** from the email: record it in the person's own browser (a mail scanner never
  // gets this far), then drop the flag so a reload or a shared URL does not repeat it.
  useEffect(() => {
    if (!fromEmail || !granted || !event || !viewerId || handledEmail.current) return;
    handledEmail.current = true;
    markEventArrival(event.id)
      .then(() => setState('arrived'))
      .catch((err) => {
        console.warn('[arrival] mark from email failed:', err);
        setState('error');
      })
      .finally(() => {
        const next = new URLSearchParams(searchParams);
        next.delete('arrived');
        setSearchParams(next, { replace: true });
      });
  }, [fromEmail, granted, event, viewerId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!applies || fromEmail || !event || !viewerId || state !== 'unknown') return;
    let cancelled = false;
    getMyArrival(event.id, viewerId)
      .then((at) => !cancelled && setState(at ? 'arrived' : 'not-arrived'))
      .catch(() => !cancelled && setState('error'));
    const t = setTimeout(() => !cancelled && setTimedOut(true), READ_DEADLINE_MS);
    return () => { cancelled = true; clearTimeout(t); };
  }, [applies, fromEmail, event, viewerId, state]);

  const answered = () => setState('arrived');

  if (fromEmail && granted) return { gate: state === 'unknown' ? null : false, answered };
  if (!applies) return { gate: false, answered };
  if (state === 'unknown') return { gate: timedOut ? false : null, answered };
  return { gate: state === 'not-arrived', answered };
}

export function ArrivalQuestion({ event, onHere }: { event: EventWithHost; onHere: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const venue = venueName(event.location);
  const here = async () => {
    setBusy(true);
    try {
      await markEventArrival(event.id);
    } catch (err) {
      // Never keep someone out of the room because the check-in did not save.
      console.warn('[arrival] mark failed:', err);
    }
    onHere();
  };
  return (
    <section
      className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-sm flex-col items-center justify-center space-y-6 px-4 py-10 text-center lg:min-h-[calc(100vh-5rem)]"
      data-testid="arrival-question"
    >
      <h1 className="text-2xl font-bold leading-snug text-foreground">{arrivalQuestion(event.location)}</h1>
      {!venue && event.location && (
        <p className="text-base text-muted-foreground" data-testid="arrival-address">{event.location}</p>
      )}
      <div className="flex w-full flex-col items-center gap-1">
        <LetterPrimaryCta label="I'm here" onClick={here} disabled={busy} />
        <LetterPrimaryCta
          label="Not yet"
          variant="secondary"
          onClick={() => navigate(`/events/${event.slug}/arriving`)}
        />
      </div>
    </section>
  );
}
