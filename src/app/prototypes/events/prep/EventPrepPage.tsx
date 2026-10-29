/**
 * @file EventPrepPage.tsx
 * @description P1336 — `/events/:slug/prepare`: the post-RSVP preparation, built from the
 * approved prototype (/tree/p1336-d). The spec wins on state, data, routing and copy; the
 * prototype on visual detail.
 *
 * Reuse, never rewrite: the header is the letter flow's (back arrow + LetterProgressBar), the
 * actions are in-page StepActions + LetterPrimaryCta (P1387: not fixed bars), clips are Mp4VideoFacade, the principle is
 * MeetingPrincipleView at /meet's level 3, statements are StakePage (embedded) and the research
 * Q&A is the product Dialog. Progress lives in event_preparations (resumes on any device), the
 * once-per-person parts in person_prep_parts.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn, stripAgentPrefix } from '@/lib/utils';
import { useAuth } from '@/auth';
import { useReturnToParent } from '@/app/hooks/use-go-back';
import { ClarityContentLoader, ClarityPageLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isOnlineLocation, onTimeLine } from '../arrival/arrival-text';
import { useAutoFinish, useStepsDone } from './use-auto-finish';
import { useEventCommunityName } from '../use-event-community';
import { useDeclareAppMenu } from '@/app/components/layout/app-menu-override';
import { useHideTodaysStripForEvent } from '@/app/components/layout/app-shell/shell-nav';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import { LetterProgressBar } from '@/app/components/letters/letter-progress-bar';
import { BAR_INNER_CLASS, MeetingPrincipleView, type PrincipleAnswer } from '@/app/components/agreements/meeting-principle-view';
import { StakePage } from '@/app/pages/stake-page';
import { HOST_VOICED_UNDERSTANDING_QUESTION, HostAsksLine, HostAvatar } from '../components/host-asks';
import { eventsService } from '@/app/data/events-service';
import { storiesService } from '@/app/data/stories-service';
import { getAgentAccounts } from '@/app/data/agent-accounts-service';
import {
  getMyPrepParts,
  getResearchPlacesLeft,
  markPrepPart,
  savePreparation,
  type MicSetup,
  type PrepPatch,
  type PrepStepKey,
} from '@/app/data/event-prep-service';
import type { EventWithHost, PointWithUserPosition } from '@/app/types';
import { RESEARCH_POLICY_VERSION, RESEARCH_PROGRAMME_URL, RESEARCH_QA } from './prep-content';
import {
  CMP7_TAG,
  eventTopic,
  PART_VERSIONS,
  PRINCIPLE_LEVEL,
  STEP_PART,
  backTarget, nextSnapshot, nextTarget,
  stepLabel,
  stepMinutes,
  type PlanStep,
} from './prep-plan';
import { EventBox, seriesLabel, SocialProof, socialProofLine } from './PrepPieces';
import { type StatementsCount, ActionRow, Clip, StatementsActions, StepActions, Title, useMeasuredHeight } from './prep-ui';
import { isAnswered, usePrepState, type PrepState } from './use-prep-state';
import { defaultRoomStep, feedbackAlwaysOpen, offersPreparation, recipeFor } from '../series-recipes';
import { RoomSteps, type RoomStep } from '../rounds/RoomSteps';
import type { PrepRoomEmbed } from './prep-room-embed';
import { getMyRoomStatus } from '@/app/data/event-room-service';
import { useFeedbackFinished } from '../use-feedback-finished';
import { whenVisible } from '../when-visible';
import { replaceIntoClose } from '../close/close-arrival';

// ─── page: access + data ───────────────────────────────────────────────────────────────

export function EventPrepPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, session, isLoading, sessionChecked } = useAuth();
  const authLoading = isLoading || !sessionChecked;
  const [event, setEvent] = useState<EventWithHost | null>(null);
  const [eventLoading, setEventLoading] = useState(true);
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [groupChatUrl, setGroupChatUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      const found = await eventsService.getEventBySlug(slug);
      if (cancelled) return;
      setEvent(found);
      setEventLoading(false);
      if (found && user) {
        const isRsvpd = await eventsService.isUserRsvpd(found.id, user.id).catch(() => false);
        if (cancelled) return;
        setRegistered(isRsvpd);
        if (isRsvpd && found.hasGroupChat) {
          eventsService.getEventGroupChatUrl(found.id).then((u) => !cancelled && setGroupChatUrl(u)).catch(() => undefined);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [slug, user]);

  const state = usePrepState(event, user?.id);

  if (authLoading || eventLoading) return <ClarityPageLoader />;
  if (!session) return <Navigate to={`/login?redirect=/events/${slug}/prepare`} replace />;
  if (!event || !offersPreparation(event)) return <Navigate to={`/events/${slug}`} replace />;
  if (registered === null || state.loading) return <ClarityPageLoader />;
  // Preparation belongs to a registration (the host has none of their own).
  if (!registered) return <Navigate to={`/events/${slug}`} replace />;
  if (state.error) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-base text-muted-foreground">We could not load your preparation. Please reload the page.</p>
      </main>
    );
  }
  return <PrepFlow event={event} groupChatUrl={groupChatUrl} state={state} viewerId={user!.id} />;
}



type Count = StatementsCount;

/** The real StakePage for one tag, listing exactly the session's snapshot of cards. */
function StakeStep({
  tag,
  points,
  askedIds,
  onPointsChanged,
  onCountChange,
}: {
  tag: string;
  points: PointWithUserPosition[];
  askedIds: string[];
  onPointsChanged: () => void;
  onCountChange: (c: Count) => void;
}) {
  const byId = new Map(points.map((p) => [p.id, p]));
  const answered = askedIds.filter((id) => {
    const p = byId.get(id);
    return p ? isAnswered(p) : false;
  }).length;
  useEffect(() => {
    onCountChange({ answered, total: askedIds.length });
  }, [answered, askedIds.length, onCountChange]);
  return (
    // A position is a row write; re-read after the card handled the click.
    // Two re-reads: the position write has no ordering guarantee against the first one.
    <div onClickCapture={() => { setTimeout(onPointsChanged, 400); setTimeout(onPointsChanged, 1500); }}>
      <StakePage tag={tag} embedded pointsOnly onlyIds={askedIds} linksInNewTab />
    </div>
  );
}

/** The first card, in the order shown, that has no position yet (P1391). */
function firstUnanswered(points: PointWithUserPosition[] | null | undefined, askedIds: string[] | undefined): string | null {
  if (!points || !askedIds) return null;
  const byId = new Map(points.map((p) => [p.id, p]));
  return askedIds.find((id) => { const p = byId.get(id); return !p || !isAnswered(p); }) ?? null;
}

/** Which cards each statements step showed on first entry, this session (Back shows the same
 *  cards, answered ones included; answered cards are skipped only on a later visit). */
