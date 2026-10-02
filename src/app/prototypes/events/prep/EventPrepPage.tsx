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
import { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { cn, stripAgentPrefix } from '@/lib/utils';
import { useAuth } from '@/auth';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Mp4VideoFacade } from '@/app/components/shared/mp4-video-facade';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import { LetterProgressBar } from '@/app/components/letters/letter-progress-bar';
import { BAR_INNER_CLASS, MeetingPrincipleView, type PrincipleAnswer } from '@/app/components/agreements/meeting-principle-view';
import { StakePage } from '@/app/pages/stake-page';
import { eventsService } from '@/app/data/events-service';
import { storiesService } from '@/app/data/stories-service';
import { getAgentAccounts } from '@/app/data/agent-accounts-service';
import {
  getResearchPlacesLeft,
  markPrepPart,
  savePreparation,
  type MicSetup,
  type PrepPatch,
  type PrepStepKey,
} from '@/app/data/event-prep-service';
import type { EventWithHost, PointWithUserPosition } from '@/app/types';
import {
  CLIP_PLAY_LABELS,
  CLIP_POSTER_ALT,
  clipUrl,
  RESEARCH_POLICY_VERSION,
  RESEARCH_PROGRAMME_URL,
  RESEARCH_QA,
  TRANSCRIPTS,
} from './prep-content';
import {
  CMP7_TAG,
  eventTopic,
  PART_VERSIONS,
  PLAYBACK_RATE,
  PRINCIPLE_LEVEL,
  STEP_PART,
  stepLabel,
  stepMinutes,
  watchSeconds,
  type ClipKey,
  type PlanStep,
} from './prep-plan';
import { EventBox, seriesLabel, SocialProof, socialProofLine } from './PrepPieces';
import { isAnswered, usePrepState, type PrepState } from './use-prep-state';

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
  if (!event || !event.preparationEnabled) return <Navigate to={`/events/${slug}`} replace />;
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

// ─── small pieces ──────────────────────────────────────────────────────────────────────

/** Height of a fixed element, kept current (same approach as MeetingPrincipleView's bar). */
/**
 * P1387: a step's actions, in the page after its content — not a bar fixed to the bottom. On a
 * phone a fixed bar (progress + two buttons) plus the fixed step header left a ~40% scroll slot
 * in the middle of the screen; the founder chose one scrolling page (2026-10-02).
 */
const StepActions = forwardRef<HTMLDivElement, { children: ReactNode; className?: string }>(
  function StepActions({ children, className }, ref) {
    return (
      <div ref={ref} className={cn('flex flex-col items-center pt-2', className)} data-testid="step-actions">
        {children}
      </div>
    );
  },
);

function useMeasuredHeight(): [(node: HTMLDivElement | null) => void, number] {
  const [height, setHeight] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) {
      setHeight(0);
      return;
    }
    setHeight(node.getBoundingClientRect().height);
    if (typeof ResizeObserver !== 'undefined') {
      const o = new ResizeObserver(([entry]) => {
        if (entry) setHeight(entry.target.getBoundingClientRect().height);
      });
      o.observe(node);
      observer.current = o;
    }
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, height];
}

