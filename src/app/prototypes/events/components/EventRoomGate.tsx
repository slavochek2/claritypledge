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
import { useEventRoomAccess, useEventRoomSelf } from './EventRoomAccess';

const GATE_HEADING = 'This is for people coming to the event';
const GATE_BODY =
  'Register for the event to see the Clarity Meeting Principle and who has opted in.';

/** The register-or-sign-in wall. Deliberately shows nothing else about the room —
 * an acceptance criterion, not a styling choice: no roster, no readiness, no
 * decision content, no count. */
export function EventRoomGateScreen({ slug }: { slug: string | undefined }) {
  return (
    <div
      data-testid="room-gate"
      className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-sm flex-col items-center justify-center gap-6 px-4 py-10 text-center lg:min-h-[calc(100vh-5rem)]"
    >
      <h1 className="text-xl font-semibold leading-snug text-foreground sm:text-2xl">
        {GATE_HEADING}
      </h1>
      <p className="text-muted-foreground">{GATE_BODY}</p>
      <div className="flex w-full flex-col gap-3">
        <Button asChild size="lg" data-testid="room-gate-register">
          <Link to={`/events/${slug}`}>Register for this event</Link>
        </Button>
        <Button asChild size="lg" variant="outline" data-testid="room-gate-signin">
          <Link to={`/login?redirect=/events/${slug}/room`}>Sign in</Link>
        </Button>
      </div>
    </div>
  );
}

export function EventRoomGate() {
  const { slug, event, loading, granted } = useEventRoomAccess();
  const { self, loading: selfLoading } = useEventRoomSelf(event, granted);

  if (loading || (granted && selfLoading)) return null;
  if (!granted) return <EventRoomGateScreen slug={slug} />;

  // Readiness already set on a return visit → skip straight to the principle
  // (UAT: "return visit with readiness already set lands on …/meet, skipping
  // readiness"). Otherwise readiness first, same as every first visit.
  const destination = self?.readinessValue != null ? 'meet' : 'ready';
  return <Navigate to={`/events/${slug}/${destination}`} replace />;
}