type ShownIds = Record<string, string[]>;
const shownKey = (eventId: string, viewerId: string) => `p1336-shown:${viewerId}:${eventId}`;
function readShown(eventId: string, viewerId: string): ShownIds {
  try {
    return JSON.parse(sessionStorage.getItem(shownKey(eventId, viewerId)) ?? '{}') as ShownIds;
  } catch {
    return {};
  }
}
function writeShown(eventId: string, viewerId: string, shown: ShownIds) {
  try {
    sessionStorage.setItem(shownKey(eventId, viewerId), JSON.stringify(shown));
  } catch { /* storage unavailable: the snapshot lasts until reload */ }
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

const joinNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;


// ─── flow ──────────────────────────────────────────────────────────────────────────────

type Screen = 'plan' | PlanStep | 'end';
type VideoKey = 'welcome' | 'story' | 'principle';

export function PrepFlow({
  event,
  groupChatUrl,
  state,
  viewerId,
  room,
}: {
  event: EventWithHost;
  groupChatUrl: string | null;
  state: PrepState;
  viewerId: string;
  /** The learning drawn INSIDE the mounted room page (prep-room-embed.ts). Absent = the /prepare route. */
  room?: PrepRoomEmbed;
}) {
  const navigate = useNavigate();
  // The end screen's "Back to the event" must LAND on the event. When the event page opened this (its banner marks
  // the route state) the entry below is the event, so it POPS and the event's own Back does not land here again.
  // Opened from the RSVP confirm screen, the room or an email link the entry below is something else, so it
  // REPLACES with the event instead — the label is true, and the prepare page leaves the stack.
  const location = useLocation();
  const backToEvent = useReturnToParent(`/events/${event.slug}`, (location.state as { fromEvent?: boolean } | null)?.fromEvent === true);
  const [searchParams, setSearchParams] = useSearchParams();
  const embedded = !!room;
  const fromRoom = embedded || searchParams.get('from') === 'room';
  const { prep, plan } = state;
  // P1542 founder round 3: a hike's flow is learning about the named community, never "preparing".
  const { words } = recipeFor(event.seriesSlug).prepare;
  // P1542 founder UAT round 5: learning opened from the room (its Learn step, or the feedback thank-you's Join) stays
  // INSIDE the room's frame: the app menu, and the room's step bar with Learn as the shown step. Its finish returns to
  // the room's Opt in step, or (then=join) to the group terms on the feedback thank-you.
  const inRoom = fromRoom && !!words;
  const thenJoin = inRoom && !embedded && searchParams.get('then') === 'join';
  const roomRecipe = recipeFor(event.seriesSlug);
  // Round 6 (G): the room is ONE history entry — moving between its steps (Learn, Opt in, Give feedback) replaces, so
  // Back never returns into the learning, and the event-page marker travels along for "Back to the event".
  const openedByEvent = (location.state as { fromEvent?: boolean } | null)?.fromEvent === true;
  const onRoomStep = room?.onStep;
  const toRoom = useCallback((roomStep: RoomStep) => (onRoomStep
    ? onRoomStep(roomStep)
    : navigate(`/events/${event.slug}/room`, { replace: true, state: { roomStep, fromEvent: openedByEvent } })), [onRoomStep, navigate, event.slug, openedByEvent]);
  const finishInRoom = useCallback((roomStep: RoomStep = 'principle') => {
    if (onRoomStep) onRoomStep(roomStep);
    else if (thenJoin) navigate(`/events/${event.slug}/close?join=1`, replaceIntoClose(location.state, { joinViaLearning: true }));
    else navigate(`/events/${event.slug}/room`, { replace: true, state: { roomStep, fromEvent: openedByEvent } });
  }, [onRoomStep, thenJoin, navigate, event.slug, openedByEvent, location.state]);
  const { timeLine } = recipeFor(event.seriesSlug);
  const community = useEventCommunityName(event, !!words);
  const tag = event.statementTag ?? null;

  // P1542 decision (A): a hike's finished steps open again from the list at any time, not only once all is finished.
  const keepFinished = recipeFor(event.seriesSlug).prepare.keepFinished === true;
  const resumeScreen = (): Screen => {
    if (prep?.completedAt) return 'end';
    if (!prep?.startedAt) return 'plan';
    const done = state.stepsDone; // P1542 (A): finished elsewhere counts too (a hike's recipe)
    const current = prep.currentStep as PlanStep | null;
    if (current && plan.includes(current) && !done.includes(current)) return current;
    // P1542 (A): everything finished elsewhere but not recorded → the list, which records it at once (useAutoFinish).
    return plan.find((s) => !done.includes(s)) ?? (keepFinished ? 'plan' : 'end');
  };
  const [screen, setScreen] = useState<Screen>(resumeScreen);
  // P1542 VQA round 5: a hike's end of learning is a destination: the app menu comes back (Clarity Night's end stays
  // immersive, P1387). The route rule only sees the URL, so the page declares it.
  useDeclareAppMenu((!!words && screen === 'end') || inRoom);
  // Round 6b: inside the room the phone's "Today's event" strip would point where the person already is.
  useHideTodaysStripForEvent(event.slug, inRoom);
  // The end screen is a destination: ?done=1 brings the app menus back (immersive-letter-route.ts),
  // so a prepared attendee always has a way on. Every other screen stays immersive.
  useEffect(() => {
    // Embedded in the room, the room's URL is not the learning's: nothing to mark (the room already has the app menu).
    if (embedded) return;
    const isDone = searchParams.get('done') === '1';
    if ((screen === 'end') === isDone) return;
    const params = new URLSearchParams(searchParams);
    if (screen === 'end') params.set('done', '1');
    else params.delete('done');
    // Keep the route state: it carries the "opened by the event page" marker that Back to the event reads.
    setSearchParams(params, { replace: true, state: location.state });
  }, [embedded, screen, searchParams, setSearchParams, location.state]);
  const [stepsDone, setStepsDone] = useStepsDone(plan, state.stepsDone);
  const [playRequest, setPlayRequest] = useState(0);
  const [clipPlayed, setClipPlayed] = useState<Record<VideoKey, boolean>>({ welcome: false, story: false, principle: false });
  // Principle: (a) intro + clip (once per person), (b) the decision, (c) host line, (d) 0-10.
  const [principleIntroDone, setPrincipleIntroDone] = useState(!state.withPrincipleIntro);
  const [answer, setAnswer] = useState<PrincipleAnswer>(null);
  const [tryAsked, setTryAsked] = useState(false);
  const [principleRating, setPrincipleRating] = useState<number | null>(null);
  const [researchInfoOpen, setResearchInfoOpen] = useState(false);
  // Round 8c: hidden inside the room (another step shown), no dialog of the learning stays open over the room.
  const roomActive = room?.active ?? true;
  useEffect(() => { if (!roomActive) setResearchInfoOpen(false); }, [roomActive]);
  const [micAsked, setMicAsked] = useState(false);
  const [micSetup, setMicSetup] = useState<MicSetup | null>(prep?.micSetup ?? null);
  // P1386: second mic question ("what does your phone plug into?") is shown only after "No, I need one".
  const [micNeeded, setMicNeeded] = useState(false);
  const [micSaving, setMicSaving] = useState(false);
  const [researchSaving, setResearchSaving] = useState(false);
  const [placesLeft, setPlacesLeft] = useState<number | null>(null);
  const [experts, setExperts] = useState<string[] | null>(null);
  const [cmp7Count, setCmp7Count] = useState<Count>({ answered: 0, total: 0 });
  const [stakeCount, setStakeCount] = useState<Count>({ answered: 0, total: 0 });
  const [shownIds, setShownIds] = useState<ShownIds>(() => readShown(event.id, viewerId));
  useEffect(() => { writeShown(event.id, viewerId, shownIds); }, [event.id, viewerId, shownIds]);
  const [headerRef, headerHeight] = useMeasuredHeight();
  const [barRef, barHeight] = useMeasuredHeight();

  const places = event.researchPlaces ?? 6;
  useEffect(() => {
    getResearchPlacesLeft(event.id).then((n) => setPlacesLeft(n ?? Math.max(1, places)));
  }, [event.id, places]);

  // Experts = agents with stories on the event tag, from data (never hardcoded).
  useEffect(() => {
    if (!tag) {
      setExperts([]);
      return;
    }
    Promise.all([storiesService.getPublicStoriesFeed(50, 0, tag, true), getAgentAccounts()])
      .then(([stories, agents]) => {
        const names: string[] = [];
        stories.forEach((s) => {
          if (agents.has(s.authorId) && !names.includes(s.authorName)) names.push(s.authorName);
        });
        setExperts(names);
      })
      .catch(() => setExperts([]));
  }, [tag]);

  const pointsFor = (s: PlanStep): PointWithUserPosition[] | null =>
    s === 'cmp7' ? state.cmp7Points : s === 'stake' ? state.eventPoints : null;
  const tagFor = (s: PlanStep): string | null => (s === 'cmp7' ? CMP7_TAG : s === 'stake' ? tag : null);

  /** A statements step with nothing left to answer is passed over — unless it already showed
   *  cards this session (Back returns to them). */
  const isSkippable = (s: PlanStep) => {
    const t = tagFor(s);
    if (!t) return false;
    if (shownIds[t]?.length) return false;
    const pts = pointsFor(s);
    return pts !== null && pts.every(isAnswered);
  };

  /** First entry into a statements step snapshots the unanswered cards it shows. */
  useEffect(() => {
    if (screen !== 'cmp7' && screen !== 'stake') return;
    const t = tagFor(screen);
    const ids = t ? nextSnapshot(shownIds[t], pointsFor(screen), keepFinished && stepsDone.includes(screen)) : null;
    if (t && ids) setShownIds((prev) => ({ ...prev, [t]: ids }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, state.cmp7Points, state.eventPoints, shownIds, stepsDone, keepFinished]);

  /**
   * Writes go out one at a time, in order. Two upserts in flight together can commit in either
   * order, and a late "current_step: welcome" landing after "current_step: story" put the resume
   * point back a step (seen in the E2E on a fast tap).
   */
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const { setPrep } = state;
  const save = useCallback((patch: PrepPatch): Promise<boolean> => {
    const run = saveQueue.current.then(async () => {
      try {
        setPrep(await savePreparation(event.id, viewerId, patch));
        return true;
      } catch {
        toast.error('Could not save your progress. Please check your connection.');
        return false;
      }
    });
    saveQueue.current = run;
    return run;
  }, [event.id, viewerId, setPrep]);

  // Round 8b (Codex MED 3): a recorded part also refreshes the shared parts (a quiet read, no loading state), so a
  // long-lived owner of this state (the room keeps it across tab switches) never asks a once-per-person part again.
  const { setParts } = state;
  // Round 8c (Codex MED 3): only the LATEST refresh applies — an older read landing after a newer one is dropped.
  const partsSeq = useRef(0);
  // Round 8f (metered rule 3): the refresh waits for a visible tab (whenVisible), and every pending wait is cancelled
  // on unmount.
  const refreshCancels = useRef<(() => void)[]>([]);
  useEffect(() => () => { refreshCancels.current.forEach((c) => c()); refreshCancels.current = []; }, []);
  const { parts } = state;
  const markPart = useCallback((part: keyof typeof PART_VERSIONS, outcome: 'completed' | 'skipped') => {
    // Round 8f: a skip never downgrades a part already completed at this version (a refresher's "Continue without
    // video" would otherwise null completed_at — event-prep-service markPrepPart). Skip just moves on.
    if (outcome === 'skipped' && parts.some((r) => r.part === part && r.contentVersion === PART_VERSIONS[part] && !!r.completedAt)) return;
    markPrepPart(viewerId, part, PART_VERSIONS[part], outcome)
      .then(() => {
        const seq = ++partsSeq.current;
        const cancel = whenVisible(() => {
          getMyPrepParts(viewerId).then((rows) => { if (seq === partsSeq.current) setParts(rows); }).catch(() => undefined);
        });
        refreshCancels.current.push(cancel);
      })
      .catch(() => undefined);
  }, [viewerId, setParts, parts]);

  const go = useCallback(async (next: Screen, done: PrepStepKey[], extra: PrepPatch = {}) => {
    // "Prepared ✓" is only shown once completed_at is on record.
    if (next === 'end') {
      const ok = await save({ ...extra, stepsDone: done, currentStep: null, completedAt: new Date().toISOString() });
      if (!ok) return;
      // Round 5: learning opened from the thank-you's Join goes straight on to the group terms.
      // Round 6 (F): learning opened from the room's Learn step ends on its own screen INSIDE the room's frame (what
      // was learned, then the room's next step), not with a jump back to the room.
      if (thenJoin || room?.thenJoin) return finishInRoom(); // round 3 (D): in the room too
    }
    setScreen(next);
    setPlayRequest(0);
    setTryAsked(false);
    setMicAsked(false);
    setAnswer(null);
    setPrincipleRating(null);
    setPrincipleIntroDone(next === 'principle' ? !state.withPrincipleIntro : true);
    if (next !== 'end' && next !== 'plan') {
      void save({ ...extra, stepsDone: done, currentStep: next });
    }
    window.scrollTo(0, 0);
  }, [save, state.withPrincipleIntro, thenJoin, room?.thenJoin, finishInRoom]);
  // Founder UAT round: every step already finished elsewhere → record it and show the end, not an all-ticked list.
  const autoFinishing = useAutoFinish(event.seriesSlug, prep, screen, plan, stepsDone, go, room);

  // Founder 2026-10-26 (round 8e): finished learning can be gone through again (a refresher, or to show someone).
  // Reopened in the room after finishing, it shows the plan with its ticked steps — the existing agenda — where any
  // step opens again, plus the room's next step. Re-viewing never clears completed_at (saves patch only the step).
  const finished = !!prep?.completedAt;
  const reviewing = embedded && finished;
  const roomActiveNow = room?.active ?? false;
  useEffect(() => {
    // Round 8f: EVERY reopening of finished learning lands on the ticked list (also from a step being reviewed).
    if (reviewing && roomActiveNow) setScreen('plan');
    // Only on (re)opening the Learn view: the end screen right after finishing stays until they leave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomActiveNow]);
  const reviewStep = (s: PlanStep) => {
    setScreen(s);
    setPlayRequest(0);
    setTryAsked(false);
    setMicAsked(false);
    setAnswer(null);
    setPrincipleRating(null);
    setPrincipleIntroDone(s === 'principle' ? !state.withPrincipleIntro : true);
    window.scrollTo(0, 0);
  };

  const start = () => {
    const first = plan.find((s) => !stepsDone.includes(s) && !isSkippable(s)) ?? 'end';
    void go(first, stepsDone, { prepChoice: 'now', startedAt: prep?.startedAt ?? new Date().toISOString() });
  };

  /** Leaves the current step forward: records it done (and its once-per-person part), moves on. */
  const next = (outcome: 'completed' | 'skipped' = 'completed') => {
    if (screen === 'plan' || screen === 'end') return;
    const part = STEP_PART[screen];
    if (part) markPart(part, outcome);
    const done = stepsDone.includes(screen) ? stepsDone : [...stepsDone, screen];
    // Passed-over statements steps count as done too (nothing left to answer). P1542 (A) review: a hike's step reopened
    // out of order continues to the first unfinished step anywhere; 'end' (completion) only once all are finished.
    const { target, skippedOver } = nextTarget(plan, screen, done, keepFinished, isSkippable);
    skippedOver.forEach((s) => {
      const p = STEP_PART[s];
      if (p) markPart(p, 'completed');
    });
    const allDone = [...done, ...skippedOver];
    setStepsDone(allDone);
    void go(target, allDone);
  };

  const back = () => {
    if (screen === 'plan' || screen === 'end') return;
    setScreen(backTarget(plan, screen, keepFinished, isSkippable)); // P1542 (A): a hike's Back reaches finished steps
    setPlayRequest(0);
    setTryAsked(false);
    setMicAsked(false);
    setAnswer(null);
    setPrincipleRating(null);
    // Back into the principle lands on its decision screen.
    setPrincipleIntroDone(true);
    window.scrollTo(0, 0);
  };

  /** The plan's back arrow: where the person came from in the app (screen 0, the event page or the
   *  room), else — opened from an email link — the event page. */
  const leavePlan = () => {
    if (thenJoin) return navigate(`/events/${event.slug}/close`, replaceIntoClose(location.state));
    if (inRoom) return toRoom('principle');
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(fromRoom ? `/events/${event.slug}/room` : `/events/${event.slug}`);
  };

  const principleBack = () => {
    if (answer !== null && tryAsked) {
      setTryAsked(false);
      setPrincipleRating(null);
    } else if (answer !== null) {
      setAnswer(null);
      setPrincipleRating(null);
    } else if (principleIntroDone && state.withPrincipleIntro) {
      setPrincipleIntroDone(false);
    } else {
      back();
      return;
    }
    window.scrollTo(0, 0);
  };

  const choosePrinciple = async (a: PrincipleAnswer) => {
    setAnswer(a);
    setTryAsked(false);
    setPrincipleRating(null);
    window.scrollTo(0, 0);
    // The answer is recorded on the tap (the canonical opt-in); the 0-10 attaches on Confirm.
    // Not saved → back to the choice, so the person never moves on with nothing on record.
    if (!(await save({ optedIn: a === 'in', principleRating: null }))) setAnswer(null);
  };

  const confirmRating = async () => {
    if (principleRating === null) return;
    if (await save({ principleRating })) next();
  };

  const researchYes = async () => {
    if (researchSaving) return;
    setResearchSaving(true);
    // Consent must be on record before the person is treated as a volunteer.
    const ok = await save({
      // Saying Yes again (after Back) must not downgrade someone who already named a mic we can use.
      researchState: micSetup === 'usbc' || micSetup === 'own' ? 'confirmed' : 'eligible',
      researchConsentedAt: new Date().toISOString(),
      researchPolicyVersion: RESEARCH_POLICY_VERSION,
    });
    setResearchSaving(false);
    if (!ok) return;
    setMicNeeded(false);
    setMicAsked(true);
    window.scrollTo(0, 0);
  };

  // Bring the "no microphone" note and its Continue into view once, when that answer is chosen.
  const micNoteRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (micSetup === 'lightning' || micSetup === 'other') micNoteRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [micSetup]);

  const researchNo = () => {
    setMicSetup(null);
    void save({ researchState: 'declined', micSetup: null, researchConsentedAt: null, researchPolicyVersion: null });
    next();
  };

  const chooseMic = async (value: MicSetup) => {
    setMicSetup(value);
    const ok = await save({ micSetup: value, researchState: value === 'none' ? 'declined' : 'confirmed' });
    if (ok && value !== 'none') next();
  };

  // P1386: a Lightning or "something else" phone with no mic. Consented, but the host cannot equip
  // them, so they are saved `eligible` (not `confirmed`): they take no recording place. A note and
  // Continue follow; USB-C and "bring my own" go through chooseMic above.
  const chooseMicNoLend = async (value: 'lightning' | 'other') => {
    // The note and Continue appear only once the answer is on record (chooseMic's rule too).
    const ok = await save({ micSetup: value, researchState: 'eligible' });
    if (ok) setMicSetup(value);
  };

  // Every step pins its bar at every width (founder UAT 2026-10-05): the actions stay in one place.
  // Round 8d: + the bottom-tab lift index.css sets inside the room's learning (0 elsewhere): the bars are raised there.
  const contentPadding = { paddingBottom: barHeight > 0 ? `calc(${barHeight + 24}px + var(--shell-bar-lift, 0px))` : 'max(1.5rem, env(safe-area-inset-bottom))' };
  const proof = state.proof;
  const label = seriesLabel(event);
  const eventPointCount = state.eventPoints?.length ?? null;
  const topic = eventTopic(event.title);
  const stepIndex = screen !== 'plan' && screen !== 'end' ? plan.indexOf(screen) : -1;
  // Visual review round 5 (D): opened from the room's Learn step, the back arrow sits in the room's row, inline with the bar.
  const roomRow = inRoom && !thenJoin;
  // The join context carries its own back arrow; the room row's Back is the shell's "Back to the event" (round 6, G).
  const ownRow = thenJoin;
  // Round 6: the room bar ticks what this person actually did — Opt in once answered, Give feedback once finished.
  // Read-only lookups (get_my_room_status never joins the room).
  const [roomAnswered, setRoomAnswered] = useState(false);
  useEffect(() => {
    if (!roomRow || embedded) return;
    let cancelled = false;
    // Round 7e (metered-services rule 3): no request from a hidden tab.
    const cancelWait = whenVisible(() => {
      getMyRoomStatus(event.id).then((me) => { if (!cancelled) setRoomAnswered(me?.optedIn != null); }).catch(() => undefined);
    });
    return () => { cancelled = true; cancelWait(); };
  }, [roomRow, embedded, event.id]);
  const feedbackFinished = useFeedbackFinished(event.id, roomRow && !embedded && !!roomRecipe.roomClose.finished);
  // Round 6 (F): where the room would open now — Give feedback once it is open and its default, else Opt in.
  const roomNext: RoomStep = feedbackAlwaysOpen(event) && defaultRoomStep(event) === 'close' ? 'close' : 'principle';
  const headerBack = () => {
    if (screen === 'plan' || screen === 'end') return leavePlan();
    // Round 8f: reviewing finished learning, the back arrow on any step returns to the ticked list (never out of the room).
    if (reviewing) {
      setScreen('plan');
      window.scrollTo(0, 0);
      return;
    }
    if (screen === 'principle') return principleBack();
    if (screen === 'research' && micAsked) {
      if (micNeeded) setMicNeeded(false); else setMicAsked(false);
      window.scrollTo(0, 0);
      return;
    }
    back();
  };

  const statementsBar = (count: Count, loaded: boolean, firstUnansweredId: string | null) => (
    <StatementsActions
      ref={barRef}
      count={count}
      loaded={loaded}
      firstUnansweredId={firstUnansweredId}
      onContinue={() => next('completed')}
      onSkip={() => next('skipped')}
      onRecheck={state.reloadPoints}
    />
  );

  const videoBar = (clip: VideoKey, onContinue: (played: boolean) => void) => (
    <StepActions ref={barRef}>
      {clipPlayed[clip] ? (
        <LetterPrimaryCta label="Continue" onClick={() => onContinue(true)} />
      ) : (
        // Founder (2026-10-02): Play the video on top, the skip as a small link under it — the link
        // reads as the fallback, not an equal choice, so more people play the clip.
        <>
          <LetterPrimaryCta label="Play the video" onClick={() => setPlayRequest((n) => n + 1)} />
          <LetterPrimaryCta label="Continue without video" onClick={() => onContinue(false)} variant="secondary" />
        </>
      )}
    </StepActions>
  );
  const markPlayed = (clip: VideoKey) => () => setClipPlayed((p) => ({ ...p, [clip]: true }));

  const hostAvatar = (size: 'sm' | 'md' | 'xl') => <HostAvatar event={event} size={size} />;

  const showPrincipleView = screen === 'principle' && principleIntroDone && !(answer !== null && !tryAsked);
  const optedInLine = proof ? socialProofLine('opted in at', proof.optedInPrevious, proof.optedInThis, label) : null;
  const eventAnswered = (state.eventPoints ?? []).some(isAnswered);

  // Round 8b: embedded in the room, the step header is portalled into the room's sticky head (pinned like the room's
  // own bar); nothing is drawn while the learning is hidden.
  const headSlot = room?.headSlot ?? null;
  const placeHeader = (node: ReactNode) => (embedded ? (headSlot ? createPortal(node, headSlot) : null) : node);
  if (autoFinishing) return <ClarityContentLoader />;

  return (
    // data-close-shell: in the room's frame the pinned bars rise above the phone's bottom tabs (index.css).
    <div className={cn(!embedded && 'min-h-[100dvh]', 'bg-background')} data-testid="p1336-prep" data-close-shell={inRoom ? '' : undefined} data-in-room={inRoom ? '' : undefined}>
      {/* Round 6 (G): inside the room the header is the room's own: the shell's "← Back to the event" (portalled into
          the shell top bar, like the room's), then the step bar, sticky like the room's — same place on every view. */}
      {roomRow && !embedded && <FocusHeader onBack={backToEvent} label="Back to the event" aria-label="Back to the event" />}
      {(embedded ? stepIndex >= 0 : stepIndex >= 0 || screen === 'plan' || inRoom) && placeHeader(
        <div
          ref={headerRef}
          data-shell-bar={inRoom && !roomRow ? '' : undefined}
          className={cn(
            'bg-background',
            embedded
              ? 'border-t border-border'
              : roomRow
              ? cn('sticky top-[env(safe-area-inset-top)] z-20', stepIndex >= 0 && 'border-b border-border')
              : 'fixed inset-x-0 top-0 z-50 border-b border-border pt-[env(safe-area-inset-top)]',
          )}
        >
          {/* Visual review round 5: entered from the feedback thank-you's Join, the learning is step 1 of joining, not
              a trip back to the room's start: a small join context instead of the room's step bar. */}
          {thenJoin && (
            // Round 5d: the back arrow inline, left of the join context (as on the group terms after it).
            <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2" data-testid="learn-join-context">
              <FocusHeader compact onBack={headerBack} aria-label="Back" />
              <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground" data-testid="learn-join-title">Joining {community ?? 'the community'}</p>
              <p className="text-xs text-muted-foreground" data-testid="learn-join-step">Part 1 of 2 · Short introduction</p>
              </div>
            </div>
          )}
          {roomRow && !embedded && (
            // The room's step bar, in the room's own container (no Transcribe bar on a hike: founder decision 2).
            <div className={cn(BAR_INNER_CLASS, 'flex items-end gap-1 pt-3 pb-2')} data-testid="learn-room-steps">
              <RoomSteps
                className="min-w-0 flex-1"
                current={feedbackAlwaysOpen(event) ? 'close' : 'principle'}
                viewing={null}
                onSelect={toRoom}
                hidden={[...(roomRecipe.room.readiness ? [] : ['ready' as const]), ...(roomRecipe.room.rounds ? [] : ['table' as const, 'compare' as const])]}
                labels={roomRecipe.room.steps ? { principle: roomRecipe.room.steps.principle, close: roomRecipe.room.steps.close } : undefined}
                learn={{ done: state.learned, active: true, label: roomRecipe.room.steps?.learn ?? undefined, onOpen: () => undefined }}
                done={{ principle: roomAnswered, close: feedbackFinished === true }}
              />
            </div>
          )}
          {/* The letter flow's header: back arrow, then the step name over LetterProgressBar. */}
          {(stepIndex >= 0 || (screen === 'plan' && !inRoom)) && (
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2" data-testid="step-header">
            {!ownRow && <button
              type="button"
              onClick={headerBack}
              aria-label="Back"
              data-testid="header-back"
              className="flex-shrink-0 -ml-1 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>}
            {screen === 'plan' ? (
              <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground" data-testid="step-name">{words ? '' : 'Preparation'}</p>
            ) : (
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-semibold leading-snug text-foreground" data-testid="step-name">
                {stepLabel(screen as PlanStep, eventPointCount, topic)}
              </p>
              <LetterProgressBar
                currentChapter={stepIndex}
                totalChapters={plan.length}
                stepCount={screen === 'principle' ? 3 : 1}
                committedSteps={screen === 'principle' ? (principleIntroDone ? 1 : 0) + (answer !== null ? 1 : 0) : 0}
                label={`Step ${stepIndex + 1} of ${plan.length}`}
              />
            </div>
            )}
          </div>
          )}
        </div>
      )}
      {(stepIndex >= 0 || screen === 'plan' || inRoom) && !roomRow && <div style={{ height: headerHeight }} aria-hidden />}

      {showPrincipleView ? (
        <MeetingPrincipleView
          level={PRINCIPLE_LEVEL}
          answer={answer}
          rating={principleRating}
          onAnswer={(a) => void choosePrinciple(a)}
          onRatingChange={setPrincipleRating}
          onRatingSubmit={() => void confirmRating()}
          submitLabel="Confirm"
          question={HOST_VOICED_UNDERSTANDING_QUESTION}
          header={
            answer === null ? (
              <h1 className="pt-2 text-center text-2xl font-bold leading-tight text-foreground" data-testid="principle-decision-question">
                {recipeFor(event.seriesSlug).room.principleQuestion.prepare}
              </h1>
            ) : undefined
          }
          aboveChoice={
            optedInLine ? (
              <div className="pb-3" data-testid="opted-in-proof-bar">
                <SocialProof testId="opted-in-proof" people={proof?.optedInPeople ?? []} line={optedInLine} />
              </div>
            ) : undefined
          }
          ratingBarClassName="animate-in slide-in-from-bottom duration-300"
          // P1387 (founder, 2026-10-02): who asks sits IN the drawer, next to the answer — a small
          // avatar and one line — and the question is in the host's own voice ("my"), so it relates
          // to the principle above without a long name in it.
          aboveRating={<HostAsksLine event={event} />}
          // Round 6c (G): a hike's certificate says "this hike" and balances its lines (Clarity Night keeps its own).
          certificateKicker={words ? recipeFor(event.seriesSlug).room.principleKicker : undefined}
          balancedCertificate={!!words}
        />
      ) : (
        <main className="mx-auto max-w-2xl space-y-6 px-4 pt-4" style={contentPadding}>
          {screen === 'plan' && (
            // UAT 2026-10-01: the list and its button are one unit — the button sits under the list
            // at every width (pinned, it floated far below on desktop and covered step 6 at 320px).
            <section className="space-y-6 pt-4 lg:pt-10">
              <div className="space-y-1">
                {/* [DRAFT] */}
                {/* Visual review round 5: the resolved name at every width (never the fallback while the name is loading). */}
                <Title>{words ? (community === undefined ? '\u00a0' : words.planTitle(community)) : 'Your preparation'}</Title>
                <p className="text-base text-muted-foreground" data-testid="plan-summary">
                  {plan.length} {plan.length === 1 ? 'step' : 'steps'}
                  {state.minutes !== null && <> · about {state.minutes} min</>}
                </p>
              </div>
              <ol data-testid="agenda">
                {plan.map((s, i) => {
                  const done = stepsDone.includes(s);
                  const last = i === plan.length - 1;
                  return (
                    <li key={s} className="relative flex gap-3" data-testid={`agenda-step-${i + 1}`}>
                      {/* Round 8e: reviewing finished learning, every row opens its step again (the whole row is the target).
                          P1542 (A): in a hike, a finished row opens at any time. */}
                      {(reviewing || (keepFinished && done)) && (
                        <button
                          type="button"
                          className="absolute inset-0 z-10 rounded-md hover:bg-muted/40"
                          aria-label={`Open again: ${stepLabel(s, eventPointCount, topic)}`}
                          onClick={() => reviewStep(s)}
                          data-testid={`agenda-open-${i + 1}`}
                        />
                      )}
                      <div className="flex flex-col items-center">
                        <span
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                            done ? 'bg-blue-500 text-white' : 'bg-muted text-foreground/70',
                          )}
                        >
                          {done ? <Check className="h-4 w-4" aria-label="Done" /> : i + 1}
                        </span>
                        {!last && <span className="my-1 w-px flex-1 bg-border" aria-hidden="true" />}
                      </div>
                      <div className={cn('flex min-w-0 flex-1 items-start justify-between gap-3 pt-1', !last && 'pb-6')}>
                        <p className={cn('min-w-0 text-base font-medium leading-snug text-foreground', done && 'text-muted-foreground')}>
                          {stepLabel(s, eventPointCount, topic)}
                        </p>
                        {/* Visual review round 5 (item 5): until the statements have loaded the card counts are 0, so a
                            row read "1 min" while the total was still missing. Rows and total now appear together. */}
                        {state.minutes !== null && (
                          <span className="shrink-0 pt-0.5 text-sm tabular-nums text-muted-foreground" data-testid={`agenda-minutes-${i + 1}`}>
                            {stepMinutes(s, state.cards, state.withPrincipleIntro)} min
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <StepActions ref={barRef}>
                {reviewing && words ? (
                  <LetterPrimaryCta label={roomNext === 'close' ? words.roomEnd.toFeedback : words.roomEnd.toOptIn} onClick={() => finishInRoom(roomNext)} />
                ) : (
                  <LetterPrimaryCta label="Start now" onClick={start} />
                )}
                {/* Round 6 (G): no second way out here — the header's "Back to the event" is it (the old link said
                    "Back to the event" but went to the room). */}
              </StepActions>
            </section>
          )}

          {screen === 'welcome' && (
            <section className="space-y-5">
              <div className="space-y-2">
                <Title>How this event is different</Title>
                <p className="text-base leading-relaxed text-muted-foreground" data-testid="welcome-intro">
                  In our events, we reward revealing gaps in cognitive understanding.
                </p>
              </div>
              <Clip clip="welcome" pulse={!clipPlayed.welcome} onPlay={markPlayed('welcome')} playRequest={playRequest} />
              {videoBar('welcome', (played) => next(played ? 'completed' : 'skipped'))}
            </section>
          )}

          {screen === 'story' && (
            <section className="space-y-5">
              <div className="space-y-2">
                <Title>What is cognitive understanding?</Title>
                <p className="text-base leading-relaxed text-muted-foreground" data-testid="story-intro">
                  I explain back your intended meaning, and you rate me 10 out of 10: verified cognitive understanding.
                  It&apos;s not agreement, and it&apos;s not feeling what you feel.
                </p>
              </div>
              <Clip clip="story" pulse={!clipPlayed.story} onPlay={markPlayed('story')} playRequest={playRequest} />
              {videoBar('story', (played) => next(played ? 'completed' : 'skipped'))}
            </section>
          )}

          {screen === 'principle' && !principleIntroDone && (
            <section className="space-y-5">
              <div className="space-y-2">
                <Title>Introducing the Clarity Meeting Principle</Title>
                {/* [DRAFT] */}
                <p className="text-base leading-relaxed text-muted-foreground" data-testid="principle-intro">
                  It makes the conversations at the event more meaningful. Every attendee can opt in or opt out, both
                  are completely fine. Watch the video, then decide.
                </p>
              </div>
              <Clip clip="principle" onPlay={markPlayed('principle')} playRequest={playRequest} />
              {videoBar('principle', (played) => {
                markPart('principle_intro', played ? 'completed' : 'skipped');
                setPrincipleIntroDone(true);
                window.scrollTo(0, 0);
              })}
            </section>
          )}

          {screen === 'principle' && principleIntroDone && answer !== null && !tryAsked && (
            <section className="flex flex-col items-center space-y-4 pt-8 text-center" data-testid={answer === 'in' ? 'try-it-now' : 'opt-out-ask'}>
              <div className="flex flex-col items-center gap-1">
                {hostAvatar('xl')}
                <p className="text-base font-semibold text-foreground" data-testid="host-caption">
                  {event.hostName} <span className="text-sm font-normal text-muted-foreground">· Your event host</span>
                </p>
              </div>
              <p className="text-lg leading-relaxed text-foreground">
                {answer === 'in'
                  ? "Thank you for opting in. You promised that anybody at the event can ask you a specific question, right? Let's try it now, to show how it works."
                  : "Thank you. It's completely okay to opt out. It usually means something is unclear, or you disagree. Before you continue, can I ask you one question?"}
              </p>
              <StepActions ref={barRef}>
                <ActionRow
                  primary={<LetterPrimaryCta label={answer === 'in' ? 'Try it now' : 'Yes'} onClick={() => { setTryAsked(true); window.scrollTo(0, 0); }} />}
                  secondary={answer === 'out' ? <LetterPrimaryCta label="No, continue" onClick={() => next()} variant="secondary" /> : undefined}
                />
              </StepActions>
            </section>
          )}

          {screen === 'cmp7' && (
            <section className="space-y-4">
              <Title>What is your value perception of the Clarity Meeting Principle?</Title>
              {state.cmp7Points && shownIds[CMP7_TAG] && (
                <StakeStep
                  tag={CMP7_TAG}
                  points={state.cmp7Points}
                  askedIds={shownIds[CMP7_TAG]}
                  onPointsChanged={state.reloadPoints}
                  onCountChange={setCmp7Count}
                />
              )}
              {statementsBar(cmp7Count, !!(state.cmp7Points && shownIds[CMP7_TAG]), firstUnanswered(state.cmp7Points, shownIds[CMP7_TAG]))}
            </section>
          )}

          {screen === 'stake' && tag && (
            <section className="space-y-4">
              <div className="space-y-2">
                <Title>
                  Set your positions on {shownIds[tag]?.length ?? (state.eventPoints ?? []).filter((p) => !isAnswered(p)).length} points
                  about “{topic}”
                </Title>
                {/* [DRAFT] */}
                <p className="text-base text-muted-foreground">
                  Your positions help us pair you with someone who sees it differently at the event.
                </p>
              </div>
              {state.eventPoints && shownIds[tag] && (
                <StakeStep
                  tag={tag}
                  points={state.eventPoints}
                  askedIds={shownIds[tag]}
                  onPointsChanged={state.reloadPoints}
                  onCountChange={setStakeCount}
                />
              )}
              {statementsBar(stakeCount, !!(state.eventPoints && shownIds[tag]), firstUnanswered(state.eventPoints, shownIds[tag]))}
            </section>
          )}

          {screen === 'research' && micAsked && (
            <section className="mx-auto max-w-md space-y-6 pt-4 text-center" data-testid="mic-question">
              {/* [DRAFT] founder's words (UAT 2026-10-01): why we ask, before the question. */}
              <p className="text-base leading-relaxed text-muted-foreground" data-testid="mic-why">
                To use a recording, we need to know who is speaking. That takes your voice loud and clear, louder than
                the people around you, so the microphone has to sit close to your mouth: a clip-on lavalier mic or a
                headset.
              </p>
              {!micNeeded ? (
                <>
                  <Title>Do you have a microphone to bring?</Title>
                  {/* P1387: the answers are this step's actions — pinned like every step's. */}
                  <StepActions ref={barRef}>
                    <div className="grid w-full grid-cols-1 gap-2" data-testid="mic-answers">
                      {([
                        ['own', "Yes, I'll bring my own"],
                        ['need', 'No, I need one'],
                      ] as const).map(([value, text]) => {
                        const chosen = value === 'own' ? micSetup === 'own' : micSetup !== null && micSetup !== 'own';
                        return (
                          <Button
                            key={value}
                            onClick={() => (value === 'own' ? void chooseMic('own') : setMicNeeded(true))}
                            size="lg"
                            variant="outline"
                            aria-pressed={chosen}
                            className={cn(
                              'h-auto min-h-12 min-w-0 whitespace-normal rounded-full bg-background px-4 text-base',
                              chosen && 'border-2 border-blue-600 font-semibold text-blue-600 hover:text-blue-600 dark:border-blue-400 dark:text-blue-300',
                            )}
                          >
                            {text}
                          </Button>
                        );
                      })}
                    </div>
                  </StepActions>
                </>
              ) : (
                <>
                  <Title>Which charging port does your phone have?</Title>
                  {/* P1387: pinned like every step's actions. After Lightning / Something else the bar swaps to the
                      note + Continue (+ Change my answer), as it does for the retired "no microphone" answer. */}
                  <StepActions ref={barRef}>
                    {micSetup === 'lightning' || micSetup === 'other' ? (
                      <div className="flex w-full flex-col items-center gap-3 animate-in fade-in duration-300" ref={micNoteRef}>
                        <p className="text-center text-base text-foreground" data-testid="mic-no-lend-note">
                          {micSetup === 'lightning'
                            ? "Thanks. We don't have Lightning microphones yet, so we can't promise you one. We'll tell you if that changes. You can still take part in the discussion."
                            : 'Thanks. We may not be able to lend you a microphone for that. You can still take part in the discussion.'}
                        </p>
                        <LetterPrimaryCta label="Continue" onClick={() => next()} />
                        <LetterPrimaryCta label="Change my answer" onClick={() => setMicSetup(null)} variant="secondary" />
                      </div>
                    ) : (
                      <div className="grid w-full grid-cols-1 gap-2" data-testid="mic-port-answers">
                        {([
                          ['usbc', 'USB-C', 'iPhone 15 and newer, and most Android phones'],
                          ['lightning', 'Lightning', 'iPhone 14 and older'],
                          ['other', 'Something else, or I\'m not sure', null],
                        ] as const).map(([value, text, hint]) => (
                          <Button
                            key={value}
                            disabled={micSaving}
                            onClick={async () => {
                              if (micSaving) return;
                              setMicSaving(true);
                              try {
                                if (value === 'usbc') await chooseMic('usbc');
                                else await chooseMicNoLend(value);
                              } finally {
                                setMicSaving(false);
                              }
                            }}
                            size="lg"
                            variant="outline"
                            aria-pressed={micSetup === value}
                            className={cn(
                              'h-auto min-h-12 min-w-0 flex-col gap-0 whitespace-normal rounded-full bg-background px-4 py-2 text-base',
                              micSetup === value && 'border-2 border-blue-600 font-semibold text-blue-600 hover:text-blue-600 dark:border-blue-400 dark:text-blue-300',
                            )}
                          >
                            <span>{text}</span>
                            {hint && <span className="text-sm font-normal text-muted-foreground">{hint}</span>}
                          </Button>
                        ))}
                      </div>
                    )}
                  </StepActions>
                </>
              )}
            </section>
          )}

          {screen === 'research' && !micAsked && (
            <section className="space-y-5">
              <Title>
                Are you open to be one of {numberWord(places)} volunteers who record their conversations at the event, to
                contribute to our R&amp;D?
              </Title>
              <p className="text-base text-foreground">
                We can lend you a USB-C lavalier microphone, or you can bring your own mic.
              </p>
              <Clip clip="research" />
              <div className="flex flex-col items-center text-center">
                  {placesLeft !== null && (
                    <p className="mb-2 text-base font-medium text-foreground" data-testid="places-left">
                      {placesLeft} of {places} volunteer places left
                    </p>
                  )}
                  <div className="mb-2 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setResearchInfoOpen(true)}
                      aria-haspopup="dialog"
                      className="inline-flex min-h-11 items-center text-sm text-blue-600 underline underline-offset-4"
                      data-testid="learn-more"
                    >
                      Learn how we use your data
                    </button>
                  </div>
              </div>
              <StepActions ref={barRef} className="px-0">
                <div className={cn(BAR_INNER_CLASS, 'flex flex-col items-center')}>
                  <div className="grid w-full grid-cols-2 gap-2" data-testid="research-answers">
                    <Button
                      onClick={() => void researchYes()}
                      disabled={researchSaving}
                      size="lg"
                      className="h-12 min-w-0 rounded-full bg-blue-600 px-2 text-base font-bold text-white hover:bg-blue-700"
                    >
                      Yes, sure
                    </Button>
                    <Button onClick={researchNo} size="lg" variant="outline" className="h-12 min-w-0 rounded-full px-2 text-base">
                      No, thanks
                    </Button>
                  </div>
                </div>
              </StepActions>
            </section>
          )}

          {screen === 'end' && roomRow && words && (
            // Round 6 (F, decision 44): learning finished inside the room keeps the room's frame and bar (Learn ticked),
            // says what was learned and names the room's next step, with ONE way on. No event box, calendar, group chat or
            // share here: the event page has them.
            <section className="flex flex-col items-center gap-3 pt-10 text-center" data-testid="learn-room-end">
              <Check className="h-8 w-8 text-green-600" aria-hidden="true" data-testid="learn-room-end-check" />
              <h1 className="text-2xl font-bold leading-tight text-foreground text-balance">{words.roomEnd.title}</h1>
              <p className="max-w-sm text-base text-muted-foreground text-balance" data-testid="learn-room-end-next">
                {roomNext === 'close' ? words.roomEnd.nextFeedback : words.roomEnd.nextOptIn}
              </p>
              <div className="w-full pt-3" data-testid="learn-room-end-actions">
                <LetterPrimaryCta label={roomNext === 'close' ? words.roomEnd.toFeedback : words.roomEnd.toOptIn} onClick={() => finishInRoom(roomNext)} />
              </div>
            </section>
          )}
          {screen === 'end' && !roomRow && (() => {
            const hasStories = !fromRoom && !!tag && !!experts && experts.length > 0;
            // Until the experts are read, the next action is not known: render no button rather than
            // one that changes under the person's finger.
            const actionsReady = fromRoom || experts !== null;
            const toEvent = backToEvent;
            return (
              // UAT 2026-10-01: what is new here leads — the thanks, then the next thing to do (the
              // stories, or the room), then the event box the person already saw on screen 0. P1387: the
              // buttons pin in ONE slim row like every step (the 2026-10-01 stacked bar covered the box).
              <section className="space-y-8 pt-4">
                <div className="space-y-2 text-center">
                  <Title>{words ? words.endTitle(community ?? null) : 'Thank you for preparing'}</Title>
                  {/* P1380: said once, where people plan their evening (founder-approved copy). P1542: a hike says
                      when and where it meets, plainly (its location is often a map link, still a real place). */}
                  {/* P1542 VQA round 5: a hike's card below already carries the time and meeting point, so the
                      line is not repeated (Clarity Night keeps its "We start at … sharp"). */}
                  {timeLine === 'meet' ? null : !isOnlineLocation(event.location) && (
                    <p className="text-sm text-foreground" data-testid="end-on-time">{onTimeLine(event.datetime)}</p>
                  )}
                  {(micSetup === 'usbc' || micSetup === 'own' || micSetup === 'lightning' || micSetup === 'other') && (
                    <p className="text-sm text-muted-foreground" data-testid="volunteer-note">
                      {micSetup === 'usbc'
                        ? "You're a recording volunteer. We'll bring a USB-C mic for you."
                        : micSetup === 'own'
                        ? "You're a recording volunteer. Please bring your own microphone."
                        : // lightning / other: not a recording place (saved eligible), so not "a volunteer".
                          "Thanks for offering to record. We'll tell you if we can lend you a microphone."}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-center gap-3 text-center" data-testid={fromRoom ? 'end-join-room' : 'end-actions'}>
                  {hasStories && (
                    <div className="space-y-2" data-testid="end-stories">
                      <h2 className="text-xl font-semibold text-foreground">Interested in enriching your perspective before the event?</h2>
                      <p className="text-base leading-relaxed text-muted-foreground">
                        Our AI agents predicted how {joinNames(experts!.map((n) => stripAgentPrefix(n) ?? n))} would answer the{' '}
                        {eventPointCount ?? ''} points {eventAnswered ? 'you took a position on' : "we'll discuss"}. Each position
                        comes with a story that explains it.
                      </p>
                    </div>
                  )}
                  {/* P1542 VQA round 5: a hike's end of learning is a destination inside the app menu (see
                      useDeclareAppMenu above), so its one way on sits in the page, not in a bar over the tabs. */}
                  {words && actionsReady && (
                    <div className="flex w-full max-w-sm flex-col items-center gap-1" data-testid="end-inline-actions">
                      {/* Opened from the room, the end is the in-room screen above (round 6, F); this one is the event's. */}
                      <LetterPrimaryCta label="Back to the event" onClick={toEvent} />
                    </div>
                  )}
                  {/* P1387: pinned like every step's actions, on one row. */}
                  {!words && actionsReady && (
                  <StepActions ref={barRef}>
                    <ActionRow
                      primary={
                        fromRoom ? (
                          <LetterPrimaryCta label="Join the room" onClick={() => navigate(`/events/${event.slug}/room`)} />
                        ) : hasStories ? (
                          <LetterPrimaryCta label="Read their stories" onClick={() => navigate(`/stake/${tag}?tab=stories`)} />
                        ) : (
                          <LetterPrimaryCta label="Back to the event" onClick={toEvent} />
                        )
                      }
                      secondary={fromRoom || hasStories ? <LetterPrimaryCta label="Back to the event" onClick={toEvent} variant="secondary" /> : undefined}
                    />
                  </StepActions>
                  )}
                </div>
                <EventBox event={event} groupChatUrl={groupChatUrl} testId="end-card" title={null} plainChatLine={!!words} />
              </section>
            );
          })()}
        </main>
      )}

      <Dialog open={researchInfoOpen} onOpenChange={setResearchInfoOpen}>
        <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-md" data-testid="research-dialog">
          <DialogHeader>
            <DialogTitle>How we use your data</DialogTitle>
            <DialogDescription className="sr-only">Questions and answers about the voice recording.</DialogDescription>
          </DialogHeader>
          <dl className="-mx-6 min-h-0 flex-1 space-y-4 overflow-y-auto border-y border-border px-6 py-4" data-testid="research-qa">
            {RESEARCH_QA.map(({ q, a }) => (
              <div key={q} className="space-y-1">
                <dt className="text-sm font-semibold text-foreground">{q}</dt>
                <dd className="text-sm text-muted-foreground">{a}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground" data-testid="research-legal">
            <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Terms</a>
            {' · '}
            <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Privacy</a>
            {' · '}
            <a href={RESEARCH_PROGRAMME_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              Read more about our research program
            </a>
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
