/**
 * @file PreparePage.tsx
 * @description P1402 — `/prepare`: the preparation without an event, a tool next to /meet and
 * /ready. Anyone can open it, signed in or not.
 *
 * It is the permanent home of the content (founder: "In /prepare, they will be always able to
 * find it … it doesn't need to hide anything"), so unlike the event preparation it never drops a
 * part someone already did: every step stays listed, done ones carry a check and can be replayed.
 *
 * Steps: the cognitive-understanding story, the Clarity Meeting Principle (intro clip + the
 * principle at /meet's level 3) and the cmp7 statements. The event-only steps stay in the event's
 * preparation: the welcome clip speaks about "the discussion we will have today", and the
 * positions and research steps need an event.
 *
 * Progress is the same once-per-person record the event preparation reads (person_prep_parts).
 * Signed out it is held in this browser (prep-local-parts.ts) and joins the account at the first
 * read after sign-in; cmp7 positions ride the existing anonymous-position path (P502). So a part
 * done here is skipped in any event's preparation later — one direction only.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import { LetterProgressBar } from '@/app/components/letters/letter-progress-bar';
import { MeetingPrincipleView, type PrincipleAnswer } from '@/app/components/agreements/meeting-principle-view';
import { StakePage } from '@/app/pages/stake-page';
import { getAnonPosition } from '@/app/hooks/useAnonPosition';
import { getMyPrepParts, markPrepPart, type PrepPart, type PrepPartRow } from '@/app/data/event-prep-service';
import type { PointWithUserPosition } from '@/app/types';
import { CMP7_TAG, isPartDone, PART_VERSIONS, PRINCIPLE_LEVEL, STEP_LABELS, stepMinutes } from './prep-plan';
import { localPartRows, markLocalPart, readLocalParts, syncLocalPrepParts } from './prep-local-parts';
import { ActionRow, Clip, StepActions, Title, useIsDesktop, useMeasuredHeight } from './prep-ui';
import { loadTagPoints } from './use-prep-state';

const PROGRESS_READ_TIMEOUT_MS = 6000;

/** The standalone steps, in order. */
export const STANDALONE_STEPS = ['story', 'principle', 'cmp7'] as const;
export type StandaloneStep = (typeof STANDALONE_STEPS)[number];
type Screen = 'list' | StandaloneStep | 'end';

/** What marks each step done. cmp7 has no part here: its answers are positions, read live. */
const STEP_DONE_PART: Partial<Record<StandaloneStep, PrepPart>> = {
  story: 'cognitive_video',
  principle: 'principle_intro',
};

/** A point counts as answered by the account's position or, signed out, this browser's. */
const answered = (p: PointWithUserPosition) => !!p.userPosition || !!getAnonPosition(p.id);

// [PROPOSAL — founder decision open] The copy below is a first draft for UAT.
const COPY = {
  title: 'Prepare for a Clarity Night',
  why: 'Most conversations go wrong because we assume we understand each other. These three steps show how to check, so you can reveal a gap instead of hiding it.',
  signIn: 'Sign in to keep your progress on any device.',
  principleQuestion: 'Would you follow this principle in your own conversations?',
  endTitle: 'Thank you for preparing',
  endLine: 'You are ready for a Clarity Night. Pick one, or ask us about hosting your own.',
  endPrimary: 'See upcoming events',
  endSecondary: 'Want to host one? Book a call',
};

