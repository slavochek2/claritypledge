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
import { Link, Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PRIMARY_BUTTON_CLASS, ANSWER_BUTTON_CLASS } from '@/app/pages/meeting-terms-page';
import { useRoomCapture } from '@/app/contexts/room-capture-context';
import { useEventRoomAccess, useEventRoomSelf } from './EventRoomAccess';

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
  const { slug, event, loading, granted, isLoggedIn } = useEventRoomAccess();
  const { loading: selfLoading } = useEventRoomSelf(event, granted);
  const { isCapturingForEvent } = useRoomCapture();

  if (loading || (granted && selfLoading)) return null;
  if (!granted) return <EventRoomGateScreen slug={slug} isLoggedIn={isLoggedIn} />;

  // P1307 D10: everyone passes the ready screen, so everyone is offered the transcription
  // switch. Only a person ALREADY being transcribed for this event goes straight to /meet.
  // A readiness value from an earlier visit no longer skips /ready — the slider shows it
  // instead. (Replaces P1114's "return visit with readiness already set lands on /meet".)
  const alreadyTranscribed = !!event && isCapturingForEvent(event.id);
  const destination = alreadyTranscribed ? 'meet' : 'ready';
  return <Navigate to={`/events/${slug}/${destination}`} replace />;
}
