/**
 * @file EventRoomAccess.tsx
 * @description P1114 rev2 — shared access check for the three room routes
 * (`/events/:slug/room`, `/ready`, `/meet`). Entry is gated by registration AND
 * sign-in (spec Solution, "REVISED (2)" block): `event_rsvps` is the room's gate,
 * reusing `eventsService.isUserRsvpd` rather than a second registration mechanism.
 *
 * The gate SCREEN itself (the four approved strings) lives in `EventRoomGate.tsx`,
 * not here — src/tests/p1114-room-composition.test.tsx reads that file's own source
 * for them verbatim. EventRoomReady and EventRoomMeet import it from there when
 * `useEventRoomAccess()` reports access is not granted — "the gate is the same wall
 * on every door," not decoration on one route.
 */
import { useParams } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth';
import { eventsService } from '@/app/data/events-service';
import { getMyRoomStatus, joinEventRoom } from '@/app/data/event-room-service';
import type { EventRoomSelf, EventWithHost } from '@/app/types';

export interface EventRoomAccess {
  slug: string | undefined;
  event: EventWithHost | null;
  loading: boolean;
  /** true once the event has loaded, the caller is signed in, AND registered
   * (event_rsvps holds a row for them). */
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

  return { slug, event, loading, granted: isLoggedIn && isRegistered };
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
 * name-only join screen entirely. */
export function useEventRoomSelf(event: EventWithHost | null, granted: boolean): EventRoomSelfState {
  const { user } = useAuth();
  const [self, setSelf] = useState<EventRoomSelf | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    if (!event || !granted) {
      setLoading(false);
      return;
    }
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

  return { self, loading, refresh };
}
