/**
 * @file EventRoomPage.tsx
 * @description P1114: the event room. One component, mounted at three routes
 * (`/events/:slug/room`, `/ready`, `/meet` — Architecture Decision 7) and embedded
 * inline as EventDetail's "Clarity Meeting Principle" tab — never separate pages,
 * because the roster must stay visible the whole time (spec §3). `focus` only
 * decides initial scroll/expansion; every section always renders.
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
 * REVISED 2026-08-20 (see features/p1114_event_room_presence_and_cmp_opt_in.md,
 * Solution's REVISED block): the founder rejected the first UI on sight — it called
 * the feature "a room" when the thing a person actually does is review the Clarity
 * Meeting Principle and opt in. This build:
 *   - Renders one scroll, this order: readiness → the principle terms themselves →
 *     who opted in → opt in/opt out. Nothing renders below the buttons.
 *   - Never says "room" in user-facing copy.
 *   - Renders the principle's actual text via the shared `CertificateFrame` /
 *     `CertificateOathBody` (`@/app/components/agreements/certificate-frame`) and
 *     `sectionsForLevel` (`@/app/content/meeting-terms`) — the same document shell
 *     the standalone `/meet` page uses, at the same default rung (level 3, "Reveal
 *     the gap") — not a re-authored copy of the principle. The room has no level
 *     picker: level selection is a per-conversation `/meet` concept this spec does
 *     not extend to a group room.
 *   - The Present toggle lives in the page header, not the decision flow, so
 *     toggling it never adds anything below the opt-in buttons.
 *
 * COPY: every string marked `[FOUNDER DECISION]` in the spec's UI Contract renders
 * here as a VISIBLE `PLACEHOLDER: ...` marker (resolution strategy, 2026-08-19) —
 * never invented copy, never an empty string. The UI Contract table (approved
 * 2026-08-20) resolves most of these to real copy, used verbatim below. Anything
 * still not in that table (the self-status line, the not-found line) stays a
 * placeholder, per the resolution strategy's "any string NOT listed here" rule.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/auth';
import { Button } from '@/components/ui/button';
import { GuestOrAccountJoin } from '@/app/components/auth/guest-or-account-join';
import { SliderTrack } from '@/app/components/partners/slider-track';
import { PersonRow } from '@/app/components/shared/PersonRow';
import { CertificateFrame, CertificateOathBody } from '@/app/components/agreements/certificate-frame';
import { sectionsForLevel, type MeetingTermsLevel } from '@/app/content/meeting-terms';
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
const READINESS_QUESTION = 'How up for thinking are you right now?';
const READINESS_MIDPOINT_LABEL = 'Neutral';
const READINESS_MIDPOINT_VALUE = 5;
const READINESS_POLE_LABELS = { low: 'Keep it light', high: 'Go deep' };

// meeting-terms-page.tsx's own DEFAULT_LEVEL (3, "Reveal the gap") — reused rather
// than re-decided, since this spec introduces no room-specific level concept.
const PRINCIPLE_LEVEL: MeetingTermsLevel = 3;
const PRINCIPLE_TITLE = 'Clarity Meeting Principle';

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
  if (!event) return <div data-testid="room-page">PLACEHOLDER: event not found</div>;

  // Renders the whole non-roster decision flow. Split into two DOM regions — one
  // above the roster (readiness + principle), one below (the opt-in buttons) — so
  // the roster can sit physically BETWEEN them, matching the revised order (readiness
  // → principle → who opted in → buttons) while both regions still hide together
  // under Present mode. `room-controls` keeps its established test-id (P1114
  // e2e/p1114-event-room.spec.ts); `room-answer-controls` is new — deliberately
  // split out because "who opted in" now sits between the two.
  const showDecisionFlow = !present && isIdentified && !isFrozen;

  return (
    <div
      data-testid="room-page"
      data-room-focus={focus}
      className="mx-auto max-w-3xl px-4 py-10 sm:py-14"
    >
      {/* Header: page heading + Present toggle. Present is a per-device projection
          control, not part of the CMP decision flow — it lives here, above
          everything, so toggling it can never add anything below the opt-in
          buttons (revised spec: "the page ends here, on the decision"). */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold leading-snug text-foreground sm:text-2xl">
          Review the Clarity Meeting Principle
        </h1>
        <Button
          data-testid="room-present-toggle"
          aria-pressed={present}
          variant={present ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPresent((p) => !p)}
        >
          Project
        </Button>
      </div>

      {isFrozen && (
        <div data-testid="room-frozen-notice" className="mb-8 rounded-lg border border-border bg-muted p-4 text-sm">
          This has closed. Here&apos;s who opted in.
        </div>
      )}

      {actionError && (
        <p data-testid="room-action-error" role="status" className="mb-6 text-sm text-red-600">
          {actionError}
        </p>
      )}

      {/* Join screen — shown until identified. Not "controls" in the Present-hides
          sense (Present is a facilitator device state; joining is a different
          person's action), but still gated by !present for the same reason as the
          decision flow below: nothing interactive should render on a projected wall. */}
      {!present && !isIdentified && !isFrozen && (
        <div data-testid="room-join-form" className="mx-auto mb-10 w-full max-w-sm space-y-8">
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

      {/* 1. Readiness — 2. Clarity Meeting Principle, the terms themselves. */}
      {showDecisionFlow && (
        <div data-testid="room-controls" className="mb-10 space-y-10">
          <section data-focused={focus === 'ready'} className="space-y-4">
            <p className="text-center text-xl font-semibold leading-snug text-foreground sm:text-2xl">
              {READINESS_QUESTION}
            </p>
            <div className="pt-2">
              <SliderTrack
                value={readinessDraft}
                onChange={setReadinessDraft}
                onDebouncedChange={handleReadiness}
                showValue={false}
                ariaLabel={READINESS_QUESTION}
                midpointLabel={READINESS_MIDPOINT_LABEL}
                poleLabels={READINESS_POLE_LABELS}
                muted={!readinessTouched}
                bipolarFill
                expandedHitArea
              />
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Shown on the wall as a dot. Not labelled — but not anonymous either.
            </p>
          </section>

          <section data-focused={focus === 'principle'} className="space-y-4">
            <CertificateFrame
              ariaLabel={PRINCIPLE_TITLE}
              title={PRINCIPLE_TITLE}
              kicker="A commitment for this conversation"
              epigraph="We all crave being understood. Let's commit to listen."
            >
              <CertificateOathBody sections={sectionsForLevel(PRINCIPLE_LEVEL)} />
            </CertificateFrame>
            {user && (
              <p className="text-sm text-muted-foreground">
                Your organization runs on the Clarity Organization Terms. This is a separate yes.
              </p>
            )}
          </section>
        </div>
      )}

      {/* 3. Who opted in — the roster. Always visible (spec §3: "the roster must be
          visible the whole time"), regardless of join/frozen/present state — this is
          the ONE element every state shares. */}
      <div
        data-testid="room-roster"
        data-present={present ? 'true' : undefined}
        className={present ? 'mx-auto mb-10 w-full max-w-2xl space-y-4' : 'mb-10 space-y-4'}
      >
        <h2 className={present ? 'text-2xl font-semibold text-foreground' : 'text-lg font-semibold text-foreground'}>Who opted in</h2>
        {roster.length === 0 ? (
          <div data-testid="room-zero-state" className={present ? 'rounded-lg border border-dashed border-border py-10 text-center text-lg text-muted-foreground' : 'rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground'}>
            No one has opted in yet.
          </div>
        ) : (
          <div className="space-y-2">
            {roster.map((member) => (
              <div key={member.id} data-testid="room-roster-item">
                <PersonRow
                  profileId={member.profileId ?? member.id}
                  slug={member.profileSlug ?? ''}
                  name={member.displayName}
                  avatarColor={member.profileAvatarColor ?? '#3B82F6'}
                  avatarUrl={member.profileAvatarUrl}
                  isPledger={member.profileHasPledged}
                  earCount={member.profileEarCount}
                  // Walk-ins have no profile — linking them produces `/p/`, a dead end on
                  // every guest row, which is the common case on a projected roster.
                  linkToProfile={!!member.profileId}
                  // Present mode is for projecting on a wall — "enlarges names" (spec §8)
                  // means the roster rows themselves, not just their container width.
                  size={present ? 'lg' : 'sm'}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Opt in / Opt out — the page ends here. Nothing renders below this. */}
      {showDecisionFlow && (
        <div data-testid="room-answer-controls" className="space-y-4">
          <div
            data-testid="room-my-opt-in-status"
            data-opted-in={optInState}
            className="text-sm text-foreground"
          >
            {optInState === 'true' && 'PLACEHOLDER: opted-in status line'}
            {optInState === 'false' && 'PLACEHOLDER: opted-out status line'}
            {optInState === 'unanswered' && 'PLACEHOLDER: unanswered status line'}
          </div>
          {/* Opt in reads as the primary action by default (meeting-terms-page.tsx's
              P1024 UAT reversal: "an opt-out styled as secondary is not really an
              opt-out" was overridden in favor of one-primary-CTA hierarchy on the
              sibling /meet page) — an unanswered state with both buttons equal-weight
              would be the one thing this page and /meet disagree on for the identical
              decision. Once answered, the chosen answer is the one that's filled. */}
          <div className="flex gap-3">
            <Button data-testid="room-opt-in-yes" onClick={() => handleOptIn(true)} variant={self?.optedIn === false ? 'outline' : 'default'}>
              Opt in
            </Button>
            <Button data-testid="room-opt-in-no" onClick={() => handleOptIn(false)} variant={self?.optedIn === false ? 'default' : 'outline'}>
              Opt out
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
