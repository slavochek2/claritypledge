/**
 * @file EventRoomPage.tsx
 * @description P1114: the event room. One component, mounted at three routes
 * (`/events/:slug/room`, `/ready`, `/meet` — Architecture Decision 7), never three
 * pages, because the roster must stay visible the whole time (spec §3). `focus`
 * only decides initial scroll/expansion; every section always renders.
 *
 * COPY: every string marked `[FOUNDER DECISION]` in the spec's UI Contract renders
 * here as a VISIBLE `PLACEHOLDER: ...` marker (resolution strategy, 2026-08-19) —
 * never invented copy, never an empty string. The two resolved slots (guest field
 * label/placeholder, submit button, divider, account path) reuse `/live`'s shipped
 * wording verbatim (clarity-live-page.tsx ~4020-4055).
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GoogleAuthButton } from '@/app/components/auth/google-auth-button';
import { PersonRow } from '@/app/components/shared/PersonRow';
import { eventsService } from '@/app/data/events-service';
import { EVENT_GRACE_HOURS } from '@/app/data/events-service-real';
import {
  joinEventRoom,
  setRoomOptIn,
  setRoomReadiness,
  getMyRoomStatus,
  subscribeToRoomRoster,
} from '@/app/data/event-room-service';
import type { EventWithHost, EventRoomMember, EventRoomSelf } from '@/app/types';

export type EventRoomFocus = 'join' | 'ready' | 'principle';

interface StoredIdentity {
  memberId: string;
  clientSecret: string;
  displayName: string;
}

/** Decision 8: localStorage, not sessionStorage — a room spans an evening across
 * multiple tabs/devices (a phone and a projector), and a refresh must not eject
 * anyone mid-event. Naming follows meeting-terms-page.tsx's `cp.<feature>.<version>`
 * convention, deliberately a NEW key (not reused from /live's per-tab sessionStorage
 * keys — Decision 8's rationale). */
function storageKey(eventId: string): string {
  return `cp.event-room.${eventId}.v1`;
}

function readIdentity(eventId: string): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(storageKey(eventId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredIdentity>;
    if (!parsed.memberId || !parsed.clientSecret) return null;
    return parsed as StoredIdentity;
  } catch {
    return null;
  }
}

function writeIdentity(eventId: string, identity: StoredIdentity): void {
  try {
    localStorage.setItem(storageKey(eventId), JSON.stringify(identity));
  } catch {
    // localStorage unavailable (private mode, quota) — degrades to re-join every visit,
    // never an error. Nothing else in this component depends on the write succeeding.
  }
}

function clearIdentity(eventId: string): void {
  try {
    localStorage.removeItem(storageKey(eventId));
  } catch {
    // see writeIdentity
  }
}

