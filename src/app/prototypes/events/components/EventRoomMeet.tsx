/**
 * @file EventRoomMeet.tsx
 * @description P1114 rev2 — `/events/:slug/meet`. The shipped `/meet` composition
 * (meeting-terms-page.tsx): the certificate scrolls under a fixed bottom bar carrying
 * the decision. Level stays 3 ("Reveal the gap"); the room has no level picker.
 *
 * Section order, top to bottom: the certificate, then the roster (three groups — opted
 * in, opted out, undecided), then the fixed decision bar.
 *
 * The ONE deliberate divergence from `/meet`'s original shape — no phone-handoff action
 * after answering (a room of forty has no phone to hand back) — still holds. The
 * comprehension-rating step itself does NOT diverge any more (see below).
 *
 * The level track still renders, LOCKED at 3 — "no level picker" (spec) means nothing is
 * selectable, not that the track disappears. Blind review (round 1, COMPARABLE row
 * "recognisably the same page as /meet") caught its total absence reading as a different,
 * bespoke document; portaled into the same nav slot the shipped page uses, so a shared
 * projected link shows the identical header either way.
 *
 * Back button (2026-08-21 founder repro): always goes to /ready, unconditionally — unlike
 * the general /meet's FocusHeader (only shown when arrived via `fromReady` state), the
 * room has no legitimate way to reach /meet without readiness already meaning something.
 *
 * Public roster + comprehension rating (2026-08-21, decisions.md — two decisions landing
 * together, see the migration 20260821120000_p1114_public_roster_reversal.sql for the full
 * rationale):
 *
 *   1. Every room member is now visible by name, grouped by answer — opted in / opted out
 *      / undecided — not just the opted-in ones. Reverses the original Decision 2. This
 *      also fixes "the roster doesn't update without a refresh": that symptom was the same
 *      RLS filter silently dropping realtime delivery for any transition into a hidden
 *      state, not a separate bug — see the migration comment.
 *
 *   2. The "how much do you understand" 0-10 rating (general /meet's ComprehensionRatingCard)
 *      is reinstated for the room, required before EITHER opt-in or opt-out — the rating
 *      buttons unlock the two decision buttons, mirroring "select the number, only then you
 *      can answer." The rating is shown publicly next to each opted person's name. Once
 *      answered, the two decision buttons are replaced by a locked summary + "Change my
 *      choice," which clears the answer AND the rating back to undecided (not merely
 *      overwritten by a new answer) — this is the room's version of general /meet's
 *      accepted/change-your-mind sandwich, since a live yes/no toggle gave no feedback that
 *      an answer had registered at all (2026-08-21 founder repro).
 *
 * Bottom-bar height is MEASURED, not a static pb-N (2026-08-21 visual QA): the undecided
 * bar (question + 11 rating buttons + 2 decision buttons) is far taller than the answered
 * bar (two lines), and a fixed padding sized for one state clips the last roster row under
 * the other. Same ResizeObserver-on-ref pattern as meeting-terms-page.tsx's own rating bar,
 * which exists for the identical reason (its bar's height changes within a step too).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { RatingButtons } from '@/app/components/partners/shared';
import { cn } from '@/lib/utils';
import {
  CertificateFrame,
  CertificateOathBody,
} from '@/app/components/agreements/certificate-frame';
import { FixedBottomBar } from '@/app/components/shared/fixed-bottom-bar';
import { PersonRow } from '@/app/components/shared/PersonRow';
import { NAV_CENTER_SLOT_ID } from '@/app/components/layout/simple-navigation';
import { sectionsForLevel, type MeetingTermsLevel } from '@/app/content/meeting-terms';
import { PRIMARY_BUTTON_CLASS, ANSWER_BUTTON_CLASS, LevelTrack, BAR_FADE_CLASS } from '@/app/pages/meeting-terms-page';
import { setRoomOptIn, resetRoomAnswer, subscribeToRoomRoster } from '@/app/data/event-room-service';
import { EVENT_GRACE_HOURS } from '@/app/data/events-service-real';
import { EventRoomGateScreen } from './EventRoomGate';
import { useEventRoomAccess, useEventRoomSelf } from './EventRoomAccess';
import type { EventRoomMember } from '@/app/types';

const PRINCIPLE_LEVEL: MeetingTermsLevel = 3;
const PRINCIPLE_TITLE = 'Clarity Meeting Principle';
const COMPREHENSION_QUESTION = 'How much do you understand?';

/** One roster row: PersonRow plus the public comprehension number, when the member has
 * answered. Undecided members never carry a rating (required at answer time), so the
 * number only ever appears next to an in/out row. */
