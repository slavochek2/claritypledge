/**
 * @file EventRoomReady.tsx
 * @description P1114 rev2 — `/events/:slug/ready`. The shipped `/ready` composition
 * (ready-page.tsx), event-scoped: one question, the shared `SliderTrack`, `Continue`,
 * vertically centred. No caption under the slider — the UI Contract's "Readiness
 * caption" row is retired, founder-annotated "delete" (spec Solution, "REVISED (2)").
 *
 * Gated the same way as every room door: EventRoomGate.tsx's screen renders here too
 * when the caller is not registered + signed in.
 *
 * Back button (2026-08-21 founder repro): goes to the event page — the step before
 * this one in the room's pipeline (event page → /room → /ready). P1718: the head is the room's own
 * (RoomStickyHead, RoomHeadRow with its back control, and ReadyStepBar), as on /meet.
 *
 * Readiness distribution (2026-08-21): everyone else in THIS room, drawn as faint marks on
 * the caller's own track via SliderTrack's `others` — the general /ready's P1083 treatment,
 * which this page had dropped. Anonymous by construction, not by convention: the values
 * arrive from a SECURITY DEFINER RPC carrying no identifiers, because the roster row next
 * to it is public by name and the two contracts would otherwise contradict each other. See
 * supabase/migrations/20260821170000_p1114_room_readiness_distribution.sql.
 *
 * No transcription switch (P1337, founder walkthrough 7): transcription is started in one place
 * only, the room's top bar ("Transcribe"), whose tap is the consent. The general /ready never had
 * one, so the two readiness screens now match.
 *
 * P1718: Skip, and Continue saves only an answer. An untouched slider used to save the midpoint 5 on Continue,
 * so "I didn't answer" and "I'm neutral" were one row and the fake 5 entered everyone's dots. Now Skip, an
 * untouched Continue and a failed save store nothing and remember the skip on this device (ready-skip-memory.ts),
 * so the gate sends the person on to /meet next time. The step bar is the room's own (ReadyStepBar.tsx), and a
 * person seated at a running round is forwarded to /meet (use-seated-at-running-round.ts).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { SliderTrack } from '@/app/components/partners/slider-track';
import { ANSWER_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from '@/app/components/agreements/meeting-principle-view';
import { getRoomReadinessDistribution, setRoomReadiness } from '@/app/data/event-room-service';
import { EVENT_GRACE_HOURS } from '@/app/data/events-service-real';
import { cn } from '@/lib/utils';
import { useConnectivity } from '@/app/contexts/offline-status-context';
import { NeedsConnection } from '@/app/components/offline/needs-connection';
import { EventRoomGateScreen, isMastermindHost } from './EventRoomGate';
import { useEventRoomAccess, useEventRoomSelf } from './EventRoomAccess';
import { PrepRoomBanner } from '../prep/PrepRoom';
import { recipeForEvent } from '../series-recipes';
import { whenVisible } from '../when-visible';
import { useBackToEvent } from '../use-back-to-event';
import { readRoomNav } from './use-room-back';
import { RoomHeadCapture, RoomHeadRow, RoomStickyHead } from './RoomChrome';
import { ReadyStepBar, useReadyStepBarReads } from './ReadyStepBar';
import { forgetReadySkipped, rememberReadySkipped } from './ready-skip-memory';
import { useSeatedAtRunningRound } from './use-seated-at-running-round';
import { settleWithin } from './settle-within';

const QUESTION = 'How up for thinking are you right now?';
const MIDPOINT_LABEL = 'Neutral';
const MIDPOINT_VALUE = 5;
/** P1718: a save that has not answered by then lets the person in anyway (remembered as a skip, R4). */
export const READY_SAVE_MS = 5000;
const POLE_LABELS = { low: 'Stay on the surface', high: 'Go deep' };
/** Deliberately the same sentence the general /ready uses for its own marks — this is the
 * screen-reader-only description of the `others` dots, and the two surfaces render the
 * identical thing. Scoped to this event's room rather than the whole site. */
const DISTRIBUTION_LABEL = 'How up for thinking others in this room are right now';

