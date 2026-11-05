/**
 * @file PreparePage.tsx
 * @description P1402 — `/prepare`: learning the Clarity process without an event, a tool next to
 * /meet and /ready. Anyone can open it, signed in or not — it is the general onboarding for
 * someone who is not logged in (founder UAT, 2026-10-04).
 *
 * It is the permanent home of the content (founder: "In /prepare, they will be always able to
 * find it … it doesn't need to hide anything"), so unlike the event preparation it never drops a
 * part someone already did: every step stays listed, done ones carry a check and can be replayed.
 *
 * Steps: the cognitive-understanding story; the Clarity Meeting Principle (intro clip, the
 * principle at /meet's level 3, then the event preparation's own follow-up — "try it now" after
 * opting in, "can I ask you one question?" after opting out — and the 0-10); the cmp7 statements;
 * the misunderstanding statements (the diagnosis). The event-only steps stay in the event's
 * preparation: the welcome clip speaks about "the discussion we will have today", and the
 * positions and research steps need an event.
 *
 * Progress is the same once-per-person record the event preparation reads (person_prep_parts).
 * Signed out it is held in this browser (prep-local-parts.ts) and joins the account at the first
 * read after sign-in; statement answers ride the existing anonymous-position path (P502). So a
 * part done here is skipped in any event's preparation later — one direction only.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EVENTS_LIST_TO } from '@/app/components/layout/nav-links';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { ArrowLeft, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { withDeadline } from '@/lib/with-deadline';
import { useAuth } from '@/auth';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import { LetterProgressBar } from '@/app/components/letters/letter-progress-bar';
import { MeetingPrincipleView, PRINCIPLE_TITLE, type PrincipleAnswer } from '@/app/components/agreements/meeting-principle-view';
import { CertificateFrame, CertificateOathBody } from '@/app/components/agreements/certificate-frame';
import { sectionsForLevel } from '@/app/content/meeting-terms';
import { StakePage } from '@/app/pages/stake-page';
import { getAnonPosition } from '@/app/hooks/useAnonPosition';
import { getProfileBySlug } from '@/app/data/api';
import { LETTER_FOUNDER_SLUG } from '@/app/data/offline-reads-letters';
import { getMyPrepParts, markPrepPart, type PrepPart, type PrepPartRow } from '@/app/data/event-prep-service';
import type { PointWithUserPosition, Profile } from '@/app/types';
import { CMP7_TAG, isPartDone, PART_VERSIONS, PRINCIPLE_LEVEL, SECONDS_PER_DECISION, STEP_LABELS, stepMinutes } from './prep-plan';
import { localPartRows, markLocalPart, readLocalParts, syncLocalPrepParts } from './prep-local-parts';
import { ActionRow, Clip, StatementsActions, StepActions, Title, useMeasuredHeight, type StatementsCount } from './prep-ui';
import { loadTagPoints } from './use-prep-state';
import { PrepWhy } from './PrepWhy';
import { WHY_PREPARE } from './prep-why';
import { useJoinLearningGate, type JoinMode, type ReviewMode } from './use-prepare-modes';
import { JoinReadError } from '@/app/pages/org-join-part1';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';

const PROGRESS_READ_TIMEOUT_MS = 6000;
const MISUNDERSTANDING_TAG = 'misunderstanding';
const FINISH_DEADLINE_MS = 6000;

/** The standalone steps, in order. */
export const STANDALONE_STEPS = ['story', 'principle', 'cmp7', 'misunderstanding'] as const;
export type StandaloneStep = (typeof STANDALONE_STEPS)[number];
/** P1549: joining and reviewing use the same three steps as the event learning, not the diagnosis. */
const JOIN_LEARNING_STEPS: readonly StandaloneStep[] = ['story', 'principle', 'cmp7'];
type Screen = 'list' | StandaloneStep | 'end';
type StatementsStep = 'cmp7' | 'misunderstanding';
const STATEMENT_TAG: Record<StatementsStep, string> = { cmp7: CMP7_TAG, misunderstanding: MISUNDERSTANDING_TAG };
const isStatementsStep = (s: Screen): s is StatementsStep => s === 'cmp7' || s === 'misunderstanding';

