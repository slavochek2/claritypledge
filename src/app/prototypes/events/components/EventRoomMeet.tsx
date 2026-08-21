/**
 * @file EventRoomMeet.tsx
 * @description P1114 rev2 — `/events/:slug/meet`. The shipped `/meet` composition
 * (meeting-terms-page.tsx): the certificate scrolls under a fixed bottom bar carrying
 * the decision. Level stays 3 ("Reveal the gap"); the room has no level picker.
 *
 * NO level track (2026-08-21 round 3, founder: "this top thing where you say, you may ask,
 * reveal the gap, explain, delete... it's good to have within /meet on the general page of
 * /meet, but not within the event"). A round-1 blind review had argued the opposite — that
 * its absence made the page read as a bespoke document rather than as /meet — and it was
 * portaled into the shared nav slot on that basis. The founder's call overrides it: the
 * track is `locked` here, so it was three inert labels at the top of a projected screen.
 * Do not reinstate it for "consistency with /meet".
 *
 * Back button (2026-08-21 founder repro): always goes to /ready, unconditionally — unlike
 * the general /meet's FocusHeader (only shown when arrived via `fromReady` state), the
 * room has no legitimate way to reach /meet without readiness already meaning something.
 * Its visible label is bare "Back" ("simplify, call it back everywhere", round 3); the
 * destination stays in the aria-label.
 *
 * Public roster (2026-08-21, decisions.md): every room member is visible by name, grouped
 * by answer, not just the opted-in ones. Reverses the original Decision 2. This also fixes
 * "the roster doesn't update without a refresh": that symptom was the same RLS filter
 * silently dropping realtime delivery for any transition into a hidden state, not a
 * separate bug — see 20260821120000_p1114_public_roster_reversal.sql.
 *
 * ─── THE BAR IS THE SHIPPED /meet'S THREE STEPS (2026-08-21 round 2) ──────────────────
 *
 * The founder annotated the previous build "ugly!" over a single bar that stacked a status
 * line, a question, 11 rating buttons and 2 decision buttons at once, and annotated the
 * shipped /meet's equivalents "this is nice and simple!" (the two-button bar), "lets reuse
 * same component, content and behaviour please for event room!" (the rating card), and "i
 * like this design much better" (the answered bar). So the room now runs the SAME three
 * steps, in the same order, from the same components:
 *
 *   1. choosing — Opt in / Opt out, nothing else. Neither is pre-selected, neither is
 *      disabled. This is the step the founder called simple.
 *   2. rating   — the shared ComprehensionRatingCard, docked over the still-visible
 *      certificate, asking meeting-terms-page's own UNDERSTANDING_QUESTION. Its Submit is
 *      what actually writes. The card is the ONLY thing in the bar at this step: no status
 *      line above it, no cancel below it (both deleted by the founder in round 3).
 *   3. answered — "You opted in" / "You opted out" + "Change your choice" (founder's exact
 *      labels, replacing the shipped page's "Accepted…" / "End meeting").
 *
 * The rating still gates BOTH answers (founder, 2026-08-21: "require for both"). What
 * changed is WHEN it is asked, not WHETHER: the answer is now chosen first and committed by
 * the rating, rather than the rating unlocking the answer.
 *
 * DO NOT re-justify this ordering by citing meeting-terms-page.tsx's lines about asking the
 * number after the answer ("a low number reads as refusal…"). That argument rests on that
 * page writing NOTHING anywhere — the number stays between two people in a room. Here the
 * number is persisted AND published next to the person's name, which reintroduces exactly
 * the inflation pressure the ordering was meant to remove (adversarial review, 2026-08-21).
 * The ordering is here because the founder asked for this shape, and that is the whole of
 * the reason. If publication of the number is ever revisited, revisit this with it.
 *
 * Consequence, accepted deliberately: between step 1 and step 2 the person has tapped
 * "Opt in" but nothing is written, so the projected roster still lists them Undecided until
 * they submit a number. That is correct rather than a lag — an answer without a rating is
 * not a complete answer under "require for both", and the roster showing an incomplete
 * answer as incomplete is the honest render. It is also why the status element stays
 * mounted through all three steps — hidden but readable during the rating step, since its
 * `data-opted-in` is the only proof available that nothing has been written yet.
 *
 * Bottom-bar height is MEASURED, not a static pb-N: the bar's height differs by several
 * times between steps, and a fixed padding sized for one clips the last roster row under
 * another. Same ResizeObserver-on-ref pattern as meeting-terms-page.tsx's own rating bar.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth';
import {
  CertificateFrame,
  CertificateOathBody,
} from '@/app/components/agreements/certificate-frame';
import { ComprehensionRatingCard } from '@/app/components/shared/comprehension-rating-card';
import { FixedBottomBar } from '@/app/components/shared/fixed-bottom-bar';
import { PersonRow } from '@/app/components/shared/PersonRow';
import { sectionsForLevel, type MeetingTermsLevel } from '@/app/content/meeting-terms';
import {
  PRIMARY_BUTTON_CLASS,
  ANSWER_BUTTON_CLASS,
  BAR_FADE_CLASS,
  BAR_INNER_CLASS,
  UNDERSTANDING_QUESTION,
} from '@/app/pages/meeting-terms-page';
import { setRoomOptIn, resetRoomAnswer, subscribeToRoomRoster } from '@/app/data/event-room-service';
import { EVENT_GRACE_HOURS } from '@/app/data/events-service-real';
import { EventRoomGateScreen } from './EventRoomGate';
import { useEventRoomAccess, useEventRoomSelf } from './EventRoomAccess';
import { PracticeRooms } from './PracticeRooms';
import type { EventRoomMember } from '@/app/types';

const PRINCIPLE_LEVEL: MeetingTermsLevel = 3;
const PRINCIPLE_TITLE = 'Clarity Meeting Principle';

/**
 * Three columns from `min-[1600px]`, not `xl` (1280px) — round 4, founder: "the clarity
 * meeting principle is now not the main thing, but it should be the main thing… the drawer
 * and the action, the CTAs, they have to be in the middle… otherwise it's too weird to see
 * CTA shifted left." The certificate sits on the PAGE's centre line (column 2), the roster
 * is a narrow right-margin card (column 3, capped below), and column 1 is an empty spacer —
 * matching column 3's `minmax(0,1fr)` share so the certificate centres in the viewport
 * rather than merely in the content left of a wide roster.
 *
 * `min-[1600px]` is derived, not guessed, from the layout's own numbers: cert(42rem=672px)
 * + 2 gaps(2×4rem=128px) + 2×roster-cap(2×22rem=704px) + page padding(2×2rem=64px) = 1568px
 * is the exact viewport where both flanking columns first reach a full 22rem each; 1600
 * rounds that up for a small safety margin. Below that point the two-way split still gives
 * the roster LESS than 22rem (its cap is a ceiling, not a floor), which visual QA caught
 * squeezing the roster row into an avatar/badge/rating-text collision at 1400–1440px — the
 * same overflow class already documented below 320px on the OLD two-column geometry, just
 * reached from the desktop end this time. Below 1600: unchanged single stacked column.
 *
 * gap-16 (4rem) clears the certificate's own `shadow-[0_20px_60px_-15px]`, which extends
 * roughly 60px sideways and would otherwise bleed under the first roster rows. Both flanking
 * columns are `minmax(0,1fr)`, NOT bare `1fr` — bare `1fr` is shorthand for
 * `minmax(auto,1fr)`, so its minimum is the CONTENT's min-content width, not 0. A bare `1fr`
 * column 3 blows out past its fair share to fit the roster's content while empty column 1
 * shrinks to compensate, visibly un-centring the certificate (visual QA, round 4
 * verification pass — this is what a `minmax(0,1fr)` breakpoint recheck actually caught,
 * distinct from the squeeze issue above). `minmax(0,…)` pins the minimum to 0 so both
 * flanking tracks split remaining space equally regardless of content, and the roster's own
 * `max-w-[22rem]` handles sizing within its track.
 */
