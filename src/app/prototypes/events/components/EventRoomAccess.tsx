/**
 * @file EventRoomAccess.tsx
 * @description P1114 rev2 — shared access check for the three room routes
 * (`/events/:slug/room`, `/ready`, `/meet`). Entry is gated by registration AND
 * sign-in (spec Solution, "REVISED (2)" block): `event_rsvps` is the room's gate,
 * reusing `eventsService.isUserRsvpd` rather than a second registration mechanism.
 * The event's own host is exempt from that RSVP check — an organizer is registered
 * for their own event by definition, not by having a row in `event_rsvps`.
 *
 * The gate SCREEN itself (the four approved strings) lives in `EventRoomGate.tsx`,
 * not here — src/tests/p1114-room-composition.test.tsx reads that file's own source
 * for them verbatim. EventRoomReady and EventRoomMeet import it from there when
 * `useEventRoomAccess()` reports access is not granted — "the gate is the same wall
 * on every door," not decoration on one route.
 */
import { useParams } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth';
import { eventsService } from '@/app/data/events-service';
import { getMyRoomStatus, joinEventRoom } from '@/app/data/event-room-service';
import type { EventRoomSelf, EventWithHost } from '@/app/types';

export interface EventRoomAccess {
  slug: string | undefined;
  event: EventWithHost | null;
  loading: boolean;
  /** True once a `session` exists — independent of `granted`, so the gate screen
   * can tell "signed in but not registered" apart from "signed out" and stop
   * offering a redundant Sign in control to someone already signed in. */
  isLoggedIn: boolean;
  /** true once the event has loaded, the caller is signed in, AND (registered —
   * event_rsvps holds a row for them — OR is the event's host). */
  granted: boolean;
}

export function useEventRoomAccess(): EventRoomAccess {
  const { slug } = useParams<{ slug: string }>();
  const { user, session } = useAuth();
  const isLoggedIn = !!session;

  const [event, setEvent] = useState<EventWithHost | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRegistered, setIsRegistered] = useState(false);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const found = await eventsService.getEventBySlug(slug);
      if (cancelled) return;
      setEvent(found);

      let registered = false;
      if (found && isLoggedIn && user) {
        try {
          registered = await eventsService.isUserRsvpd(found.id, user.id);
        } catch {
          // Registration check failed — degrade to not-registered (gate shows),
          // same pattern EventDetail.tsx already uses for this same call.
          registered = false;
        }
      }
      if (!cancelled) {
        setIsRegistered(registered);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug, isLoggedIn, user?.id]);

  const isHost = !!(event && user && event.hostId === user.id);
  return { slug, event, loading, isLoggedIn, granted: isLoggedIn && (isRegistered || isHost) };
}

export interface EventRoomSelfState {
  self: EventRoomSelf | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/** Auto-joins a granted (registered + signed-in) caller into the room the first time
 * they land on any of the three routes — passes straight through on a return visit,
 * per spec §3 ("passes straight through if already identified"). No name field: the
 * display name is always the signed-in profile's, per REVISED (2) removing the
 * name-only join screen entirely.
 *
 * `pendingKeyRef` closes a real race: `useEventRoomAccess`'s `loading` and `granted`
 * both flip on the SAME render (set together at the end of one async block), so a
 * consumer like EventRoomGate sees `granted: true` the instant it stops seeing
 * `loading: true` — but THIS hook's own effect (which reacts to `granted` becoming
 * true) hasn't run yet at that point; effects fire after paint. Without the ref, the
 * consumer reads this hook's `loading` from the render BEFORE that transition —
 * still `false` from the earlier "not granted yet" pass — and renders its decision
 * against a `self` that is `null` only because nothing has fetched it yet, not
 * because the visitor truly has no room row. Caught via a return-visit repro: a
 * visitor who set readiness, left, and came back to /room was redirected to /ready
 * again instead of /meet, even though readiness_value was correctly persisted. */
export function useEventRoomSelf(event: EventWithHost | null, granted: boolean): EventRoomSelfState {
  const { user } = useAuth();
  const [self, setSelf] = useState<EventRoomSelf | null>(null);
  const [loading, setLoading] = useState(true);
  // The (event, granted) pair the effect below has actually STARTED processing —
  // set synchronously as the effect's first act, independent of whether the async
  // work inside it has finished. Distinct from `loading`: `loading` answers "is a
  // load in flight," this answers "has the effect even run yet for the CURRENT
  // props" — the two go out of sync for exactly one render on a granted
  // false->true transition, which is the render this hook's `loading` return value
  // must not lie on.
  const startedKeyRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!event || !granted) return;
    const status = await getMyRoomStatus(event.id);
    if (status) {
      setSelf(status);
      return;
    }
    try {
      const joined = await joinEventRoom(event.id, user?.name || 'Guest');
      setSelf(joined);
    } catch {
      // Room closed/full — leave self null; callers degrade to their own frozen/error UI.
    }
  }, [event, granted, user?.name]);

  const currentKey = granted && event ? event.id : null;

  useEffect(() => {
    if (!event || !granted) {
      startedKeyRef.current = null;
      setLoading(false);
      return;
    }
    startedKeyRef.current = event.id;
    let cancelled = false;
    setLoading(true);
    (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is derived from the same [event, granted] pair
  }, [event, granted]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  // Render-time correction for the race described above: if this render's
  // (event, granted) says a load should be running for a key the effect hasn't
  // started on yet, report loading regardless of the `loading` state left over
  // from a prior render — once the effect HAS started (startedKeyRef matches),
  // defer to the real `loading` state, which correctly tracks in-flight vs done.
  const effectiveLoading = currentKey !== null && startedKeyRef.current !== currentKey ? true : loading;

  return { self, loading: effectiveLoading, refresh };
}
