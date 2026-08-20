/**
 * @file EventRoomPage.tsx
 * @description P1114: the event room. One component, mounted at three routes
 * (`/events/:slug/room`, `/ready`, `/meet` — Architecture Decision 7), never three
 * pages, because the roster must stay visible the whole time (spec §3). `focus`
 * only decides initial scroll/expansion; every section always renders.
 *
 * REUSE, NOT REINVENTION (2026-08-20): an earlier version of this page rendered its
 * own eleven-button 0-10 grid and its own inline guest-join markup — reinventions of
 * two controls that already ship elsewhere (`/ready`'s `SliderTrack`, `/live`'s guest
 * join form). The founder rejected that build. This version imports both instead:
 * `SliderTrack` (`@/app/components/partners/slider-track`, same anchor labels as
 * `ready-page.tsx`) for readiness, and `GuestOrAccountJoin`
 * (`@/app/components/auth/guest-or-account-join`, extracted from `clarity-live-page.tsx`
 * in the same pass) for the join screen. `src/tests/p1114-shared-component-reuse.test.tsx`
 * is the mechanical guard against a second copy appearing.
 *
 * COPY: every string marked `[FOUNDER DECISION]` in the spec's UI Contract renders
 * here as a VISIBLE `PLACEHOLDER: ...` marker (resolution strategy, 2026-08-19) —
 * never invented copy, never an empty string. The two resolved slots (guest field
 * label/placeholder, submit button, divider, account path) reuse `/live`'s shipped
 * wording verbatim, now via the shared `GuestOrAccountJoin` component.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/auth';
import { Button } from '@/components/ui/button';
import { GuestOrAccountJoin } from '@/app/components/auth/guest-or-account-join';
import { SliderTrack } from '@/app/components/partners/slider-track';
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

// Same anchor labels as ready-page.tsx (P1077) — the room's readiness question is the
// same question, so it must look and read like the same control, not a lookalike.
const READINESS_MIDPOINT_LABEL = 'Neutral';
const READINESS_MIDPOINT_VALUE = 5;
const READINESS_POLE_LABELS = { low: 'Keep it light', high: 'Go deep' };

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

  // Local slider draft: mirrors ready-page.tsx's own [value, touched] pair, but backed
  // by `self.readinessValue` (this room's stored answer) instead of local-only state.
  // onChange (every pointermove) only updates the draft; onDebouncedChange (300ms,
  // SliderTrack's own built-in debounce — see its docstring) is what actually calls
  // setRoomReadiness. A raw onChange->RPC wire would fire one write per pointermove.
  const [readinessDraft, setReadinessDraft] = useState(READINESS_MIDPOINT_VALUE);
  useEffect(() => {
    if (self?.readinessValue != null) setReadinessDraft(self.readinessValue);
  }, [self?.readinessValue]);
  const readinessTouched = self?.readinessValue != null;

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
    <div
      data-testid="room-page"
      data-room-focus={focus}
      className="mx-auto max-w-3xl px-4 py-10 sm:py-14"
    >
      {isFrozen && (
        <div data-testid="room-frozen-notice" className="mb-8 rounded-lg border border-border bg-muted p-4 text-sm">
          PLACEHOLDER: frozen-room notice
        </div>
      )}

      <div className={present ? 'grid grid-cols-1 gap-10' : 'grid grid-cols-1 gap-10 md:grid-cols-2 md:items-start'}>
        {!present && (
          <div data-testid="room-controls" className="space-y-8">
            {actionError && (
              <p data-testid="room-action-error" role="status" className="text-sm text-red-600">
                {actionError}
              </p>
            )}
            {!isIdentified && !isFrozen && (
              <div data-testid="room-join-form" className="mx-auto w-full max-w-sm space-y-8">
                <h1 className="text-center text-xl font-semibold leading-snug text-foreground sm:text-2xl">
                  PLACEHOLDER: join screen heading
                </h1>

                <GuestOrAccountJoin
                  name={guestName}
                  onNameChange={setGuestName}
                  onGuestSubmit={handleGuestJoin}
                  submitting={joining}
                  error={joinError}
                  googleContext="event-room"
                  loginHref="/login"
                />
              </div>
            )}

            {isIdentified && !isFrozen && (
              <div className="space-y-10">
                {/* Readiness section (focus="ready") */}
                <section data-focused={focus === 'ready'} className="space-y-4">
                  <h2 className="text-lg font-semibold text-foreground">Readiness</h2>
                  <div className="pt-2">
                    <SliderTrack
                      value={readinessDraft}
                      onChange={setReadinessDraft}
                      onDebouncedChange={handleReadiness}
                      showValue={false}
                      ariaLabel="Readiness"
                      midpointLabel={READINESS_MIDPOINT_LABEL}
                      poleLabels={READINESS_POLE_LABELS}
                      muted={!readinessTouched}
                      bipolarFill
                      expandedHitArea
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">PLACEHOLDER: readiness dot caption</p>
                </section>

                {/* Principle / opt-in section (focus="principle") */}
                <section data-focused={focus === 'principle'} className="space-y-4">
                  <h2 className="text-lg font-semibold text-foreground">Clarity Meeting Principle</h2>
                  {user && (
                    <p className="text-sm text-muted-foreground">PLACEHOLDER: member pre-fill line</p>
                  )}
                  <div
                    data-testid="room-my-opt-in-status"
                    data-opted-in={optInState}
                    className="text-sm text-foreground"
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
          className={present ? 'mx-auto w-full max-w-2xl space-y-4' : 'space-y-4'}
        >
          <h2 className="text-lg font-semibold text-foreground">PLACEHOLDER: roster heading</h2>
          {roster.length === 0 ? (
            <div data-testid="room-zero-state" className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
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

      <div className="mt-10 flex justify-center">
        <Button
          data-testid="room-present-toggle"
          aria-pressed={present}
          variant="outline"
          onClick={() => setPresent((p) => !p)}
        >
          PLACEHOLDER: present toggle label
        </Button>
      </div>
    </div>
  );
}