// Built ON the shipped page's BAR_INNER_CLASS rather than restating its value, so the
// mobile/tablet measure the two surfaces share stays one string. `max-w-7xl` (1280px) is
// dropped at this breakpoint — capping the container at 1280 would re-create the exact
// squeeze this breakpoint move exists to avoid.
const PAGE_CONTAINER = cn(BAR_INNER_CLASS, 'min-[1600px]:max-w-none min-[1600px]:px-8');
const THREE_COLUMN =
  'min-[1600px]:grid min-[1600px]:grid-cols-[minmax(0,1fr)_minmax(0,42rem)_minmax(0,1fr)] min-[1600px]:gap-16 min-[1600px]:items-start';
/** Column 3's cap — without it the roster grows to fill its whole `1fr` track instead of
 * reading as a narrow margin card. */
const ROSTER_COLUMN_CLASS = 'min-[1600px]:max-w-[22rem]';

/** One roster row: PersonRow plus what that person answered, spelled out rather than
 * abbreviated — founder, 2026-08-21: "put here what they answered e.g. 'understood at
 * 4/10'". Undecided members never carry a rating (it is required at answer time), so this
 * only ever appears on an opted-in / opted-out row. */
function RosterRow({ member }: { member: EventRoomMember }) {
  return (
    <PersonRow
      profileId={member.profileId ?? member.id}
      slug={member.profileSlug ?? ''}
      name={member.displayName}
      avatarColor={member.profileAvatarColor ?? '#3B82F6'}
      avatarUrl={member.profileAvatarUrl}
      isPledger={member.profileHasPledged}
      earCount={member.profileEarCount}
      linkToProfile={!!member.profileId}
      // Through PersonRow's own trailing slot, NOT as a sibling beside it: rendered
      // alongside, the text landed outside the row card's border and read as a stray label
      // floating in the gutter (visual QA, 2026-08-21). PersonRow's name column is
      // `flex-1 min-w-0`, so it yields to this rather than pushing it off-screen.
      trailing={
        member.comprehensionRating != null ? (
          <span
            data-testid="room-roster-rating"
            // whitespace-nowrap: letting "understood at" wrap above the number would turn
            // every answered row into a two-line row.
            className="shrink-0 whitespace-nowrap text-xs text-muted-foreground"
          >
            {/* The words are dropped below sm, the number never is. At 320px the full
                phrase is ~110px of a ~290px row and truncated names down to a single
                letter — "A…", "J…" (visual QA, 2026-08-21); at 375px they were still
                cutting at ~8 characters. Names are the primary content of a roster a
                facilitator reads off a wall, so they get the width back. Nothing is lost:
                the group heading directly above already says opted in or opted out, which
                is the only thing "understood at" was disambiguating. */}
            <span className="hidden sm:inline">understood at </span>
            {member.comprehensionRating}/10
          </span>
        ) : undefined
      }
    />
  );
}