/** What marks each video step done. The statements steps have no part: their answers are
 *  positions, read live. */
const STEP_DONE_PART: Partial<Record<StandaloneStep, PrepPart>> = {
  story: 'cognitive_video',
  principle: 'principle_intro',
};

/** A point counts as answered by the account's position or, signed out, this browser's. */
const answered = (p: PointWithUserPosition) => !!p.userPosition || !!getAnonPosition(p.id);

// [PROPOSAL — founder decision open] Copy drafted from the founder's UAT words, 2026-10-04.
const COPY = {
  title: 'Learn about the Clarity process',
  start: 'Start here',
  startAgain: 'Start again',
  labels: {
    story: STEP_LABELS.story,
    principle: 'Learn about the Clarity Meeting Principle',
    cmp7: STEP_LABELS.cmp7,
    misunderstanding: 'Share how you think understanding works between people',
  } satisfies Record<StandaloneStep, string>,
  principleQuestion: 'Would you follow this principle in your important conversations?',
  askerRole: 'Founder of Clarity Pledge',
  optedIn:
    "Thank you for opting in. You promised that anybody in an important conversation can ask you a specific question, right? Let's try it now, to show how it works.",
  optedOut:
    "Thank you. It's completely okay to opt out. It usually means something is unclear, or you disagree. Before you continue, can I ask you one question?",
  misunderstandingTitle: "Let's find out how you think understanding works between people",
  endTitle: 'Thank you',
  endLine: 'You know what cognitive understanding is and how to check it. Try it with other attendees at an event.',
  endPrimary: 'Explore events',
};

/** P1549: three shapes of one page: plain, joining a group (?then=join&group=) and reviewing (?review=). */
export function PreparePage() {
  const gate = useJoinLearningGate();
  if (gate.kind === 'pending') return <ClarityPageLoader />;
  if (gate.kind === 'error') return <JoinReadError onRetry={gate.retry} fallback={gate.fallback} />;
  return <PrepareCore key={gate.kind} join={gate.kind === 'join' ? gate.join : undefined} review={gate.kind === 'review' ? gate.review : undefined} initialRows={gate.kind === 'join' ? gate.rows : undefined} viewerRowsKnown={gate.kind === 'join'} />;
}