export function PreparePage() {
  const navigate = useNavigate();
  const { user, isLoading, sessionChecked } = useAuth();
  const authReady = !isLoading && sessionChecked;
  const viewerId = user?.id;

  // Signed in: the account's rows. Signed out: this browser's, in the same shape.
  const [accountRows, setAccountRows] = useState<PrepPartRow[] | null>(null);
  const [localRows, setLocalRows] = useState<PrepPartRow[]>(() => localPartRows(readLocalParts()));
  const [cmp7Points, setCmp7Points] = useState<PointWithUserPosition[] | null>(null);

  useEffect(() => {
    if (!authReady || !viewerId) return;
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
  }, [authReady, viewerId]);

  const reloadPoints = useCallback(() => {
    if (!authReady) return;
    loadTagPoints(CMP7_TAG, viewerId).then(setCmp7Points).catch(() => undefined);
  }, [authReady, viewerId]);
  useEffect(() => { reloadPoints(); }, [reloadPoints]);

  const rows = viewerId ? (accountRows ?? []) : localRows;

  /** Never lowers anything: a part already completed keeps its own date. */
  const complete = useCallback((part: PrepPart) => {
    if (isPartDone(rows, part)) return;
    const now = new Date().toISOString();
    const row: PrepPartRow = { part, contentVersion: PART_VERSIONS[part], completedAt: now, skippedAt: null };
    if (viewerId) {
      setAccountRows((prev) => [...(prev ?? []).filter((r) => r.part !== part), row]);
      markPrepPart(viewerId, part, PART_VERSIONS[part], 'completed', now).catch(() => {
        // Not on the account: keep it in this browser, it syncs on the next read.
        markLocalPart(part, now);
      });
    } else {
      setLocalRows(localPartRows(markLocalPart(part, now)));
    }
  }, [rows, viewerId]);

  const isStepDone = (s: StandaloneStep): boolean => {
    const part = STEP_DONE_PART[s];
    if (part) return isPartDone(rows, part);
    return !!cmp7Points && cmp7Points.length > 0 && cmp7Points.every(answered);
  };

  if (!authReady || (viewerId && accountRows === null)) {
    // Steps render without waiting on the account read only when signed out.
    return <div className="min-h-[100dvh] bg-background" data-testid="p1402-prepare-loading" />;
  }

  return (
    <PrepareFlow
      signedIn={!!viewerId}
      isStepDone={isStepDone}
      complete={complete}
      cmp7Points={cmp7Points}
      reloadPoints={reloadPoints}
      onLeave={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/feed'))}
    />
  );
}

function PrepareFlow({
  signedIn,
  isStepDone,
  complete,
  cmp7Points,
  reloadPoints,
  onLeave,
}: {
  signedIn: boolean;
  isStepDone: (s: StandaloneStep) => boolean;
  complete: (part: PrepPart) => void;
  cmp7Points: PointWithUserPosition[] | null;
  reloadPoints: () => void;
  onLeave: () => void;
}) {
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>('list');
  const [playRequest, setPlayRequest] = useState(0);
  const [played, setPlayed] = useState<Record<'story' | 'principle', boolean>>({ story: false, principle: false });
  const [principleIntroDone, setPrincipleIntroDone] = useState(false);
  const [answer, setAnswer] = useState<PrincipleAnswer>(null);
  const [headerRef, headerHeight] = useMeasuredHeight();
  const [barRef, barHeight] = useMeasuredHeight();
  const isDesktop = useIsDesktop();

  const cards = useMemo(
    () => ({ cmp7: cmp7Points ? cmp7Points.length : 0, stake: 0 }),
    [cmp7Points],
  );

  const go = (next: Screen) => {
    setScreen(next);
    setPlayRequest(0);
    setPrincipleIntroDone(false);
    setAnswer(null);
    if (next === 'list') reloadPoints();
    window.scrollTo(0, 0);
  };
  const after = (s: StandaloneStep): Screen => {
    const i = STANDALONE_STEPS.indexOf(s);
    return STANDALONE_STEPS[i + 1] ?? 'end';
  };
  const firstOpen = STANDALONE_STEPS.find((s) => !isStepDone(s));

  const back = () => {
    if (screen === 'list') return onLeave();
    if (screen === 'principle' && principleIntroDone) {
      setPrincipleIntroDone(false);
      setAnswer(null);
      window.scrollTo(0, 0);
      return;
    }
    go('list');
  };

  const stepIndex = screen === 'list' || screen === 'end' ? -1 : STANDALONE_STEPS.indexOf(screen);
  const contentPadding = { paddingBottom: !isDesktop && barHeight > 0 ? barHeight + 24 : 'max(1.5rem, env(safe-area-inset-bottom))' };

  const videoBar = (clip: 'story' | 'principle', onContinue: (watched: boolean) => void) => (
    <StepActions ref={barRef}>
      {played[clip] ? (
        <LetterPrimaryCta label="Continue" onClick={() => onContinue(true)} />
      ) : (
        <>
          <LetterPrimaryCta label="Play the video" onClick={() => setPlayRequest((n) => n + 1)} />
          <LetterPrimaryCta label="Continue without video" onClick={() => onContinue(false)} variant="secondary" />
        </>
      )}
    </StepActions>
  );
  const markPlayed = (clip: 'story' | 'principle') => () => setPlayed((p) => ({ ...p, [clip]: true }));

  return (
    <div className="min-h-[100dvh] bg-background" data-testid="p1402-prepare">
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
          {stepIndex >= 0 ? (
            // The event preparation's header: the step name over LetterProgressBar.
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-semibold leading-snug text-foreground" data-testid="step-name">
                {STEP_LABELS[screen as StandaloneStep]}
              </p>
              <LetterProgressBar
                currentChapter={stepIndex}
                totalChapters={STANDALONE_STEPS.length}
                stepCount={1}
                committedSteps={0}
                label={`Step ${stepIndex + 1} of ${STANDALONE_STEPS.length}`}
              />
            </div>
          ) : (
            <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground" data-testid="step-name">Preparation</p>
          )}
        </div>
      </div>
      <div style={{ height: headerHeight }} aria-hidden />

      {screen === 'principle' && principleIntroDone ? (
        <MeetingPrincipleView
          level={PRINCIPLE_LEVEL}
          answer={answer}
          rating={null}
          // Nothing is recorded: without an event there is no one to promise it to. The answer
          // only moves the reader on; opting in for real happens in an event's preparation or /meet.
          onAnswer={(a) => {
            setAnswer(a);
            go(after('principle'));
          }}
          onRatingChange={() => undefined}
          onRatingSubmit={() => undefined}
          submitLabel="Continue"
          header={
            <h1 className="pt-2 text-center text-2xl font-bold leading-tight text-foreground" data-testid="principle-decision-question">
              {COPY.principleQuestion}
            </h1>
          }
        />
      ) : (
        <main className="mx-auto max-w-2xl space-y-6 px-4 pt-4" style={contentPadding}>
          {screen === 'list' && (
            <section className="space-y-6 pt-4 lg:pt-10">
              <div className="space-y-2">
                <Title>{COPY.title}</Title>
                <p className="text-base leading-relaxed text-muted-foreground" data-testid="prepare-why">{COPY.why}</p>
              </div>
              <ol data-testid="agenda">
                {STANDALONE_STEPS.map((s, i) => {
                  const done = isStepDone(s);
                  const last = i === STANDALONE_STEPS.length - 1;
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
                          {STEP_LABELS[s]}
                        </span>
                        <span className="shrink-0 pt-0.5 text-sm tabular-nums text-muted-foreground">
                          {stepMinutes(s, cards, true)} min
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              {!signedIn && (
                <p className="text-sm text-muted-foreground" data-testid="prepare-sign-in">
                  <Link to="/login?redirect=/prepare" className="text-blue-600 hover:underline dark:text-blue-400">
                    {COPY.signIn}
                  </Link>
                </p>
              )}
              <StepActions ref={barRef}>
                <LetterPrimaryCta
                  label={firstOpen ? (firstOpen === STANDALONE_STEPS[0] ? 'Start now' : 'Continue') : 'Watch again'}
                  onClick={() => go(firstOpen ?? STANDALONE_STEPS[0])}
                />
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
                  One question anyone may ask you, and your promise to answer it. Watch the video, then read it.
                </p>
              </div>
              <Clip clip="principle" onPlay={markPlayed('principle')} playRequest={playRequest} />
              {videoBar('principle', (watched) => {
                if (watched) complete('principle_intro');
                setPrincipleIntroDone(true);
                setPlayRequest(0);
                window.scrollTo(0, 0);
              })}
            </section>
          )}

          {screen === 'cmp7' && (
            <section className="space-y-4">
              <Title>What is your value perception of the Clarity Meeting Principle?</Title>
              {/* Positions save on tap (signed out: in this browser, moved to the account at sign-in). */}
              <div onClickCapture={() => { setTimeout(reloadPoints, 400); setTimeout(reloadPoints, 1500); }}>
                <StakePage tag={CMP7_TAG} embedded pointsOnly linksInNewTab />
              </div>
              <StepActions ref={barRef}>
                <LetterPrimaryCta label="Continue" onClick={() => go('end')} />
              </StepActions>
            </section>
          )}

          {screen === 'end' && (
            <section className="space-y-6 pt-4 text-center" data-testid="prepare-end">
              <div className="space-y-2">
                <Title>{COPY.endTitle}</Title>
                <p className="text-base leading-relaxed text-muted-foreground">{COPY.endLine}</p>
              </div>
              <StepActions ref={barRef}>
                <ActionRow
                  primary={<LetterPrimaryCta label={COPY.endPrimary} onClick={() => navigate('/events/list')} />}
                  secondary={<LetterPrimaryCta label={COPY.endSecondary} onClick={() => navigate('/intro')} variant="secondary" />}
                />
              </StepActions>
            </section>
          )}
        </main>
      )}
    </div>
  );
}