export function EventRoomPage({ focus }: { focus: EventRoomFocus }) {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();

  const [event, setEvent] = useState<EventWithHost | null>(null);
  const [loading, setLoading] = useState(true);
  const [self, setSelf] = useState<EventRoomSelf | null>(null);
  const [roster, setRoster] = useState<EventRoomMember[]>([]);
  const [present, setPresent] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // ── Load event, then hydrate identity ────────────────────────────────────────

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      const found = await eventsService.getEventBySlug(slug);
      if (!cancelled) {
        setEvent(found);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!event) return;
    let cancelled = false;
    const stored = readIdentity(event.id);
    if (stored) {
      (async () => {
        const status = await getMyRoomStatus(stored.memberId, stored.clientSecret);
        if (cancelled) return;
        if (status) {
          setSelf(status);
        } else {
          // Lost/invalid secret (Security Review: "must degrade to rejoin with a new
          // name, never an error state"). Clear the stale key so the join form shows.
          clearIdentity(event.id);
        }
      })();
    } else if (user) {
      // Decision 8: signed-in caller auto-joins using their profile name (mirrors the
      // P396/P406 auto-join effect) — passes straight through, per spec §3.
      (async () => {
        try {
          const joined = await joinEventRoom(event.id, user.name || 'Guest');
          if (cancelled) return;
          writeIdentity(event.id, { memberId: joined.id, clientSecret: joined.clientSecret, displayName: joined.displayName });
          setSelf(joined);
        } catch {
          // Room closed/full — leave self null; the frozen/error-free UI states below handle it.
        }
      })();
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- event.id is the stable identity; user only matters on first hydrate
  }, [event?.id, user?.id]);

  // ── Roster: realtime + reconciliation poll (Decision 3) ─────────────────────

  useEffect(() => {
    if (!event) return;
    return subscribeToRoomRoster(event.id, setRoster);
  }, [event?.id]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleGuestJoin = useCallback(async () => {
    if (!event) return;
    const trimmed = guestName.trim();
    if (!trimmed) {
      setJoinError('Enter a name to join.');
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      const joined = await joinEventRoom(event.id, trimmed);
      writeIdentity(event.id, { memberId: joined.id, clientSecret: joined.clientSecret, displayName: joined.displayName });
      setSelf(joined);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Could not join this room.');
    } finally {
      setJoining(false);
    }
  }, [event, guestName]);

  // A silent no-op is indistinguishable from success to the person clicking. The frozen
  // and stale-secret cases are expected and self-explanatory once the UI reflects them,
  // but a network drop or 5xx must not look identical to "nothing happened".
  const [actionError, setActionError] = useState<string | null>(null);

  const handleOptIn = useCallback(async (value: boolean) => {
    if (!event || !self) return;
    setActionError(null);
    try {
      const updated = await setRoomOptIn(self.id, self.clientSecret, value);
      setSelf(updated);
    } catch {
      setNowMs(Date.now()); // re-evaluate the boundary: a rejection may mean the room just froze
      setActionError('PLACEHOLDER: could not save your answer — try again');
    }
  }, [event, self]);

  const handleReadiness = useCallback(async (value: number) => {
    if (!event || !self) return;
    setActionError(null);
    try {
      const updated = await setRoomReadiness(self.id, self.clientSecret, value);
      setSelf(updated);
    } catch {
      setNowMs(Date.now()); // see handleOptIn
      setActionError('PLACEHOLDER: could not save your readiness — try again');
    }
  }, [event, self]);

  // ── Derived state ─────────────────────────────────────────────────────────

  // Ticks so the freeze boundary is evaluated against wall-clock time, not against the
  // moment the page mounted. `event` is set once and never reassigned, so a useMemo keyed
  // on [event] evaluates Date.now() exactly once — a room left open across the boundary
  // (the NORMAL case for an evening event) would never flip to frozen, leaving the opt-in
  // and readiness controls rendered and clickable while the RPCs correctly reject them.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const isFrozen = useMemo(() => {
    if (!event) return false;
    return nowMs >= new Date(event.datetime).getTime() + EVENT_GRACE_HOURS * 60 * 60 * 1000;
  }, [event, nowMs]);

  const isIdentified = !!self;
  const optInState: 'true' | 'false' | 'unanswered' =
    self?.optedIn === true ? 'true' : self?.optedIn === false ? 'false' : 'unanswered';

  if (loading) return null;
  if (!event) return <div data-testid="room-page">This room could not be found.</div>;

  return (
    <div data-testid="room-page" data-room-focus={focus} className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {isFrozen && (
        <div data-testid="room-frozen-notice" className="rounded-lg border border-border bg-muted p-4 text-sm">
          PLACEHOLDER: frozen-room notice
        </div>
      )}

      <div className={present ? 'grid grid-cols-1 gap-8' : 'grid grid-cols-1 md:grid-cols-2 gap-8'}>
        {!present && (
          <div data-testid="room-controls" className="space-y-8">
            {actionError && (
              <p data-testid="room-action-error" role="status" className="text-sm text-red-600">
                {actionError}
              </p>
            )}
            {!isIdentified && !isFrozen && (
              <div data-testid="room-join-form" className="space-y-6">
                <h1 className="text-xl font-semibold">PLACEHOLDER: join screen heading</h1>

                <div className="space-y-3">
                  <GoogleAuthButton context="event-room" source="login" />
                  <div className="text-center">
                    <a href={`/login`} className="text-sm text-blue-600 hover:text-blue-700 underline underline-offset-2">
                      Log in with email
                    </a>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or join as guest</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="room-guest-name">What should we call you?</Label>
                  <Input
                    id="room-guest-name"
                    placeholder="Enter your name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    autoFocus
                  />
                </div>

                {joinError && <p className="text-sm text-red-600">{joinError}</p>}

                <Button onClick={handleGuestJoin} disabled={joining} className="w-full" size="lg">
                  {joining ? 'Joining…' : 'Join as Guest'}
                </Button>
              </div>
            )}

            {isIdentified && !isFrozen && (
              <div className="space-y-8">
                {/* Readiness section (focus="ready") */}
                <section data-focused={focus === 'ready'} className="space-y-3">
                  <h2 className="text-lg font-semibold">Readiness</h2>
                  <div className="flex gap-1 flex-wrap" role="group" aria-label="Readiness">
                    {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handleReadiness(n)}
                        aria-pressed={self?.readinessValue === n}
                        className={
                          'h-8 w-8 rounded-full border text-xs ' +
                          (self?.readinessValue === n ? 'bg-blue-500 text-white border-blue-500' : 'border-border')
                        }
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">PLACEHOLDER: readiness dot caption</p>
                </section>

                {/* Principle / opt-in section (focus="principle") */}
                <section data-focused={focus === 'principle'} className="space-y-3">
                  <h2 className="text-lg font-semibold">Clarity Meeting Principle</h2>
                  {user && (
                    <p className="text-sm text-muted-foreground">PLACEHOLDER: member pre-fill line</p>
                  )}
                  <div
                    data-testid="room-my-opt-in-status"
                    data-opted-in={optInState}
                    className="text-sm"
                  >
                    {optInState === 'true' && 'You are opted in.'}
                    {optInState === 'false' && 'You are opted out.'}
                    {optInState === 'unanswered' && 'You have not answered yet.'}
                  </div>
                  <div className="flex gap-3">
                    <Button data-testid="room-opt-in-yes" onClick={() => handleOptIn(true)} variant={self?.optedIn === true ? 'default' : 'outline'}>
                      Opt in
                    </Button>
                    <Button data-testid="room-opt-in-no" onClick={() => handleOptIn(false)} variant={self?.optedIn === false ? 'default' : 'outline'}>
                      Opt out
                    </Button>
                  </div>
                </section>
              </div>
            )}
          </div>
        )}

        {/* Roster — always visible (spec §3), opt-ins only, never opt-outs. */}
        <div
          data-testid="room-roster"
          data-present={present ? 'true' : undefined}
          className="space-y-3"
        >
          <h2 className="text-lg font-semibold">PLACEHOLDER: roster heading</h2>
          {roster.length === 0 ? (
            <div data-testid="room-zero-state" className="text-sm text-muted-foreground py-8 text-center">
              PLACEHOLDER: zero-state line
            </div>
          ) : (
            <div className="space-y-2">
              {roster.map((member) => (
                <div key={member.id} data-testid="room-roster-item">
                  <PersonRow
                    profileId={member.profileId ?? member.id}
                    slug={member.profileId ?? ''}
                    name={member.displayName}
                    avatarColor="#3B82F6"
                    // Walk-ins have no profile — linking them produces `/p/`, a dead end on
                    // every guest row, which is the common case on a projected roster.
                    linkToProfile={!!member.profileId}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Button
        data-testid="room-present-toggle"
        aria-pressed={present}
        variant="outline"
        onClick={() => setPresent((p) => !p)}
      >
        PLACEHOLDER: present toggle label
      </Button>
    </div>
  );
}