function PrepareCore({ join, review, initialRows, viewerRowsKnown }: { join?: JoinMode; review?: ReviewMode; initialRows?: PrepPartRow[]; viewerRowsKnown: boolean }) {
  const navigate = useNavigate();
  const { user, isLoading, sessionChecked } = useAuth();
  const authReady = !isLoading && sessionChecked;
  const viewerId = user?.id;

  // Signed in: the account's rows. Signed out: this browser's, in the same shape.
  const [accountRows, setAccountRows] = useState<PrepPartRow[] | null>(initialRows ?? null);
  const [localRows, setLocalRows] = useState<PrepPartRow[]>(() => localPartRows(readLocalParts()));
  const [points, setPoints] = useState<Record<StatementsStep, PointWithUserPosition[] | null>>({ cmp7: null, misunderstanding: null });

  useEffect(() => {
    if (!authReady || !viewerId || viewerRowsKnown) return;
    let cancelled = false;
    // Another account's checks must never show while this one's read is in flight.
    setAccountRows(null);
    // A read that never answers must not leave a blank page: show the steps without checks.
    const giveUp = setTimeout(() => { if (!cancelled) setAccountRows((r) => r ?? []); }, PROGRESS_READ_TIMEOUT_MS);
    (async () => {
      try {
        const rows = await getMyPrepParts(viewerId);
        const synced = await syncLocalPrepParts(viewerId, rows);
        const fresh = synced.length > 0 ? await getMyPrepParts(viewerId) : rows;
        if (!cancelled) {
          setAccountRows(fresh);
          setLocalRows([]);
        }
      } catch {
        // The content never waits on progress: show the steps without checks.
        if (!cancelled) setAccountRows([]);
      }
    })();
    return () => { cancelled = true; clearTimeout(giveUp); };
  }, [authReady, viewerId, viewerRowsKnown]);

  const reloadPoints = useCallback(() => {
    if (!authReady) return;
    (Object.keys(STATEMENT_TAG) as StatementsStep[]).forEach((s) => {
      loadTagPoints(STATEMENT_TAG[s], viewerId)
        .then((pts) => setPoints((prev) => ({ ...prev, [s]: pts })))
        .catch(() => undefined);
    });
  }, [authReady, viewerId]);
  useEffect(() => { reloadPoints(); }, [reloadPoints]);

  const rows = viewerId ? (accountRows ?? []) : localRows;

  /** Never lowers anything: a part already completed keeps its own date. */
  // P1549: finishing the join learning waits for these, so the join page's read sees the part just recorded.
  const pendingWrites = useRef<Promise<unknown>[]>([]);
  // Only what this visit is still saving: on a timeout, nothing else on the account may be copied to this browser.
  const unsaved = useRef(new Map<PrepPart, string>());
  const complete = useCallback((part: PrepPart) => {
    if (isPartDone(rows, part)) return;
    const now = new Date().toISOString();
    const row: PrepPartRow = { part, contentVersion: PART_VERSIONS[part], completedAt: now, skippedAt: null };
    if (viewerId) {
      setAccountRows((prev) => [...(prev ?? []).filter((r) => r.part !== part), row]);
      unsaved.current.set(part, now);
      pendingWrites.current.push(markPrepPart(viewerId, part, PART_VERSIONS[part], 'completed', now).then(
        () => { unsaved.current.delete(part); },
        () => {
          // Not on the account: keep it in this browser, it syncs on the next read.
          unsaved.current.delete(part);
          markLocalPart(part, now);
        },
      ));
    } else {
      setLocalRows(localPartRows(markLocalPart(part, now)));
    }
  }, [rows, viewerId]);

  const isStepDone = (s: StandaloneStep): boolean => {
    // P1549: joining, each tick is the gate's own signal. The principle's decision is not stored: PrepareFlow tracks it.
    if (join) return (s === 'story' && isPartDone(rows, 'cognitive_video')) || (s === 'cmp7' && isPartDone(rows, 'cmp7'));
    const part = STEP_DONE_PART[s];
    if (part) return isPartDone(rows, part);
    const pts = points[s as StatementsStep];
    return !!pts && pts.length > 0 && pts.every(answered);
  };

  if (!authReady || (viewerId && accountRows === null)) {
    // Steps render without waiting on the account read only when signed out.
    return <div className="min-h-[100dvh] bg-background" data-testid="p1402-prepare-loading" />;
  }

  return (
    <PrepareFlow
      isStepDone={isStepDone}
      complete={complete}
      points={points}
      reloadPoints={reloadPoints}
      onLeave={review?.onReturn ?? (() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/feed')))}
      join={join && { ...join, onFinish: () => {
        // Bounded: a write that never answers must not leave the last Continue dead. What it held stays in this browser.
        withDeadline(Promise.allSettled(pendingWrites.current), FINISH_DEADLINE_MS, 'saving learning parts')
          .catch(() => { unsaved.current.forEach((at, part) => markLocalPart(part, at)); })
          .finally(join.onFinish);
      } }}
      review={review}
    />
  );
}

function PrepareFlow({
  isStepDone,
  complete,
  points,
  reloadPoints,
  onLeave,
  join,
  review,
}: {
  isStepDone: (s: StandaloneStep) => boolean;
  complete: (part: PrepPart) => void;
  points: Record<StatementsStep, PointWithUserPosition[] | null>;
  reloadPoints: () => void;
  onLeave: () => void;
  join?: JoinMode;
  review?: ReviewMode;
}) {
  const navigate = useNavigate();
  const steps: readonly StandaloneStep[] = join || review ? JOIN_LEARNING_STEPS : STANDALONE_STEPS;
  const [principleAnswered, setPrincipleAnswered] = useState(false);
  const [screen, setScreen] = useState<Screen>(() => (join ? steps.find((s) => !isStepDone(s)) ?? 'story' : 'list'));
  // Joining has no list to go back to: step Back retraces the steps taken this visit.
  const [trail, setTrail] = useState<StandaloneStep[]>([]);
  const [playRequest, setPlayRequest] = useState(0);
  const [played, setPlayed] = useState<Record<'story' | 'principle', boolean>>({ story: false, principle: false });
  // Principle: (a) intro + clip, (b) the decision, (c) the follow-up, (d) the 0-10 — the event
  // preparation's sequence. Nothing is recorded: without an event there is no one to promise it to.
  const [principleIntroDone, setPrincipleIntroDone] = useState(false);
  const [answer, setAnswer] = useState<PrincipleAnswer>(null);
  const [tryAsked, setTryAsked] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  // Which cards each statements step showed on first entry this visit, so answering one never
  // moves the list under the finger and Back shows the same cards.
  const [shownIds, setShownIds] = useState<Partial<Record<StatementsStep, string[]>>>({});
  const [asker, setAsker] = useState<Profile | null>(null);
  const [headerRef, headerHeight] = useMeasuredHeight();
  const [barRef, barHeight] = useMeasuredHeight();

  // The end screen is a destination: ?done=1 brings the app menus back (immersive-letter-route.ts,
  // bottom-nav-routes.ts). Every other screen stays immersive.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const isDone = searchParams.get('done') === '1';
    if ((screen === 'end') === isDone) return;
    const params = new URLSearchParams(searchParams);
    if (screen === 'end') params.set('done', '1');
    else params.delete('done');
    setSearchParams(params, { replace: true });
  }, [screen, searchParams, setSearchParams]);

  useEffect(() => {
    getProfileBySlug(LETTER_FOUNDER_SLUG).then(setAsker).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isStatementsStep(screen)) return;
    const pts = points[screen];
    if (!pts || shownIds[screen]) return;
    // Every card, answered or not: this page hides nothing.
    setShownIds((prev) => ({ ...prev, [screen]: pts.map((p) => p.id) }));
  }, [screen, points, shownIds]);

  const resetPrinciple = (introDone: boolean) => {
    setPrincipleIntroDone(introDone);
    setAnswer(null);
    setTryAsked(false);
    setRating(null);
  };

  const go = (next: Screen) => {
    if (next === 'end' && join) return join.onFinish();
    if (next === 'end' && review) return review.onReturn();
    if (join && screen !== 'list' && screen !== 'end' && steps.indexOf(next as StandaloneStep) > steps.indexOf(screen)) setTrail((t) => [...t, screen]);
    setScreen(next);
    setPlayRequest(0);
    resetPrinciple(false);
    if (next === 'list') reloadPoints();
    window.scrollTo(0, 0);
  };
  // Joining moves to the next UNDONE step; 'end' is the mode's own exit (see go).
  const after = (s: StandaloneStep, answeredPrinciple = principleAnswered): Screen => {
    const rest = steps.slice(steps.indexOf(s) + 1);
    return (join ? rest.find((n) => !isStepDone(n) && !(n === 'principle' && answeredPrinciple)) : rest[0]) ?? 'end';
  };
  const firstOpen = steps.find((s) => !isStepDone(s));
  const finishPrinciple = () => { setPrincipleAnswered(true); go(after('principle', true)); };

  const leaveStep = () => {
    if (!join) return go('list');
    const previous = trail[trail.length - 1];
    if (!previous) return join.onExit();
    setTrail((t) => t.slice(0, -1));
    go(previous);
  };
  const back = () => {
    if (screen === 'list') return onLeave();
    if (screen === 'principle') {
      // The event preparation's order: rating → follow-up → decision → intro clip → list.
      if (answer !== null && tryAsked) { setTryAsked(false); setRating(null); }
      else if (answer !== null) { setAnswer(null); setRating(null); }
      else if (principleIntroDone) setPrincipleIntroDone(false);
      else return leaveStep();
      window.scrollTo(0, 0);
      return;
    }
    leaveStep();
  };

  const stepIndex = screen === 'list' || screen === 'end' ? -1 : STANDALONE_STEPS.indexOf(screen);
  // Every step pins its bar at every width (founder UAT 2026-10-05): the actions stay in one place.
  const contentPadding = { paddingBottom: barHeight > 0 ? barHeight + 24 : 'max(1.5rem, env(safe-area-inset-bottom))' };

  const videoBar = (clip: 'story' | 'principle', onContinue: (watched: boolean) => void) => (
    <StepActions ref={barRef}>
      {played[clip] ? (
        <LetterPrimaryCta label="Continue" onClick={() => onContinue(true)} />
      ) : (
        <>
          <LetterPrimaryCta label="Play the video" onClick={() => setPlayRequest((n) => n + 1)} />
          {!join && <LetterPrimaryCta label="Continue without video" onClick={() => onContinue(false)} variant="secondary" />}
        </>
      )}
    </StepActions>
  );
  const markPlayed = (clip: 'story' | 'principle') => () => setPlayed((p) => ({ ...p, [clip]: true }));

  const askerAvatar = (size: 'sm' | 'xl') => (
    <GravatarAvatar
      name={asker?.name ?? 'Slava'}
      photoUrl={asker?.avatarUrl ?? undefined}
      avatarColor={asker?.avatarColor}
      isPledger={asker?.hasPledged ?? false}
      size={size}
    />
  );
  const askerName = asker?.name ?? 'Slava';

  const statementsCount = (s: StatementsStep): StatementsCount => {
    const ids = shownIds[s] ?? [];
    const byId = new Map((points[s] ?? []).map((p) => [p.id, p]));
    return { answered: ids.filter((id) => { const p = byId.get(id); return !!p && answered(p); }).length, total: ids.length };
  };
  const firstUnansweredOf = (s: StatementsStep): string | null => {
    const byId = new Map((points[s] ?? []).map((p) => [p.id, p]));
    return (shownIds[s] ?? []).find((id) => { const p = byId.get(id); return !p || !answered(p); }) ?? null;
  };

  // P1549: joining shows the principle without asking: the one decision is the group terms at the end.
  const showPrincipleView = !join && screen === 'principle' && principleIntroDone && !(answer !== null && !tryAsked);

  return (
    <div className="min-h-[100dvh] bg-background" data-testid="p1402-prepare">
      {/* P1512: the end screen is a destination with the menus back: its Back is the shell top bar's. The step
          screens keep their own pinned step-back header (a wizard step, not a page Back). */}
      {screen === 'end' && <FocusHeader fallback={EVENTS_LIST_TO} />}
      {screen !== 'end' && (
      <div ref={headerRef} className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2" data-testid="step-header">
          <button
            type="button"
            onClick={back}
            aria-label="Back"
            data-testid="header-back"
            className="flex-shrink-0 -ml-1 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          {join ? (
            <div className="min-w-0 flex-1" data-testid="learn-join-context">
              <p className="text-sm font-semibold text-foreground" data-testid="learn-join-title">Joining {join.groupName}</p>
              <LetterProgressBar currentChapter={stepIndex} totalChapters={4} stepCount={1} committedSteps={0} label={`Step ${stepIndex + 1} of 4`} />
            </div>
          ) : stepIndex >= 0 ? (
            // The event preparation's header: the step name over LetterProgressBar.
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-semibold leading-snug text-foreground" data-testid="step-name">
                {COPY.labels[screen as StandaloneStep]}
              </p>
              <LetterProgressBar
                currentChapter={stepIndex}
                totalChapters={steps.length}
                stepCount={screen === 'principle' ? 3 : 1}
                committedSteps={screen === 'principle' ? (principleIntroDone ? 1 : 0) + (answer !== null ? 1 : 0) : 0}
                label={`Step ${stepIndex + 1} of ${steps.length}`}
              />
            </div>
          ) : (
            <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground" data-testid="step-name">Clarity process</p>
          )}
        </div>
      </div>
      )}
      {screen !== 'end' && <div style={{ height: headerHeight }} aria-hidden />}

      {showPrincipleView ? (
        <MeetingPrincipleView
          level={PRINCIPLE_LEVEL}
          answer={answer}
          rating={rating}
          onAnswer={(a) => {
            setAnswer(a);
            setTryAsked(false);
            setRating(null);
            window.scrollTo(0, 0);
          }}
          onRatingChange={setRating}
          onRatingSubmit={() => { if (rating !== null) finishPrinciple(); }}
          submitLabel="Confirm"
          question="How much do you think you understand my intended meaning behind this principle?"
          header={
            answer === null ? (
              <h1 className="pt-2 text-center text-2xl font-bold leading-tight text-foreground" data-testid="principle-decision-question">
                {COPY.principleQuestion}
              </h1>
            ) : undefined
          }
          ratingBarClassName="animate-in slide-in-from-bottom duration-300"
          aboveRating={
            <div className="flex items-center gap-2 px-2 pb-1 sm:px-5" data-testid="rating-asker">
              {askerAvatar('sm')}
              <p className="text-sm font-semibold text-foreground">
                {askerName} <span className="font-normal text-muted-foreground">· {COPY.askerRole}</span>
              </p>
            </div>
          }
        />
      ) : (
        <main className="mx-auto max-w-2xl space-y-6 px-4 pt-4" style={contentPadding}>
          {screen === 'list' && (
            <section className="space-y-6 pt-4 lg:pt-10">
              <div className="space-y-2">
                <Title>{COPY.title}</Title>
                <PrepWhy paragraphs={WHY_PREPARE} />
              </div>
              <ol data-testid="agenda">
                {steps.map((s, i) => {
                  const done = isStepDone(s);
                  const last = i === steps.length - 1;
                  const cards = { cmp7: points.cmp7?.length ?? 0, stake: 0 };
                  const minutes = s === 'misunderstanding'
                    ? Math.max(1, Math.round(((points.misunderstanding?.length ?? 0) * SECONDS_PER_DECISION) / 60))
                    : stepMinutes(s, cards, true);
                  return (
                    <li key={s} className="flex gap-3" data-testid={`agenda-step-${s}`} data-done={done ? 'true' : 'false'}>
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
                      {/* Every step stays open, done or not: this page is where the content lives. */}
                      <button
                        type="button"
                        onClick={() => go(s)}
                        className={cn('flex min-h-11 min-w-0 flex-1 items-start justify-between gap-3 pt-1 text-left', !last && 'pb-6')}
                      >
                        <span className={cn('min-w-0 text-base font-medium leading-snug text-foreground hover:underline', done && 'text-muted-foreground')}>
                          {COPY.labels[s]}
                        </span>
                        <span className="shrink-0 pt-0.5 text-sm tabular-nums text-muted-foreground">{minutes} min</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              <StepActions ref={barRef}>
                {/* P1412: once every step is done, "Start here" reads wrong — it starts again from step 1. */}
                <LetterPrimaryCta label={firstOpen ? COPY.start : COPY.startAgain} onClick={() => go(firstOpen ?? 'story')} />
              </StepActions>
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
              <Clip clip="story" pulse={!played.story} onPlay={markPlayed('story')} playRequest={playRequest} />
              {videoBar('story', (watched) => {
                if (watched) complete('cognitive_video');
                go(after('story'));
              })}
            </section>
          )}

          {screen === 'principle' && !principleIntroDone && (
            <section className="space-y-5">
              <div className="space-y-2">
                <Title>Introducing the Clarity Meeting Principle</Title>
                <p className="text-base leading-relaxed text-muted-foreground" data-testid="principle-intro">
                  {join ? 'One question anyone may ask you, and your promise to answer it.' : 'One question anyone may ask you, and your promise to answer it. Watch the video, then decide.'}
                </p>
              </div>
              <Clip clip="principle" onPlay={markPlayed('principle')} playRequest={playRequest} />
              {/* P1549: joining shows the video and the text it talks about together, with no question after. */}
              {join && (
                <div data-testid="join-principle-text">
                  <CertificateFrame ariaLabel={PRINCIPLE_TITLE} title={PRINCIPLE_TITLE} kicker="A promise for one meeting" epigraph="We all crave being understood. Let's commit to listen.">
                    <CertificateOathBody sections={sectionsForLevel(PRINCIPLE_LEVEL)} />
                  </CertificateFrame>
                </div>
              )}
              {videoBar('principle', (watched) => {
                if (watched) complete('principle_intro');
                if (join) return finishPrinciple();
                setPrincipleIntroDone(true);
                setPlayRequest(0);
                window.scrollTo(0, 0);
              })}
            </section>
          )}

          {!join && screen === 'principle' && principleIntroDone && answer !== null && !tryAsked && (
            <section className="flex flex-col items-center space-y-4 pt-8 text-center" data-testid={answer === 'in' ? 'try-it-now' : 'opt-out-ask'}>
              <div className="flex flex-col items-center gap-1">
                {askerAvatar('xl')}
                <p className="text-base font-semibold text-foreground" data-testid="asker-caption">
                  {askerName} <span className="text-sm font-normal text-muted-foreground">· {COPY.askerRole}</span>
                </p>
              </div>
              <p className="text-lg leading-relaxed text-foreground">{answer === 'in' ? COPY.optedIn : COPY.optedOut}</p>
              <StepActions ref={barRef}>
                <ActionRow
                  primary={<LetterPrimaryCta label={answer === 'in' ? 'Try it now' : 'Yes'} onClick={() => { setTryAsked(true); window.scrollTo(0, 0); }} />}
                  secondary={answer === 'out' ? <LetterPrimaryCta label="No, continue" onClick={finishPrinciple} variant="secondary" /> : undefined}
                />
              </StepActions>
            </section>
          )}

          {isStatementsStep(screen) && (
            <section className="space-y-4">
              <Title>
                {screen === 'cmp7' ? 'What is your value perception of the Clarity Meeting Principle?' : COPY.misunderstandingTitle}
              </Title>
              {shownIds[screen] && (
                // Positions save on tap (signed out: in this browser, moved to the account at sign-in).
                // Two re-reads: the position write has no ordering guarantee against the first one.
                <div onClickCapture={() => { setTimeout(reloadPoints, 400); setTimeout(reloadPoints, 1500); }}>
                  <StakePage key={screen} tag={STATEMENT_TAG[screen]} embedded pointsOnly onlyIds={shownIds[screen]} linksInNewTab />
                </div>
              )}
              <StatementsActions
                key={screen}
                ref={barRef}
                count={statementsCount(screen)}
                loaded={!!shownIds[screen]}
                firstUnansweredId={firstUnansweredOf(screen)}
                // P1542 round 6b: Continue is offered only once every statement has a position (StatementsActions) — the
                // same moment the event learning records its cmp7 part (EventPrepPage STEP_PART). Recorded here too
                // (account, or this browser signed out), so finishing /prepare counts as "learned anywhere" (hasLearned).
                // Skipping records nothing, as there.
                onContinue={() => { if (screen === 'cmp7') complete('cmp7'); go(after(screen)); }}
                onSkip={() => go(after(screen))}
                hideSkip={!!join}
                onRecheck={reloadPoints}
              />
            </section>
          )}

          {screen === 'end' && (
            // Founder UAT round 4 (2026-10-04): a thank-you page — the thank-you and one way on.
            // The button sits in the page, not pinned: the menus are back here and a pinned bar
            // would sit on the BottomNav (P1387).
            <section className="mx-auto flex max-w-md flex-col items-center space-y-4 pt-16 text-center lg:pt-24" data-testid="prepare-end">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300" aria-hidden>
                <Check className="h-7 w-7" />
              </span>
              <Title>{COPY.endTitle}</Title>
              <p className="text-base leading-relaxed text-muted-foreground">{COPY.endLine}</p>
              <div className="w-full max-w-sm pt-4">
                <LetterPrimaryCta label={COPY.endPrimary} onClick={() => navigate(EVENTS_LIST_TO)} />
              </div>
            </section>
          )}
        </main>
      )}
    </div>
  );
}