/** Renders nothing when the group is empty — founder, 2026-08-21 round 3: "hide groups that
 * have 0, no need to count totals, not needed". Round 4 reverses the second half of that:
 * the roster is now a card that reads like `EventDetail.tsx`'s Participants card, which
 * always carries a count, and the founder asked for it again this round — headings now read
 * "Opted in (2)". The empty-group hide stays; only the "(N)" omission is reversed.
 *
 * The blank-roster case this could produce is covered one level up, NOT here: a group that
 * knows only about itself cannot tell "nobody is undecided" (worth saying) from "the whole
 * roster failed to load" (must never render as silence). See the caller. */
function RosterGroup({ title, testId, members }: { title: string; testId: string; members: EventRoomMember[] }) {
  if (members.length === 0) return null;
  return (
    <div data-testid={testId} className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title} ({members.length})</h3>
      <div className="space-y-2">
        {members.map((member) => (
          <div key={member.id} data-testid="room-roster-item">
            <RosterRow member={member} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EventRoomMeet() {
  const { slug, event, loading, granted, isLoggedIn } = useEventRoomAccess();
  const { self, loading: selfLoading, refresh } = useEventRoomSelf(event, granted);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [roster, setRoster] = useState<EventRoomMember[]>([]);
  /** Which answer the person has chosen but not yet committed with a number. Local, never
   * server state — nothing is written until the rating card's Submit. */
  const [pendingAnswer, setPendingAnswer] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [writeFailed, setWriteFailed] = useState(false);
  /**
   * Synchronous in-flight latch. `submitting` drives the DISABLED styling, but it cannot
   * be the guard: it is React state, so two taps dispatched in the same frame both read
   * `false` before either re-render lands, and both proceed. The card's own
   * `disabled={submitting}` has the identical one-frame window.
   *
   * That window is not cosmetic here — every set_room_opt_in call INSERTs a row into
   * event_room_answers with a cascade count (migration 20260821120000), so a double tap
   * writes two history rows into the table the spec's research question reads. A ref flips
   * synchronously on the first call and closes it.
   */
  const inFlight = useRef(false);

  // Measured bottom-bar height (see file doc comment) — same pattern as
  // meeting-terms-page.tsx's ratingBarHeight.
  const [barHeight, setBarHeight] = useState(0);
  const barObserver = useRef<ResizeObserver | null>(null);
  const setBarRef = useCallback((node: HTMLDivElement | null) => {
    barObserver.current?.disconnect();
    barObserver.current = null;
    if (!node) {
      setBarHeight(0);
      return;
    }
    setBarHeight(node.getBoundingClientRect().height);
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(([entry]) => {
        setBarHeight(entry.target.getBoundingClientRect().height);
      });
      observer.observe(node);
      barObserver.current = observer;
    }
  }, []);
  useEffect(() => () => barObserver.current?.disconnect(), []);

  // `self` is only ever refetched by this component's own write handlers, so without this
  // it goes stale the moment the SAME PERSON answers anywhere else — a second device, or
  // this tab left open while they answered on their phone. The roster would show them
  // under "Opted in" while their own bar still read "You have not answered yet.", and
  // answering again would INSERT a second row into event_room_answers (adversarial code
  // review, 2026-08-21). Refreshing self alongside the roster keeps one source of truth
  // rather than reconciling two that can disagree.
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    if (!event) return;
    return subscribeToRoomRoster(event.id, (next) => {
      setRoster(next);
      void refreshRef.current();
    });
  }, [event?.id]);

  const handleSubmitRating = useCallback(async (rating: number) => {
    if (!self || pendingAnswer === null || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setWriteFailed(false);
    try {
      await setRoomOptIn(self.id, pendingAnswer, rating);
      await refresh();
      setPendingAnswer(null);
    } catch {
      // The freeze boundary, a transient failure, or the RPC's own null-rating guard
      // rejected the write. Drop back to `choosing` rather than leaving the person parked
      // on a card that says they are confirming an opt-in which was never recorded — the
      // screen must not claim a state the server does not hold (adversarial review,
      // 2026-08-21). `writeFailed` says so out loud, because silently rewinding a step
      // reads as the tap having been missed.
      setPendingAnswer(null);
      setWriteFailed(true);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, [self, pendingAnswer, refresh]);

  const handleChangeChoice = useCallback(async () => {
    // Same latch as handleSubmitRating, and SHARED with it rather than a second one: the
    // two must not be able to run concurrently either. reset_room_answer writes no history
    // row, but a reset racing a submit would still leave the local step and the server
    // answer disagreeing about which one landed last.
    if (!self || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setWriteFailed(false);
    try {
      await resetRoomAnswer(self.id);
      await refresh();
      setPendingAnswer(null);
    } catch {
      setWriteFailed(true);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, [self, refresh]);

  if (loading || (granted && selfLoading)) return null;
  if (!granted) {
    return <EventRoomGateScreen slug={slug} isLoggedIn={isLoggedIn} />;
  }

  const isFrozen = event
    ? Date.now() >= new Date(event.datetime).getTime() + EVENT_GRACE_HOURS * 60 * 60 * 1000
    : false;

  const inMembers = roster.filter((m) => m.optedIn === true);
  const outMembers = roster.filter((m) => m.optedIn === false);
  const undecidedMembers = roster.filter((m) => m.optedIn == null);

  // Server state wins over the local pending answer: a refresh that lands an answer — this
  // tab's own write, or the same person answering on another device, which now reaches
  // here because `self` refreshes with the roster (see above) — must not leave a stale
  // rating card up.
  const answered = self?.optedIn != null;
  const step: 'choosing' | 'rating' | 'answered' =
    answered ? 'answered' : pendingAnswer === null ? 'choosing' : 'rating';

  /**
   * Empty during the rating step, on the founder's instruction (2026-08-21): the card
   * already says what to do, and a line above it narrating "Opting in — give a number to
   * confirm" restated the obvious directly under the two buttons that had just been
   * tapped. The element itself stays mounted in every step regardless — see the render.
   */
  const statusText =
    step === 'answered'
      ? self?.optedIn
        ? 'You opted in'
        : 'You opted out'
      : step === 'rating'
        ? ''
        : 'You have not answered yet.';

  return (
    // Padding is MEASURED (barHeight), not a static class — see the file doc comment.
    <div data-testid="room-meet" style={barHeight > 0 ? { paddingBottom: barHeight + 16 } : undefined}>
      {/* No level stepper here. The shipped /meet shows "You may ask / Reveal the gap /
          Explain back" because a visitor arriving there is choosing a level and needs to
          see where they are in that ladder. Inside an event room there is no ladder: the
          level is fixed at 3, the track is rendered `locked`, and every tap on it is a
          no-op — three inert labels occupying the top of a projected screen. Removed on
          the founder's instruction, 2026-08-21: keep it on the general page, hide it in
          the room. Do not reinstate it as "consistency with /meet" — the two pages are
          consistent in the parts a person can act on, which this is not. */}
      <h1 className="sr-only">{PRINCIPLE_TITLE}</h1>

      {/* Page chrome sits above the columns, at the container's own left edge, rather than
          inside the certificate column — so it does not shift sideways when the layout
          splits into three at min-[1600px]. */}
      <div className={cn(PAGE_CONTAINER, 'pt-4')}>
        <FocusHeader
          onBack={() => navigate(`/events/${slug}/ready`)}
          label="Back"
          aria-label="Back to readiness"
        />
      </div>

      <div className={cn(PAGE_CONTAINER, THREE_COLUMN, 'pt-4')}>
        {/* Column 1 — empty spacer. Its only job is to be the same `1fr` share as column 3
            so column 2 (the certificate) lands on the page's centre line rather than merely
            centred in the space left of a wide roster. */}
        <div aria-hidden="true" className="hidden min-[1600px]:block" />

        <div className="space-y-4">
          <CertificateFrame
            ariaLabel={PRINCIPLE_TITLE}
            title={PRINCIPLE_TITLE}
            kicker="A commitment for this conversation"
            epigraph="We all crave being understood. Let's commit to listen."
          >
            <CertificateOathBody sections={sectionsForLevel(PRINCIPLE_LEVEL)} />
          </CertificateFrame>

          {isFrozen && (
            <div data-testid="room-frozen-notice" className="rounded-lg border border-border bg-muted p-4 text-sm">
              This has closed. Here&apos;s who opted in.
            </div>
          )}
        </div>

        {/* Not `sticky`: with forty attendees this column is taller than the viewport, and a
            sticky element taller than the viewport pins its top and puts its own bottom
            permanently out of reach — there is no second scroll container to recover it
            (adversarial review, 2026-08-21). The whole page scrolls instead, which is also
            what the fixed decision bar already assumes. */}
        <div className={cn('mt-6 space-y-6 min-[1600px]:mt-0', ROSTER_COLUMN_CLASS)}>
          {/* Roster card — matches EventDetail.tsx's Participants card (`bg-card
              rounded-xl border border-border shadow-sm p-6`), round 4: the roster reads as
              a right-margin card, not a co-equal column. */}
          <div data-testid="room-roster" className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-6">
            {roster.length === 0 ? (
              /* The one case a per-group empty state cannot express. `getRoomRoster` returns
                 [] on ANY failure and the 30s reconciliation poll pushes that [] through
                 unconditionally, so this branch covers a transient fetch failure as well as
                 the pre-first-paint moment — and the spec's Risks require this to degrade to
                 readable text, "never an error state or an empty wall". With every group
                 hiding itself when empty, without this the section would render as nothing
                 at all. */
              <p className="text-sm text-muted-foreground">Loading who is here…</p>
            ) : (
              <>
                <RosterGroup title="Opted in" testId="room-roster-in" members={inMembers} />
                <RosterGroup title="Opted out" testId="room-roster-out" members={outMembers} />
                <RosterGroup title="Undecided" testId="room-roster-undecided" members={undecidedMembers} />
                {undecidedMembers.length === 0 && (
                  /* Empty-Undecided is the payoff of this whole feature, not a nothing —
                     it is the moment the facilitator's "move yourself out of undecided" has
                     landed for everyone. Hiding the group per the founder's instruction and
                     saying nothing would render that moment as a heading quietly vanishing,
                     which on a projected screen is indistinguishable from still loading. */
                  <p data-testid="room-roster-all-answered" className="text-sm text-muted-foreground">
                    Everyone has answered.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Practice Rooms — round 4 reverses the round-2 "leave it where it was!" call
              (founder, confirmed again this round): it now lives in `/meet`, under the
              roster card, not on the event Details page. `granted` (from
              `useEventRoomAccess`) already gates the whole view to signed-in + registered
              callers, so no extra `isLoggedIn` check is needed here — unlike EventDetail.tsx,
              which is reachable by logged-out visitors and gates it explicitly.

              Gated on `!isFrozen`, unlike the roster above: a closed event has no more live
              practice to start, and `/meet` — unlike the old event Details page — is a
              surface people keep open for an event's whole duration, so an ungated render
              here would leave PracticeRooms' 5s poll running indefinitely in any tab left
              open past the freeze boundary (code review, round 4). */}
          {event && !isFrozen && (
            <PracticeRooms
              eventId={event.id}
              eventSlug={slug ?? event.slug}
              currentUserId={user?.id ?? null}
              currentUserName={user?.name ?? null}
            />
          )}
        </div>
      </div>

      {/* px-0 cancels FixedBottomBar's own p-4 horizontally so BAR_INNER_CLASS can own it —
          that is the only way the bar's contents stay centred on the page at every width.
          Shadow + top fade are what stop the hard cut where scrolling content meets an
          opaque fixed bar reading as clipped content.

          INVARIANT (round 4, founder, twice): the CTA/drawer is centred on the whole
          viewport unconditionally, decoupled from wherever the certificate sits. It no
          longer tracks the certificate column — the panel below is `BAR_INNER_CLASS`
          itself (`mx-auto w-full max-w-2xl px-4`), the same measure the shipped /meet page
          uses, at every width including min-[1600px]. Do not re-couple it to `THREE_COLUMN`
          or `PAGE_CONTAINER` — that coupling is exactly what round 4 reverses.

          At min-[1600px] the bar's own chrome is switched OFF and re-applied to the panel
          below instead. The bar is `fixed inset-x-0`, so its opaque background, border and
          fade span the full width — which under the three-column layout would paint a white
          band straight across the roster during the tall rating step, hiding rows that have
          nothing to do with the decision (this is why `pointer-events` moves to the panel
          alone, not the bar — see below). Below min-[1600px] there is only one column, so
          the full-width bar is correct and nothing changes. */}
      {!isFrozen && (
        <FixedBottomBar
          ref={setBarRef}
          className={cn(
            'px-0 shadow-[0_-4px_16px_-4px_rgba(0,0,0,0.10)]',
            BAR_FADE_CLASS,
            // pointer-events-none is NOT cosmetic pairing with the transparency above it:
            // FixedBottomBar is `fixed inset-x-0 z-50`, so at min-[1600px] the now-invisible
            // bar still spans the full width including the roster column and swallows
            // clicks over it — every profile link in the band behind it would be silently
            // dead, with nothing on screen to explain why (adversarial code review,
            // 2026-08-21). Re-enabled on the panel itself below, which is the only part
            // that holds controls.
            'min-[1600px]:border-transparent min-[1600px]:bg-transparent min-[1600px]:shadow-none min-[1600px]:backdrop-blur-none min-[1600px]:before:hidden min-[1600px]:pointer-events-none',
          )}
        >
          {/* Page-centred panel, not the certificate/roster grid — see the INVARIANT comment
              above. `BAR_INNER_CLASS` is the exact measure the shipped /meet page's own
              bar uses (`mx-auto w-full max-w-2xl px-4`), reused directly rather than
              restated, so the two surfaces can never drift apart. */}
          <div className={BAR_INNER_CLASS}>
            <div className={cn(
              'space-y-3',
              // The chrome the bar gave up above, re-applied to this panel alone at
              // min-[1600px]. No negative-margin cancellation here — the previous `-mx-4`
              // existed only to keep the panel's content flush with the certificate's own
              // left edge, and that alignment is exactly what round 4 removes (the panel is
              // self-contained and page-centred, not certificate-relative).
              'min-[1600px]:pointer-events-auto min-[1600px]:rounded-t-xl min-[1600px]:border min-[1600px]:border-b-0 min-[1600px]:border-border min-[1600px]:bg-background/95 min-[1600px]:p-4 min-[1600px]:shadow-[0_-4px_16px_-4px_rgba(0,0,0,0.10)] min-[1600px]:backdrop-blur',
            )}>
              {/* Mounted in EVERY step, with the same testid and data attribute throughout.
                  An earlier build rendered it only once answered, which broke every check
                  of the unanswered state (2026-08-21) — including the one that proves the
                  "membership does not auto-opt-in" non-goal. `data-opted-in` reports SERVER
                  state, so it stays "unanswered" through the rating step: nothing is
                  written until Submit.

                  The rating step hides it rather than unmounting it, for that reason: the
                  attribute is the only readable proof that nothing has been written yet,
                  and `display:none` keeps it queryable while taking it out of flow, so the
                  bar does not carry a blank line above the card. */}
              <div
                data-testid="room-my-opt-in-status"
                data-opted-in={answered ? (self?.optedIn ? 'true' : 'false') : 'unanswered'}
                className={cn('text-center text-sm text-muted-foreground', !statusText && 'hidden')}
              >
                {statusText}
              </div>

              {writeFailed && (
                <p role="status" className="text-center text-sm font-medium text-destructive">
                  That didn&apos;t save. Try again.
                </p>
              )}

              {step === 'choosing' && (
                /* Founder-annotated "this is nice and simple!" on the shipped /meet's copy
                   of exactly this. Neither pre-selected, neither disabled — the rating that
                   gates the answer is now the step AFTER this one, so there is nothing left
                   to disable these on. Only one filled control, so P955's one-primary rule
                   holds. */
                <div className="flex w-full gap-2">
                  <Button
                    data-testid="room-opt-in-yes"
                    onClick={() => { setWriteFailed(false); setPendingAnswer(true); }}
                    size="lg"
                    className={cn(PRIMARY_BUTTON_CLASS, 'flex-1')}
                  >
                    Opt in
                  </Button>
                  <Button
                    data-testid="room-opt-in-no"
                    onClick={() => { setWriteFailed(false); setPendingAnswer(false); }}
                    size="lg"
                    className={cn(ANSWER_BUTTON_CLASS, 'flex-1')}
                  >
                    Opt out
                  </Button>
                </div>
              )}

              {step === 'rating' && (
                /* The shared card, with the shipped /meet's own overrides: px-2 at mobile
                      trims the card's p-5 (aligning it to the certificate costs 10px of
                      inner width, which pushes the question from four wrapped lines to
                      five), and the CTA wears the certificate navy.

                      `disabled={submitting}` is not optional here. The card's own Submit
                      guards only on "no rating picked", and the shipped page can get away
                      with that because its state flip is synchronous — this one awaits a
                      round trip, and every call INSERTs a row into event_room_answers with
                      a cascade count. Two taps inside that window would write two history
                      rows into the table the research question reads (adversarial review,
                      2026-08-21). `handleSubmitRating` re-checks `submitting` as well.

                      No cancel control under the card, and the card's own `onBack` is left
                      unpassed so it renders none either. Removed on the founder's
                      instruction, 2026-08-21 ("you invented it"): it was not in the shipped
                      /meet this flow was asked to copy, and it read as a third thing to
                      decide about at the moment the person is being asked for one number.
                      The mis-tap it guarded (Opt in when you meant Opt out) is recoverable
                      without it — submit, then "Change your choice". */
                <ComprehensionRatingCard
                  question={UNDERSTANDING_QUESTION}
                  onSelect={handleSubmitRating}
                  disabled={submitting}
                  submitLabel="Submit"
                  ctaClassName={cn(PRIMARY_BUTTON_CLASS, 'mt-3 w-full')}
                  className="px-2 sm:px-5"
                  questionClassName="text-lg font-semibold text-center leading-snug"
                />
              )}

              {step === 'answered' && (
                /* Founder's exact labels, 2026-08-21, replacing the shipped page's
                   "Accepted — meeting in progress." / "End meeting". Full-width outlined,
                   the same treatment that page gives its own non-committing action — which
                   also lifts this control off the 32px ghost button it used to be. */
                <Button
                  data-testid="room-change-choice"
                  onClick={handleChangeChoice}
                  size="lg"
                  disabled={submitting}
                  className={cn(ANSWER_BUTTON_CLASS, 'w-full')}
                >
                  Change your choice
                </Button>
              )}
            </div>
          </div>
        </FixedBottomBar>
      )}
    </div>
  );
}