function RosterRow({ member }: { member: EventRoomMember }) {
  return (
    <div className="flex items-center justify-between gap-2">
      {/* min-w-0 is load-bearing: PersonRow's own name text already truncates
          internally, but its root has no width constraint of its own — nested as a
          flex item next to the rating pill with no min-w-0 wrapper, it refused to
          shrink below its content's natural width, pushing the pill off-screen and
          overflowing the card at 320px (visual QA, 2026-08-21). */}
      <div className="min-w-0 flex-1">
        <PersonRow
          profileId={member.profileId ?? member.id}
          slug={member.profileSlug ?? ''}
          name={member.displayName}
          avatarColor={member.profileAvatarColor ?? '#3B82F6'}
          avatarUrl={member.profileAvatarUrl}
          isPledger={member.profileHasPledged}
          earCount={member.profileEarCount}
          linkToProfile={!!member.profileId}
        />
      </div>
      {member.comprehensionRating != null && (
        <span
          data-testid="room-roster-rating"
          className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
        >
          {member.comprehensionRating}/10
        </span>
      )}
    </div>
  );
}

function RosterGroup({ title, testId, members }: { title: string; testId: string; members: EventRoomMember[] }) {
  return (
    <div data-testid={testId} className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title} ({members.length})</h3>
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one yet.</p>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div key={member.id} data-testid="room-roster-item">
              <RosterRow member={member} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EventRoomMeet() {
  const { slug, event, loading, granted, isLoggedIn } = useEventRoomAccess();
  const { self, loading: selfLoading, refresh } = useEventRoomSelf(event, granted);
  const navigate = useNavigate();
  const [navSlot, setNavSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setNavSlot(document.getElementById(NAV_CENTER_SLOT_ID));
  }, []);
  const [roster, setRoster] = useState<EventRoomMember[]>([]);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  useEffect(() => {
    if (!event) return;
    return subscribeToRoomRoster(event.id, setRoster);
  }, [event?.id]);

  const handleAnswer = useCallback(async (optedIn: boolean) => {
    if (!self || selectedRating === null) return;
    setSubmitting(true);
    try {
      await setRoomOptIn(self.id, optedIn, selectedRating);
      await refresh();
      setSelectedRating(null);
    } catch {
      // The freeze boundary or a transient failure rejected the write — the room's
      // own frozen-state render (below, keyed on wall-clock time) already covers
      // the freeze case; a transient failure just leaves the prior answer standing.
    } finally {
      setSubmitting(false);
    }
  }, [self, selectedRating, refresh]);

  const handleChangeChoice = useCallback(async () => {
    if (!self) return;
    setSubmitting(true);
    try {
      await resetRoomAnswer(self.id);
      await refresh();
    } catch {
      // Same freeze/transient handling as handleAnswer — leaves the prior answer
      // standing rather than surfacing a dead-end error state.
    } finally {
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

  return (
    // Padding is MEASURED (barHeight), not a static class — see the file doc comment.
    // A static value sized for one bar state (e.g. the short answered-state bar) clips
    // the last roster row under the much taller undecided-state bar (question + 11
    // rating buttons + 2 decision buttons) — caught in visual QA, 2026-08-21, reproduced
    // at all three viewports by scrolling to the bottom of the roster while undecided.
    <div data-testid="room-meet" style={barHeight > 0 ? { paddingBottom: barHeight + 16 } : undefined}>
      {/* hidden below 375px: the room's always-signed-in avatar chip eats into the
          nav row's right-hand clearance that /terms's usually-anonymous visitor
          doesn't cost it — the track's own non-wrapping labels are wider than what
          fits in what's left at 320px (measured: 202.65px of label content against
          145px of padded slot width). Rather than shrink the shared track's text or
          widen the shared slot (both change /terms's unrelated rendering), the
          narrowest breakpoint simply goes back to no stepper, same as before this
          fix — 375px and above show it exactly like /meet. */}
      {navSlot && createPortal(
        <div className="hidden min-[375px]:block w-full">
          <LevelTrack level={PRINCIPLE_LEVEL} locked onSelect={() => {}} />
        </div>,
        navSlot,
      )}
      <h1 className="sr-only">{PRINCIPLE_TITLE}</h1>

      <div className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        <FocusHeader
          onBack={() => navigate(`/events/${slug}/ready`)}
          label="Back to readiness"
          aria-label="Back to readiness"
        />
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

        {/* No top-level zero-state any more (2026-08-21): a signed-in visitor auto-joins
            the room on arrival (useEventRoomSelf), so THEIR OWN row always makes the
            roster non-empty within a moment of load — "the room is empty" was never
            true for more than a loading flicker once everyone is visible, and showing it
            during that flicker read as wrong rather than as loading. Each group already
            degrades to "(0)" + "No one yet" on its own, which is accurate at every
            instant, including that flicker. */}
        <div data-testid="room-roster" className="space-y-6">
          <RosterGroup title="Opted in" testId="room-roster-in" members={inMembers} />
          <RosterGroup title="Opted out" testId="room-roster-out" members={outMembers} />
          <RosterGroup title="Undecided" testId="room-roster-undecided" members={undecidedMembers} />
        </div>
      </div>

      {/* Shadow + top fade — reused from meeting-terms-page.tsx's own two bar usages
          (visual QA, 2026-08-21): FixedBottomBar carries no shadow by default, and a
          hard cut where scrolling content meets a fixed bar reads as clipped/broken
          content rather than "more below" once the bar is opaque. */}
      {!isFrozen && (
        <FixedBottomBar ref={setBarRef} className={cn('shadow-[0_-4px_16px_-4px_rgba(0,0,0,0.10)]', BAR_FADE_CLASS)}>
          {self?.optedIn == null ? (
            <div className="w-full max-w-2xl space-y-3">
              {/* Always-present, same testid/attribute as the answered branch below —
                  a prior implementation only rendered this in the answered state, which
                  broke every check for the "unanswered" state (2026-08-21, caught by
                  e2e before it shipped). */}
              <div
                data-testid="room-my-opt-in-status"
                data-opted-in="unanswered"
                className="text-center text-sm text-muted-foreground"
              >
                You have not answered yet.
              </div>
              <p className="text-center text-sm font-medium text-foreground">{COMPREHENSION_QUESTION}</p>
              <RatingButtons selectedValue={selectedRating} onSelect={setSelectedRating} disabled={submitting} />
              {/* Both buttons render disabled until a rating is picked — same UAT-reversal
                  precedent as general /meet's rating-card submit (P1024, meeting-terms-page.tsx):
                  the row above is the only tappable thing until then, and the pair states that
                  a step still follows rather than reading as finished. Class split (filled vs
                  outlined) is what keeps this to ONE primary action, not the disabled state. */}
              <div className="flex w-full gap-2">
                <Button
                  data-testid="room-opt-in-yes"
                  onClick={() => handleAnswer(true)}
                  size="lg"
                  disabled={selectedRating === null || submitting}
                  className={cn(PRIMARY_BUTTON_CLASS, 'flex-1')}
                >
                  Opt in
                </Button>
                <Button
                  data-testid="room-opt-in-no"
                  onClick={() => handleAnswer(false)}
                  size="lg"
                  disabled={selectedRating === null || submitting}
                  className={cn(ANSWER_BUTTON_CLASS, 'flex-1')}
                >
                  Opt out
                </Button>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-2xl space-y-2 text-center">
              <div
                data-testid="room-my-opt-in-status"
                data-opted-in={self.optedIn ? 'true' : 'false'}
                className="text-sm text-muted-foreground"
              >
                {self.optedIn ? 'You opted in.' : 'You opted out.'} {self.comprehensionRating}/10.
              </div>
              <Button
                data-testid="room-change-choice"
                onClick={handleChangeChoice}
                variant="ghost"
                size="sm"
                disabled={submitting}
              >
                Change my choice
              </Button>
            </div>
          )}
        </FixedBottomBar>
      )}
    </div>
  );
}
