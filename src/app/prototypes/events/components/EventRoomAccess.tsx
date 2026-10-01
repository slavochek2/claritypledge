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
import { readThrough, rememberOffline } from '@/lib/offline-read-cache';
import { useConnectivity, useOfflinePageReport } from '@/app/contexts/offline-status-context';

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
  /** P1369 Scope v2: the access check could not reach the server and nothing is stored — the
   * room shows needs-connection, never the register wall (which would be a false statement). */
  offline: boolean;
}

export function useEventRoomAccess(): EventRoomAccess {
  const { slug } = useParams<{ slug: string }>();
  const { user, session } = useAuth();
  const isLoggedIn = !!session;
  // The signed-in id comes from the session, not the profile: offline the profile read fails and
  // `user` stays null, while the session (and so the viewer's cached access) is still there.
  const viewerId = session?.user?.id ?? user?.id ?? null;

  const [event, setEvent] = useState<EventWithHost | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRegistered, setIsRegistered] = useState(false);
  // P1369 Scope v2: the last-seen access (event + registration) is kept offline, per viewer.
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  useOfflinePageReport(cachedAt === null ? null : { kind: 'cached', storedAt: cachedAt });
  const { reconnectTick } = useConnectivity();
  const reconnectKey = cachedAt !== null || offline ? reconnectTick : 0;

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const userId = isLoggedIn ? viewerId : null;
      const read = await readThrough('event-access', slug, async () => {
        const found = await eventsService.getEventBySlug(slug);
        if (!found) return null;
        let registered = false;
        if (userId) {
          try {
            registered = await eventsService.isUserRsvpd(found.id, userId);
          } catch {
            // Registration check failed — degrade to not-registered (gate shows),
            // same pattern EventDetail.tsx already uses for this same call.
            registered = false;
          }
        }
        return { event: found, registered };
      }, { viewerId: userId });
      if (cancelled) return;
      if (read.source === 'offline') {
        setOffline(true);
        setCachedAt(null);
        setLoading(false);
        return;
      }
      setOffline(false);
      setCachedAt(read.source === 'cache' ? read.storedAt : null);
      setEvent(read.data?.event ?? null);
      setIsRegistered(read.data?.registered ?? false);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug, isLoggedIn, viewerId, reconnectKey]);

  const isHost = !!(event && viewerId && event.hostId === viewerId);
  return { slug, event, loading, isLoggedIn, granted: isLoggedIn && (isRegistered || isHost), offline };
}

export interface EventRoomSelfState {
  self: EventRoomSelf | null;
  loading: boolean;
  /** Resolves true when the server answered, false when the read failed. */
  refresh: () => Promise<boolean>;
  /** Run one of this person's writes and adopt the row it returns, then re-read (see the
   * ordering rules in the hook). Rejects when the write fails. */
  runSelfWrite: (write: () => Promise<EventRoomSelf>) => Promise<void>;
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
  const { user, session } = useAuth();
  const viewerId = session?.user?.id ?? user?.id ?? '-';
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
  // P1369: storedAt of a last-seen row on screen (null = live), reported to the strip.
  const [selfCachedAt, setSelfCachedAt] = useState<number | null>(null);
  useOfflinePageReport(selfCachedAt === null ? null : { kind: 'cached', storedAt: selfCachedAt });

  /**
   * Ordering of `self` (2026-09-18 adversarial review, three rounds). The room page refreshes
   * `self` on every roster event, so reads and this person's own writes are in flight together
   * and resolve out of order — and a client cannot tell which response reflects the newer
   * DATABASE state from when it sent or received it. So the rules do not guess:
   *   1. A write's returned row is authoritative over every read that was already sent while
   *      it was in flight (those may have snapshotted the pre-write row): when the write
   *      resolves, all reads issued so far are fenced off.
   *   2. Every write is followed by one fresh read, sent after it resolved — so a newer
   *      state from elsewhere (the same person on a second device) still wins, one round
   *      trip later.
   *   3. Among reads, a response applies only if it was sent after the last applied one.
   *      A FAILED read applies nothing and fences nothing.
   *   4. Everything is scoped to the current event: a response for another event, or from
   *      before an event switch, is dropped.
   */
  const issuedRef = useRef(0);
  const appliedRef = useRef(0);
  const eventIdRef = useRef<string | null>(null);
  eventIdRef.current = granted && event ? event.id : null;

  const offer = useCallback((ticket: number, row: EventRoomSelf) => {
    if (row.eventId !== eventIdRef.current) return;
    if (ticket <= appliedRef.current) return;
    appliedRef.current = ticket;
    setSelf(row);
  }, []);

  /** One read. Resolves true when the server answered (applied, or superseded by something
   * newer), false when the read FAILED — so a caller can tell "reconciled" from "unknown". */
  const load = useCallback(async (): Promise<boolean> => {
    if (!event || !granted) return false;
    const ticket = ++issuedRef.current;
    // P1369 Scope v2: the last-seen row is kept offline; offline, no join is attempted.
    const read = await readThrough('event-self', event.id, () => getMyRoomStatus(event.id), {
      viewerId: viewerId === '-' ? null : viewerId,
    });
    if (read.source === 'offline') return false;
    if (read.source === 'cache') {
      offer(ticket, read.data);
      setSelfCachedAt(read.storedAt);
      return false; // not reconciled with the server
    }
    setSelfCachedAt(null);
    const status = read.data;
    if (status) {
      offer(ticket, status);
      return true;
    }
    try {
      // join_event_room upserts and never resets an existing answer, so this also recovers
      // the row when the status read itself failed.
      const joined = await joinEventRoom(event.id, user?.name || 'Guest');
      offer(ticket, joined);
      // P1369 Scope v2 item 5: a first visit's check-in (the row the join just created) is the
      // last-seen state too — without this, only a SECOND visit left anything to show offline.
      void rememberOffline('event-self', event.id, joined);
      return true;
    } catch {
      // Room closed/full, or unreachable — leave self as it is; callers degrade.
      return false;
    }
  }, [event, granted, user?.name, viewerId, offer]);

  const currentKey = granted && event ? event.id : null;

  useEffect(() => {
    if (!event || !granted) {
      startedKeyRef.current = null;
      setLoading(false);
      return;
    }
    if (startedKeyRef.current !== event.id) setSelf(null); // another event's row must never show here
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

  const refresh = useCallback(() => load(), [load]);

  /** Runs one of this person's writes (rules 1 and 2 above). Rejects when the write fails,
   * with nothing applied. */
  const runSelfWrite = useCallback(async (write: () => Promise<EventRoomSelf>) => {
    const row = await write();
    const fence = ++issuedRef.current; // newer than every read sent so far
    offer(fence, row);
    void load();
  }, [offer, load]);

  // Render-time correction for the race described above: if this render's
  // (event, granted) says a load should be running for a key the effect hasn't
  // started on yet, report loading regardless of the `loading` state left over
  // from a prior render — once the effect HAS started (startedKeyRef matches),
  // defer to the real `loading` state, which correctly tracks in-flight vs done.
  const effectiveLoading = currentKey !== null && startedKeyRef.current !== currentKey ? true : loading;

  return { self, loading: effectiveLoading, refresh, runSelfWrite };
}