function Title({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-bold leading-tight text-foreground">{children}</h1>;
}

/** "Read the transcript" under every clip — StoryMedia's "Read video summary" link pattern (P1349). */
function Transcript({ clip }: { clip: ClipKey }) {
  const [open, setOpen] = useState(false);
  const id = `transcript-${clip}`;
  return (
    <div data-testid={id}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${id}-text`}
        className="ml-auto flex h-10 w-fit items-center gap-1 text-sm text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-400"
      >
        <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {open ? 'Hide the transcript' : 'Read the transcript'}
      </button>
      {open && (
        <div id={`${id}-text`} className="mt-1 space-y-3 text-base leading-relaxed text-muted-foreground animate-in fade-in duration-300">
          {TRANSCRIPTS[clip].map((para) => (
            <p key={para.slice(0, 32)}>{para}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function Clip({ clip, pulse = false, onPlay, playRequest = 0 }: { clip: ClipKey; pulse?: boolean; onPlay?: () => void; playRequest?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  // The bar's "Play the video" bumps playRequest; the poster's own button starts it.
  useEffect(() => {
    if (playRequest > 0) ref.current?.querySelector<HTMLButtonElement>('button')?.click();
  }, [playRequest]);
  return (
    <div>
      <div ref={ref} data-testid={`clip-${clip}`}>
        <Mp4VideoFacade
          look="story"
          src={clipUrl(clip, 'video')}
          poster={clipUrl(clip, 'poster')}
          posterAlt={CLIP_POSTER_ALT[clip]}
          playLabel={CLIP_PLAY_LABELS[clip]}
          durationSeconds={watchSeconds(clip)}
          pulse={pulse}
          onPlay={onPlay}
          playbackRate={PLAYBACK_RATE}
        />
      </div>
      <Transcript clip={clip} />
    </div>
  );
}

interface Count { answered: number; total: number }

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

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

// ─── flow ──────────────────────────────────────────────────────────────────────────────

type Screen = 'plan' | PlanStep | 'end';
type VideoKey = 'welcome' | 'story' | 'principle';

function PrepFlow({
  event,
  groupChatUrl,
  state,
  viewerId,
}: {
  event: EventWithHost;
  groupChatUrl: string | null;
  state: PrepState;
  viewerId: string;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromRoom = searchParams.get('from') === 'room';
  const { prep, plan } = state;
  const tag = event.statementTag ?? null;

  const resumeScreen = (): Screen => {
    if (prep?.completedAt) return 'end';
    if (!prep?.startedAt) return 'plan';
    const done = prep.stepsDone;
    const current = prep.currentStep as PlanStep | null;
    if (current && plan.includes(current) && !done.includes(current)) return current;
    return plan.find((s) => !done.includes(s)) ?? 'end';
  };
  const [screen, setScreen] = useState<Screen>(resumeScreen);
  // The end screen is a destination: ?done=1 brings the app menus back (immersive-letter-route.ts),
  // so a prepared attendee always has a way on. Every other screen stays immersive.
  useEffect(() => {
    const isDone = searchParams.get('done') === '1';
    if ((screen === 'end') === isDone) return;
    const params = new URLSearchParams(searchParams);
    if (screen === 'end') params.set('done', '1');
    else params.delete('done');
    setSearchParams(params, { replace: true });
  }, [screen, searchParams, setSearchParams]);
  const [stepsDone, setStepsDone] = useState<PrepStepKey[]>(prep?.stepsDone ?? []);
  const [playRequest, setPlayRequest] = useState(0);
  const [clipPlayed, setClipPlayed] = useState<Record<VideoKey, boolean>>({ welcome: false, story: false, principle: false });
  // Principle: (a) intro + clip (once per person), (b) the decision, (c) host line, (d) 0-10.
  const [principleIntroDone, setPrincipleIntroDone] = useState(!state.withPrincipleIntro);
  const [answer, setAnswer] = useState<PrincipleAnswer>(null);
  const [tryAsked, setTryAsked] = useState(false);
  const [principleRating, setPrincipleRating] = useState<number | null>(null);
  const [researchInfoOpen, setResearchInfoOpen] = useState(false);
  const [micAsked, setMicAsked] = useState(false);
  const [micSetup, setMicSetup] = useState<MicSetup | null>(prep?.micSetup ?? null);
  const [researchSaving, setResearchSaving] = useState(false);
  const [placesLeft, setPlacesLeft] = useState<number | null>(null);
  const [experts, setExperts] = useState<string[] | null>(null);
  const [cmp7Count, setCmp7Count] = useState<Count>({ answered: 0, total: 0 });
  const [stakeCount, setStakeCount] = useState<Count>({ answered: 0, total: 0 });
  const [shownIds, setShownIds] = useState<ShownIds>(() => readShown(event.id, viewerId));
  useEffect(() => { writeShown(event.id, viewerId, shownIds); }, [event.id, viewerId, shownIds]);
  const [headerRef, headerHeight] = useMeasuredHeight();

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
    if ((shownIds[t]?.length ?? 0) > 0) return false;
    const pts = pointsFor(s);
    return pts !== null && pts.every(isAnswered);
  };

  /** First entry into a statements step snapshots the unanswered cards it shows. */
  useEffect(() => {
    if (screen !== 'cmp7' && screen !== 'stake') return;
    const t = tagFor(screen);
    const pts = pointsFor(screen);
    if (!t || !pts || shownIds[t]) return;
    setShownIds((prev) => ({ ...prev, [t]: pts.filter((p) => !isAnswered(p)).map((p) => p.id) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, state.cmp7Points, state.eventPoints, shownIds]);

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

  const markPart = useCallback((part: keyof typeof PART_VERSIONS, outcome: 'completed' | 'skipped') => {
    markPrepPart(viewerId, part, PART_VERSIONS[part], outcome).catch(() => undefined);
  }, [viewerId]);

  const go = useCallback(async (next: Screen, done: PrepStepKey[], extra: PrepPatch = {}) => {
    // "Prepared ✓" is only shown once completed_at is on record.
    if (next === 'end') {
      const ok = await save({ ...extra, stepsDone: done, currentStep: null, completedAt: new Date().toISOString() });
      if (!ok) return;
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
  }, [save, state.withPrincipleIntro]);

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
    // Passed-over statements steps count as done too (nothing left to answer).
    const rest = plan.slice(plan.indexOf(screen) + 1);
    const target = rest.find((s) => !done.includes(s) && !isSkippable(s));
    const skippedOver = rest.slice(0, target ? rest.indexOf(target) : rest.length).filter((s) => !done.includes(s));
    skippedOver.forEach((s) => {
      const p = STEP_PART[s];
      if (p) markPart(p, 'completed');
    });
    const allDone = [...done, ...skippedOver];
    setStepsDone(allDone);
    void go(target ?? 'end', allDone);
  };

  const back = () => {
    if (screen === 'plan' || screen === 'end') return;
    const before = plan.slice(0, Math.max(plan.indexOf(screen), 0)).reverse();
    const target = before.find((s) => !isSkippable(s)) ?? 'plan';
    setScreen(target);
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
      researchState: 'eligible',
      researchConsentedAt: new Date().toISOString(),
      researchPolicyVersion: RESEARCH_POLICY_VERSION,
    });
    setResearchSaving(false);
    if (!ok) return;
    setMicAsked(true);
    window.scrollTo(0, 0);
  };

  // Bring the "no microphone" note and its Continue into view once, when that answer is chosen.
  const micNoteRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (micSetup === 'none') micNoteRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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

  // The step actions are in the page now (P1387): only the safe area to clear at the bottom.
  const contentPadding = { paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' };
  const proof = state.proof;
  const label = seriesLabel(event);
  const eventPointCount = state.eventPoints?.length ?? null;
  const topic = eventTopic(event.title);
  const hostFirst = firstName(event.hostName);
  const stepIndex = screen !== 'plan' && screen !== 'end' ? plan.indexOf(screen) : -1;

  const statementsBar = (count: Count, loaded: boolean) => {
    const allSet = loaded && count.answered >= count.total;
    return (
      <StepActions>
        {loaded && (
          <div
            key={count.answered}
            className={cn('mb-3 w-full max-w-sm', count.answered > 0 && 'animate-in zoom-in-95 duration-300')}
            aria-live="polite"
            data-testid="answered-count"
          >
            <LetterProgressBar
              currentChapter={0}
              totalChapters={1}
              stepCount={Math.max(count.total, 1)}
              committedSteps={count.answered}
              label={`${count.answered} of ${count.total} answered`}
              tone="subtle"
            />
          </div>
        )}
        <LetterPrimaryCta label="Continue" onClick={() => next('completed')} disabled={!allSet} />
        {!allSet && <LetterPrimaryCta label="Skip and proceed" onClick={() => next('skipped')} variant="secondary" />}
      </StepActions>
    );
  };

  const videoBar = (clip: VideoKey, onContinue: (played: boolean) => void) => (
    <StepActions>
      {clipPlayed[clip] ? (
        <LetterPrimaryCta label="Continue" onClick={() => onContinue(true)} />
      ) : (
        <>
          <LetterPrimaryCta label="Play the video" onClick={() => setPlayRequest((n) => n + 1)} />
          <LetterPrimaryCta label="Continue without video" onClick={() => onContinue(false)} variant="secondary" />
        </>
      )}
    </StepActions>
  );
  const markPlayed = (clip: VideoKey) => () => setClipPlayed((p) => ({ ...p, [clip]: true }));

  const hostAvatar = (size: 'md' | 'xl') => (
    <GravatarAvatar
      name={event.hostName}
      photoUrl={event.hostAvatarUrl ?? undefined}
      avatarColor={event.hostAvatarColor}
      isPledger={event.hostHasPledged ?? false}
      size={size}
    />
  );

  const showPrincipleView = screen === 'principle' && principleIntroDone && !(answer !== null && !tryAsked);
  const optedInLine = proof ? socialProofLine('opted in at', proof.optedInPrevious, proof.optedInThis, label) : null;
  const eventAnswered = (state.eventPoints ?? []).some(isAnswered);

  return (
    <div className="min-h-[100dvh] bg-background" data-testid="p1336-prep">
      {(stepIndex >= 0 || screen === 'plan') && (
        <div ref={headerRef} className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
          {/* The letter flow's header: back arrow, then the step name over LetterProgressBar. */}
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2" data-testid="step-header">
            <button
              type="button"
              onClick={
                screen === 'plan'
                  ? leavePlan
                  : screen === 'principle'
                  ? principleBack
                  : screen === 'research' && micAsked
                  ? () => { setMicAsked(false); window.scrollTo(0, 0); }
                  : back
              }
              aria-label="Back"
              data-testid="header-back"
              className="flex-shrink-0 -ml-1 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            {screen === 'plan' ? (
              <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground" data-testid="step-name">Preparation</p>
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
        </div>
      )}
      {(stepIndex >= 0 || screen === 'plan') && <div style={{ height: headerHeight }} aria-hidden />}

      {showPrincipleView ? (
        <MeetingPrincipleView
          level={PRINCIPLE_LEVEL}
          answer={answer}
          rating={principleRating}
          onAnswer={(a) => void choosePrinciple(a)}
          onRatingChange={setPrincipleRating}
          onRatingSubmit={() => void confirmRating()}
          submitLabel="Confirm"
          question={`How much do you think you understand ${hostFirst}'s intended meaning behind this principle?`}
          header={
            answer === null ? (
              <h1 className="pt-2 text-center text-2xl font-bold leading-tight text-foreground" data-testid="principle-decision-question">
                Do you want to follow this principle with the attendees at the event?
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
          actionsInline
          aboveRating={
            <div className="flex items-center gap-3 px-2 pb-2 sm:px-5" data-testid="rating-host">
              {hostAvatar('md')}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {event.hostName} <span className="font-normal text-muted-foreground">· Your event host</span>
                </p>
                <p className="text-sm text-foreground" data-testid="rating-context">
                  {answer === 'in' ? 'Thanks for trying it. Here is the question:' : 'Thanks for letting me ask. Here is the question:'}
                </p>
              </div>
            </div>
          }
        />
      ) : (
        <main className="mx-auto max-w-2xl space-y-6 px-4 pt-4" style={contentPadding}>
          {screen === 'plan' && (
            // UAT 2026-10-01: the list and its button are one unit — the button sits under the list
            // at every width (pinned, it floated far below on desktop and covered step 6 at 320px).
            <section className="space-y-6 pt-4 lg:pt-10">
              <div className="space-y-1">
                {/* [DRAFT] */}
                <Title>Your preparation</Title>
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
                    <li key={s} className="flex gap-3" data-testid={`agenda-step-${i + 1}`}>
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
                        <span className="shrink-0 pt-0.5 text-sm tabular-nums text-muted-foreground">
                          {stepMinutes(s, state.cards, state.withPrincipleIntro)} min
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="flex justify-center pb-8">
                <LetterPrimaryCta label="Start now" onClick={start} />
              </div>
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
              <StepActions>
                <LetterPrimaryCta
                  label={answer === 'in' ? 'Try it now' : 'Yes'}
                  onClick={() => { setTryAsked(true); window.scrollTo(0, 0); }}
                />
                {answer === 'out' && <LetterPrimaryCta label="No, continue" onClick={() => next()} variant="secondary" />}
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
              {statementsBar(cmp7Count, !!(state.cmp7Points && shownIds[CMP7_TAG]))}
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
              {statementsBar(stakeCount, !!(state.eventPoints && shownIds[tag]))}
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
              <div className="space-y-2">
                <Title>Does your phone have a USB-C port?</Title>
                <p className="text-base text-muted-foreground">iPhone 15 and newer, and most Android phones, do.</p>
              </div>
              <div className="grid w-full grid-cols-1 gap-2" data-testid="mic-answers">
                {([
                  ['usbc', 'Yes, USB-C'],
                  ['own', "No, I'll bring my own microphone"],
                  ['none', "No, and I don't have a microphone"],
                ] as const).map(([value, text]) => (
                  <Button
                    key={value}
                    onClick={() => void chooseMic(value)}
                    size="lg"
                    variant="outline"
                    aria-pressed={micSetup === value}
                    className={cn(
                      'h-auto min-h-12 min-w-0 whitespace-normal rounded-full bg-background px-4 text-base',
                      micSetup === value && 'border-2 border-[#0044CC] font-semibold text-[#0044CC] hover:text-[#0044CC] dark:border-blue-400 dark:text-blue-300',
                    )}
                  >
                    {text}
                  </Button>
                ))}
              </div>
              {micSetup === 'none' && (
                // In the page, under the answers (not pinned): a pinned bar covered the chosen answer
                // and this note at 320px.
                <div className="flex flex-col items-center gap-4 animate-in fade-in duration-300" ref={micNoteRef}>
                  <p className="text-base text-foreground" data-testid="mic-none-note">
                    Thanks. You can still take part in the discussion without recording.
                  </p>
                  <LetterPrimaryCta label="Continue" onClick={() => next()} />
                </div>
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
                We provide you with a USB-C lavalier microphone, or you can bring your own mic.
              </p>
              <Clip clip="research" />
              <StepActions className="px-0">
                <div className={cn(BAR_INNER_CLASS, 'flex flex-col items-center')}>
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
                      className="inline-flex min-h-10 items-center text-sm text-blue-600 underline underline-offset-4"
                      data-testid="learn-more"
                    >
                      Learn how we use your data
                    </button>
                  </div>
                  <div className="grid w-full grid-cols-2 gap-2" data-testid="research-answers">
                    <Button
                      onClick={() => void researchYes()}
                      disabled={researchSaving}
                      size="lg"
                      className="h-12 min-w-0 rounded-full bg-[#0044CC] px-2 text-base font-bold text-white hover:bg-[#0033AA]"
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

          {screen === 'end' && (() => {
            const hasStories = !fromRoom && !!tag && !!experts && experts.length > 0;
            // Until the experts are read, the next action is not known: render no button rather than
            // one that changes under the person's finger.
            const actionsReady = fromRoom || experts !== null;
            const toEvent = () => navigate(`/events/${event.slug}`);
            return (
              // UAT 2026-10-01: what is new here leads — the thanks, then the next thing to do (the
              // stories, or the room), then the event box the person already saw on screen 0. All in the
              // page: a pinned bar covered the box's own actions at 320px and cut the stories heading.
              <section className="space-y-8 pt-4">
                <div className="space-y-2 text-center">
                  <Title>Thank you for preparing</Title>
                  {(micSetup === 'usbc' || micSetup === 'own') && (
                    <p className="text-sm text-muted-foreground" data-testid="volunteer-note">
                      You&apos;re a recording volunteer.{' '}
                      {micSetup === 'usbc' ? "We'll bring a USB-C mic for you." : 'Please bring your own microphone.'}
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
                  {actionsReady && (
                  <div className="flex w-full flex-col items-center gap-1">
                    {fromRoom ? (
                      <LetterPrimaryCta label="Join the room" onClick={() => navigate(`/events/${event.slug}/room`)} />
                    ) : hasStories ? (
                      <LetterPrimaryCta label="Read their stories" onClick={() => navigate(`/stake/${tag}?tab=stories`)} />
                    ) : (
                      <LetterPrimaryCta label="Back to the event" onClick={toEvent} />
                    )}
                    {(fromRoom || hasStories) && <LetterPrimaryCta label="Back to the event" onClick={toEvent} variant="secondary" />}
                  </div>
                  )}
                </div>
                <EventBox event={event} groupChatUrl={groupChatUrl} testId="end-card" title={null} />
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