export function EventRoomReady() {
  const { slug, event, loading, granted, isLoggedIn, offline: accessOffline } = useEventRoomAccess();
  const { self, loading: selfLoading, refresh } = useEventRoomSelf(event, granted);
  const navigate = useNavigate();
  const { offline } = useConnectivity();
  // P1562 §2: Back to the event — a pop when the event page opened the room (the gate replaces itself with /ready and
  // carries `fromEvent`), otherwise a replace. Meet gets both marks, so its Back pops here and this one still knows.
  const { fromEvent } = readRoomNav(useLocation().state);
  const goBack = useBackToEvent(slug, fromEvent, 0);

  const [value, setValue] = useState(MIDPOINT_VALUE);
  const [touched, setTouched] = useState(false);
  // Review round 8 (Codex): a stored answer fills the slider only until the person moves it or leaves. A room-row read
  // that lands later (slow wifi, a cached row first) never moves the thumb under their finger, nor away from the value
  // a running save sent.
  const pinned = useRef(false);
  useEffect(() => {
    if (self?.readinessValue != null && !pinned.current) {
      setValue(self.readinessValue);
      setTouched(true);
    }
  }, [self?.readinessValue]);

  // Everyone else's answers, drawn as faint marks resting on this same track — the general
  // /ready's `others` treatment (P1083), which the room's copy of this page had dropped
  // (founder, 2026-08-21: "i want the same functionality in the event rooms!").
  //
  // Fetched once on arrival, deliberately NOT subscribed to the room's realtime channel:
  // marks that shuffle while someone is deciding their own number turn a static reference
  // into a moving one, and the value being answered here is "right now, for you". The
  // general page has the same one-shot behaviour.
  // The read itself is below, once it is known whether this screen will show (review round 7).
  const [others, setOthers] = useState<number[]>([]);

  // P1718 R3: one tap goes through. A second tap on Continue, Skip or the step bar while a save is in flight does
  // nothing (the bar shares this guard: review round 2). `saving` shows it: both buttons are busy until the person moves on.
  const leaving = useRef(false);
  // Review round 4: once they are leaving, the slider holds still, so it never shows an answer that was not sent.
  const handleChange = useCallback((next: number) => {
    if (leaving.current) return;
    pinned.current = true;
    setValue(next);
    setTouched(true);
  }, []);
  const [saving, setSaving] = useState(false);
  // Review round 3: Back stays live during the save. Someone who leaves for the event page is not pulled into the room
  // when the save settles.
  const mounted = useRef(false);
  // Review round 9 (Codex): the post-save re-read stops with the screen too, so its join fallback never runs after Back.
  const reread = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; reread.current?.abort(); };
  }, []);
  // Review round 13 (Codex): Back may pop history asynchronously, so it stops the save's follow-ups at once: no re-read
  // starts and Continue does not navigate after it.
  const departed = useRef(false);
  const backToEvent = useCallback(() => {
    departed.current = true;
    leaving.current = true;
    reread.current?.abort();
    goBack();
  }, [goBack]);
  const goToMeet = useCallback(() => {
    navigate(`/events/${slug}/meet`, { state: { fromReady: true, fromEvent } });
  }, [navigate, slug, fromEvent]);

  // P1718 R2/R4: nothing is saved; the skip is remembered on this device so the gate sends them on next time.
  const handleSkip = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    rememberReadySkipped(self?.profileId, event?.id);
    goToMeet();
  }, [self?.profileId, event?.id, goToMeet]);

  // P1718 R3: Continue saves only an answer — a moved slider, or a value already stored. Untouched, it is Skip.
  const handleContinue = useCallback(async () => {
    if (!touched) {
      handleSkip();
      return;
    }
    if (leaving.current) return;
    leaving.current = true;
    pinned.current = true;
    if (self) {
      setSaving(true);
      // One budget for the save and the re-read together, so Continue never holds the person past READY_SAVE_MS.
      const deadline = Date.now() + READY_SAVE_MS;
      let saved = false;
      const save = setRoomReadiness(self.id, value);
      // A real answer replaces an earlier skip on this device, even one that lands after the budget below and so after
      // the catch has remembered a skip (review round 3).
      const { profileId } = self;
      save.then(() => forgetReadySkipped(profileId, event?.id), () => {});
      try {
        await settleWithin(save, READY_SAVE_MS);
        saved = true;
      } catch {
        // Readiness is a note, not a gate — the person still goes in. P1718 R4: a failed or stalled save is
        // remembered as a skip, so the gate does not send them back here on every re-entry. A failed re-save of an
        // answer already stored is not a skip (review round 4): the stored answer stands.
        if (self.readinessValue == null) rememberReadySkipped(self.profileId, event?.id);
      }
      // The answer is stored; a failed re-read only leaves the tick for the next read to draw.
      const left = deadline - Date.now();
      // Review round 7 (metered-services rule 3): no re-read from a tab hidden while the save ran; /meet reads the row
      // again when it is shown.
      // Review round 8 (Codex): the re-read is told when this screen stops waiting, so its fallback (the room join after
      // a status read with no row) never starts once the budget is spent or the tab is hidden (EventRoomAccess.tsx `load`).
      // Review round 9 (Codex): nor after Back left the screen while the save ran.
      if (saved && left > 0 && document.visibilityState !== 'hidden' && mounted.current && !departed.current) {
        const stop = new AbortController();
        reread.current = stop;
        await settleWithin(refresh(stop.signal), left).catch(() => {});
        stop.abort();
      }
      if (!mounted.current || departed.current) return;
    }
    goToMeet();
  }, [touched, handleSkip, self, value, refresh, event?.id, goToMeet]);

  const isFrozen = event
    ? Date.now() >= new Date(event.datetime).getTime() + EVENT_GRACE_HOURS * 60 * 60 * 1000
    : false;
  const hasReadiness = !!event && recipeForEvent(event).room.readiness;
  // P1718 R9: a direct /ready URL does not let the mastermind's host answer either.
  const mastermindHost = isMastermindHost(event, self?.profileId);
  // P1718 R8: Ready never stands at a running table. The rounds read starts with the room row's (not after it), and is
  // asked only when this screen could show.
  // Review round 5: not asked while offline (Ready shows from the cached row at once), nor where Ready redirects anyway.
  // Nor once the room row has come back empty: no member, no seat to find.
  const askSeated = granted && !offline && !isFrozen && hasReadiness && !mastermindHost && (selfLoading || !!self);
  const seated = useSeatedAtRunningRound(event?.id, self?.id, askSeated);
  // Review round 7 (metered-services rule 3 and the Cost Budget): the marks are read only where the question can show
  // (not for the host, a past evening, offline, or before the room row), and on a visible tab.
  // Review round 9 (Codex): and only once the seat read found no seat, so a seated person forwarded to /meet makes none.
  // The screen shows its loader until that answer, so the marks lose no time.
  const askDistribution = granted && !offline && !isFrozen && hasReadiness && !mastermindHost && !!self && seated === false;
  // Review round 13 (Codex, metered rule 4): one read a visit; going offline and back does not read them again.
  const marksAsked = useRef<string | null>(null);
  useEffect(() => {
    if (!event || !askDistribution || marksAsked.current === event.id) return;
    const eventId = event.id;
    return whenVisible(() => {
      if (marksAsked.current === eventId) return;
      marksAsked.current = eventId;
      void getRoomReadinessDistribution(eventId).then((values) => {
        // getRoomReadinessDistribution resolves to [] on its own failures, so there is no
        // error branch to handle here — an absent distribution renders as no marks.
        if (mounted.current) setOthers(values);
      });
    });
  }, [event?.id, askDistribution]);

  // Review round 14: whether the question has shown this visit (per event). Once it has, a seat read started later (by
  // coming back online, Gemini) runs behind it rather than putting the loader back over a slider in use; and the step
  // bar's reads are held here, enabled by it, so the access check's loader on a reconnect does not repeat them (Codex).
  const [shownFor, setShownFor] = useState<string | null>(null);
  const shown = !!event && shownFor === event.id;
  const barReads = useReadyStepBarReads(event, self?.profileId, shown);

  if (loading || (granted && selfLoading)) return <ClarityPageLoader />;
  if (accessOffline) return <NeedsConnection />;
  // P1369 Scope v2: the check-in shows its last-seen state with the strip; needs-connection only
  // when nothing was stored.
  if (offline && !self) return <NeedsConnection />;
  if (!granted) return <EventRoomGateScreen slug={slug} isLoggedIn={isLoggedIn} />;

  // P1586: the redirect lands in an effect, so the loader holds the frame until it does.
  // P1542: a series without a readiness step (hikes) never shows this screen; the redirect carries `fromEvent`.
  // P1718 R8/R9: nor does someone seated in the round running now, nor the mastermind's host. A seat found late, while
  // Continue is already saving on its way to /meet, leaves that save to finish and take them there (review round 13).
  if (isFrozen || (event && !hasReadiness) || (seated === true && !saving) || mastermindHost) {
    return (
      <>
        <Navigate to={`/events/${slug}/meet`} replace state={fromEvent ? { fromEvent } : undefined} />
        <ClarityPageLoader />
      </>
    );
  }
  if (self && askSeated && seated === null && !shown) return <ClarityPageLoader />;
  if (event && !shown) setShownFor(event.id);

  return (
    <div
      data-testid="room-ready"
      className="flex min-h-[calc(100vh-4rem)] flex-col px-4 pb-10 lg:min-h-[calc(100vh-5rem)]"
    >
      <h1 className="sr-only">Before you meet</h1>

      {/* max-w-2xl, NOT the max-w-sm of the question column below it (founder, 2026-08-21:
          "for desktop not sure if this is a good place to put it? you tell me .. let's be
          consistent and user friendly"). Pinned to the narrow centred column, the link
          floated at roughly page-centre above a tall empty gap, reading as a stray control
          rather than as page chrome. This is the SAME container the room's own /meet gives
          its back link, so walking /ready → /meet no longer jumps the link sideways —
          which is the concrete "consistent" the question was asking about. The question
          group below stays max-w-sm and stays vertically centred; only the chrome moves. */}
      {/* P1336: the preparation stays one tap away for someone who joined without it — on the
          Back line (UAT 2026-10-01). */}
      {/* P1562 §1: the shell top bar's "Back to the event" (in place when there is no shell), the step bar under it, in
          the room's sticky head — the same head and offset as /meet, so the step bar sits at one y on every room view. */}
      <RoomStickyHead className="-mx-4 px-4">
        {/* UAT 2026-11-11: the recording banner (if running) is the very top, full width; the Back and the tabs sit under it. */}
        <RoomHeadCapture eventId={event?.id} />
        <RoomHeadRow
          className="mx-auto w-full max-w-2xl pt-3 pb-2"
          onBack={backToEvent}
          tabs={<ReadyStepBar event={event} slug={slug} fromEvent={fromEvent} viewerId={self?.profileId} readyDone={self?.readinessValue != null} leaving={leaving} reads={barReads} />}
        />
      </RoomStickyHead>
      {/* P1336: the preparation stays one tap away for someone who joined without it. P1718 review round 7: not where
          the step bar carries the Learn entry (the mastermind's), which is that one tap already, as on /meet; the
          banner would read the preparation a second time and show nothing. */}
      {!(event && recipeForEvent(event).room.steps?.learn) && (
        <div className="mx-auto mt-2 flex w-full max-w-2xl justify-end">
          <PrepRoomBanner event={event} />
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="flex w-full max-w-sm flex-col gap-10">
          <p className="text-center text-xl font-semibold leading-snug text-foreground sm:text-2xl">
            {QUESTION}
          </p>

          <div className="pt-4">
            <SliderTrack
              value={value}
              onChange={handleChange}
              showValue={false}
              ariaLabel={QUESTION}
              midpointLabel={MIDPOINT_LABEL}
              poleLabels={POLE_LABELS}
              muted={!touched}
              bipolarFill
              expandedHitArea
              others={others}
              othersLabel={DISTRIBUTION_LABEL}
            />
          </div>

          <div className="flex flex-col gap-4">
            <Button
              onClick={handleContinue}
              disabled={saving}
              aria-busy={saving || undefined}
              size="lg"
              className={cn(PRIMARY_BUTTON_CLASS, 'w-full')}
              data-testid="room-ready-continue"
            >
              Continue
            </Button>
            {/* P1718 R2 (founder 2026-11-23: label "Skip"): blue-bordered, never a second primary (P955). */}
            <Button
              onClick={handleSkip}
              disabled={saving}
              aria-busy={saving || undefined}
              size="lg"
              className={cn(ANSWER_BUTTON_CLASS, 'w-full')}
              data-testid="room-ready-skip"
            >
              Skip
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
