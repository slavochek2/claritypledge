/**
 * @file PrepRoom.tsx
 * @description P1336 — the room's side of the preparation: the gate a registrant whose
 * preparation is not complete sees at `/events/:slug/room`, and the banner on /ready and /meet
 * that keeps the preparation one tap away for someone who joined without it.
 *
 * "Join the room without preparing" enters directly — no confirmation dialog — and is
 * remembered for this browser session, so the gate does not reappear on every visit to /room.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth';
import { useConnectivity } from '@/app/contexts/offline-status-context';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import type { EventWithHost } from '@/app/types';
import { PrepStatus } from './PrepPieces';
import { usePrepState } from './use-prep-state';

const bypassKey = (eventId: string, viewerId: string) => `p1336-room-bypass:${viewerId}:${eventId}`;
export function hasBypassedPrep(eventId: string, viewerId: string): boolean {
  try {
    return sessionStorage.getItem(bypassKey(eventId, viewerId)) === '1';
  } catch {
    return false;
  }
}
function rememberBypass(eventId: string, viewerId: string) {
  try {
    sessionStorage.setItem(bypassKey(eventId, viewerId), '1');
  } catch { /* storage unavailable: the gate shows again next visit */ }
}

/** The signed-in id from the SESSION, not the profile — the same rule as EventRoomAccess (P1369):
 *  offline, or while the profile read is still out, `user` is null but the session is not. */
function useViewerId(): string | null {
  const { user, session } = useAuth();
  return session?.user?.id ?? user?.id ?? null;
}

/** How long an unanswered preparation read may hold the room before the gate steps aside — the
 *  room's own promise (P1369) is a cached copy or needs-connection within about 5 seconds. */
const GATE_READ_DEADLINE_MS = 5000;

/** Whether the room should stop this viewer at the preparation gate. `null` while unknown.
 *  It never traps anyone outside the room: offline, no viewer id, a failed read or a read that
 *  outlives the deadline all mean "no gate". */
export function useRoomPrepGate(event: EventWithHost | null, granted: boolean): { gate: boolean | null } {
  const viewerId = useViewerId();
  const { offline } = useConnectivity();
  const isHost = !!(event && viewerId && event.hostId === viewerId);
  const applies = !!(granted && event?.preparationEnabled && !isHost && viewerId && !offline);
  const state = usePrepState(applies ? event : null, viewerId ?? undefined);
  const [timedOut, setTimedOut] = useState(false);
  const pending = applies && state.loading;
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setTimedOut(true), GATE_READ_DEADLINE_MS);
    return () => clearTimeout(t);
  }, [pending]);
  if (!applies || !viewerId || !event) return { gate: false };
  if (state.loading) return { gate: timedOut ? false : null };
  if (state.error) return { gate: false };
  if (state.progress.complete) return { gate: false };
  return { gate: !hasBypassedPrep(event.id, viewerId) };
}

export function PrepRoomGate({ event, onJoin }: { event: EventWithHost; onJoin: () => void }) {
  const navigate = useNavigate();
  const viewerId = useViewerId();
  return (
    <section
      className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-sm flex-col items-center justify-center space-y-6 px-4 py-10 text-center lg:min-h-[calc(100vh-5rem)]"
      data-testid="prep-room-gate"
    >
      {/* [DRAFT] */}
      <h1 className="text-2xl font-bold leading-snug text-foreground">You haven&apos;t prepared yet</h1>
      <p className="text-base leading-relaxed text-muted-foreground">
        The discussion uses a special structure. Ten minutes of preparation lets you take part fully.
      </p>
      <div className="flex flex-col items-center gap-1">
        <LetterPrimaryCta label="Prepare now" onClick={() => navigate(`/events/${event.slug}/prepare?from=room`)} />
        <LetterPrimaryCta
          label="Join the room without preparing"
          onClick={() => {
            if (viewerId) rememberBypass(event.id, viewerId);
            onJoin();
          }}
          variant="secondary"
        />
        {/* [DRAFT] the consequence line — no confirmation dialog on skip. */}
        <p className="text-sm text-muted-foreground" data-testid="prep-room-skip-consequence">
          You&apos;ll miss the shared definitions and the meeting principle. You can catch up any time.
        </p>
      </div>
    </section>
  );
}

/**
 * "Start your preparation" (0 done) / "Finish your preparation" (in progress), with the
 * attendee's status, so the host can check it on their phone. Prepared → "Prepared ✓" only.
 * `source="event"` is the same banner on the event page (where the 24h reminder lands): the
 * preparation then ends on its own end screen rather than "Join the room".
 */
export function PrepRoomBanner({ event, source = 'room' }: { event: EventWithHost | null; source?: 'room' | 'event' }) {
  const viewerId = useViewerId();
  const { offline } = useConnectivity();
  const navigate = useNavigate();
  const isHost = !!(event && viewerId && event.hostId === viewerId);
  // Offline the preparation cannot be read: show nothing rather than "not started" to someone who
  // prepared (review 2026-10-01).
  const applies = !!(event?.preparationEnabled && !isHost && viewerId && !offline);
  const state = usePrepState(applies ? event : null, viewerId ?? undefined);
  if (!applies || !event || state.loading || state.error) return null;
  const { progress } = state;
  const started = !!state.prep?.startedAt;
  const open = () => navigate(`/events/${event.slug}/prepare${source === 'room' ? '?from=room' : ''}`);
  const status = progress.done === 0 ? 'Preparation not started' : `${progress.done} of ${progress.total} steps`;
  const cta = progress.done === 0 ? 'Start your preparation' : 'Finish your preparation';

  if (source === 'room') {
    // UAT 2026-10-01: in the room this sits on the Back line, not as a box under it. Prepared →
    // nothing here: the roster's check mark beside the person's own row carries it.
    if (progress.complete) return null;
    return (
      <div className="flex min-h-11 flex-wrap items-center justify-end gap-x-2 text-sm" data-testid="prep-room-banner">
        <span className="text-muted-foreground" data-testid="prep-status">{status}</span>
        <button type="button" onClick={open} className="min-h-10 font-medium text-blue-600 hover:underline" data-testid="prep-room-banner-cta">
          {cta}
        </button>
      </div>
    );
  }

  // The event page: prepared is one quiet line, no box (nothing left to do).
  if (progress.complete) {
    return (
      <div data-testid="prep-room-banner">
        <PrepStatus progress={progress} started={started} />
      </div>
    );
  }
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-3 rounded-lg border border-border px-3 py-1"
      data-testid="prep-room-banner"
    >
      <span className="text-sm text-muted-foreground" data-testid="prep-status">{status}</span>
      <button type="button" onClick={open} className="min-h-10 text-sm font-medium text-blue-600 hover:underline" data-testid="prep-room-banner-cta">
        {cta}
      </button>
    </div>
  );
}
