/**
 * @file EventRoomGate.tsx
 * @description P1114 rev2 — `/events/:slug/room`. Gate only; renders no room content
 * of its own (spec Solution, Route table). Registered + signed in → redirect to
 * `…/ready`. Otherwise the register-or-sign-in screen.
 *
 * `EventRoomGateScreen` is exported from here (not from a shared helper file) on
 * purpose: src/tests/p1114-room-composition.test.tsx reads THIS file's own source
 * for the four approved strings verbatim — EventRoomReady.tsx and EventRoomMeet.tsx
 * import it from here rather than duplicating the copy.
 */
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PRIMARY_BUTTON_CLASS, ANSWER_BUTTON_CLASS } from '@/app/components/agreements/meeting-principle-view';
import { useRoomCapture } from '@/app/contexts/room-capture-context';
import { useEventRoomAccess, useEventRoomSelf } from './EventRoomAccess';
import { PrepRoomGate, useRoomPrepGate } from '../prep/PrepRoom';
import { ArrivalQuestion, useArrivalGate } from '../arrival/ArrivalGate';
import { NeedsConnection } from '@/app/components/offline/needs-connection';

const GATE_HEADING = 'This is for people coming to the event';
const GATE_BODY =
  'Register for the event to see the Clarity Meeting Principle and who has opted in.';

/** The register-or-sign-in wall. Deliberately shows nothing else about the room —
 * an acceptance criterion, not a styling choice: no roster, no readiness, no
 * decision content, no count.
 *
 * `isLoggedIn` drops the Sign in control for a caller who already has a session —
 * offering to sign in to someone already signed in is a dead, confusing control,
 * not a harmless extra. This screen is only ever rendered as the whole page — the
 * three standalone `/room`, `/ready`, `/meet` routes — so the centering height is
 * unconditional. (EventDetail's "cmp" tab used to embed EventRoomMeet's gate
 * fallback inline and needed a `fullHeight` escape hatch for that; the tab now
 * navigates to the standalone `/meet` route instead, so the escape hatch is gone.) */
export function EventRoomGateScreen({
  slug,
  isLoggedIn,
}: {
  slug: string | undefined;
  isLoggedIn: boolean;
}) {
  return (
    <div
      data-testid="room-gate"
      className={cn(
        'mx-auto flex max-w-sm flex-col items-center justify-center gap-6 px-4 py-10 text-center',
        'min-h-[calc(100vh-4rem)] lg:min-h-[calc(100vh-5rem)]',
      )}
    >
      <h1 className="text-xl font-semibold leading-snug text-foreground sm:text-2xl">
        {GATE_HEADING}
      </h1>
      <p className="text-muted-foreground">{GATE_BODY}</p>
      <div className="flex w-full flex-col gap-3">
        <Button asChild size="lg" className={PRIMARY_BUTTON_CLASS} data-testid="room-gate-register">
          <Link to={`/events/${slug}`}>Register for this event</Link>
        </Button>
        {!isLoggedIn && (
          <Button asChild size="lg" className={ANSWER_BUTTON_CLASS} data-testid="room-gate-signin">
            <Link to={`/login?redirect=/events/${slug}/room`}>Sign in</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

export function EventRoomGate() {
  const { slug, event, loading, granted, isLoggedIn, offline } = useEventRoomAccess();
  // P1336: a registrant whose preparation is not complete is offered it before the room. The
  // gate is decided BEFORE useEventRoomSelf runs, because that hook joins the room (a public
  // roster row) — someone who chooses "Prepare now" must not be on the roster yet.
  const { gate: prepGate } = useRoomPrepGate(event, granted);
  // P1380: "Have you arrived?" comes first — I'm here, then the preparation gate, then the room.
  // Decided before useEventRoomSelf for the same reason as the prep gate: answering Not yet
  // must not put the person on the room roster.
  const { gate: arrivalGate, answered: arrivalAnswered } = useArrivalGate(event, granted);
  const [joinedWithoutPrep, setJoinedWithoutPrep] = useState(false);
  const enterRoom = granted && arrivalGate === false && (prepGate === false || joinedWithoutPrep);
  const { self, loading: selfLoading } = useEventRoomSelf(event, enterRoom);
  const { isCapturingForEvent } = useRoomCapture();

  if (loading) return null;
  // P1369 Scope v2: never visited here and no network — not the register wall.
  if (offline) return <NeedsConnection />;
  if (!granted) return <EventRoomGateScreen slug={slug} isLoggedIn={isLoggedIn} />;
  if (arrivalGate === null) return null;
  if (arrivalGate && event) return <ArrivalQuestion event={event} onHere={arrivalAnswered} />;
  if (prepGate === null) return null;
  if (prepGate && !joinedWithoutPrep && event) {
    return <PrepRoomGate event={event} onJoin={() => setJoinedWithoutPrep(true)} />;
  }
  if (selfLoading) return null;

  // P1433 D4 (supersedes P1307 D10): the first visit goes through Ready; a return visit — a
  // readiness value already set — goes straight back to the table, the person's current step.
  // D10 sent every return through /ready to offer the transcription switch; since P1337 that
  // switch is the table screen's own "Transcribe" bar, so skipping Ready skips no consent step.
  // Someone already being transcribed has necessarily been to the table, so goes there too.
  const alreadyTranscribed = !!event && isCapturingForEvent(event.id);
  const returning = self?.readinessValue != null;
  const destination = alreadyTranscribed || returning ? 'meet' : 'ready';
  return <Navigate to={`/events/${slug}/${destination}`} replace />;
}
