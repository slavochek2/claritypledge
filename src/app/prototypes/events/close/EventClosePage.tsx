/**
 * @file EventClosePage.tsx
 * @description P1389 — `/events/:slug/close`: the evening's close on each phone, opened from a QR
 * on the projector after the last round, and from a link for anyone who left early.
 *
 * A start screen that frames it (like /prepare's plan), then one question per screen: the NPS 0-10
 * → topics for next time → did your positions change → how can we improve (criticism first) →
 * what did you like (+ quote permission) → the next Clarity Night → at most ONE personal ask,
 * chosen in Postgres by evenings attended → thank you.
 *
 * Reuse, never rewrite (founder, P1336): the step shell is the preparation's (prep-ui.tsx), pinned
 * at the bottom on every width; the 0-10 is the letters' card; statements are StakePage; topics are
 * /topics' whole list; events are the EventCard (static here — information, not a way out); the
 * "people who came" line is the prep screen's SocialProof; the reserved-place block is EventBox.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Linkedin } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import { LetterProgressBar } from '@/app/components/letters/letter-progress-bar';
import { ComprehensionRatingCard } from '@/app/components/shared/comprehension-rating-card';
import { BAR_INNER_CLASS } from '@/app/components/agreements/meeting-principle-view';
import { StakePage } from '@/app/pages/stake-page';
import { TopicVotingList } from '@/app/components/topics/topic-parts';
import { eventsService } from '@/app/data/events-service';
import { getProfile } from '@/app/data/api';
import {
  answerPersonalAsk,
  finishEventClose,
  getEventClose,
  getCommunitySlug,
  getSeriesPeople,
  joinCommunityFromClose,
  pickNextEvent,
  saveEventFeedback,
  type AskAnswer,
  type CloseState,
  type PersonalAsk,
} from '@/app/data/event-close-service';
import type { EventAttendee, EventWithHost, PointWithUserPosition } from '@/app/types';
import { CMP7_TAG } from '../prep/prep-plan';
/** The three statements about opting in (P1055's triad), asked after the seven. */
const CMP3_TAG = 'cmp3';
import { EventBox, SocialProof } from '../prep/PrepPieces';
import { OrgCard } from '@/app/pages/org-directory-page';
import { organizationsService } from '@/app/data/organizations-service';
import type { Organization, OrgParticipation } from '@/app/data/organizations-service.interface';
import { isAnswered, loadTagPoints } from '../prep/use-prep-state';
import { ActionRow, StepActions, useMeasuredHeight } from '../prep/prep-ui';
import { safeLinkHref } from '../location-utils';
import { analytics } from '@/lib/mixpanel';
import { CertificateFrame, CertificateOathBody } from '@/app/components/agreements/certificate-frame';
import { COA_VERSIONS, CURRENT_COA_VERSION } from '@/app/content/coa-versions';

type Step = 'intro' | 'score' | 'topics' | 'positions' | 'stance' | 'improve' | 'appreciate' | PersonalAsk | 'end';

/** Each step's name: the start screen's agenda and the header above it say the same thing
 *  (founder, round 9). The two feedback screens are one agenda line. */
const STEP_NAME: Record<Exclude<Step, 'intro' | 'end' | PersonalAsk>, string> = {
  score: 'Net promoter score',
  topics: 'Vote on the next event topic',
  // Founder D1 (round 10): the deck's own wording, so people recognise it from the projector.
  positions: 'Reflect on your value perception of CMP',
  stance: 'Reflect on your value perception of CMP',
  improve: 'Feedback: what to improve, what was good',
  appreciate: 'Feedback: what to improve, what was good',
};
/** The personal ask is named for what it is, never "one last question" (founder, round 7). */
const ASK_NAME: Record<PersonalAsk, string> = {
  community: 'Decide on joining the community',
  connect: 'Connect on LinkedIn',
};
const isAsk = (s: Step): s is PersonalAsk => s === 'community' || s === 'connect';
const stepName = (s: Exclude<Step, 'intro' | 'end'>) => (isAsk(s) ? ASK_NAME[s] : STEP_NAME[s]);

/** Example text inside a box: clearly lighter and italic, so nobody mistakes it for an answer. */
const PLACEHOLDER_CLASS = 'placeholder:italic placeholder:text-gray-400';
/** Every step's title starts at the same place under the header (visual review, round 7). */
// Founder (round 10b): short screens centre what sits above the bar in the space it leaves,
// so no screen shows a white band between the question and the buttons (--chrome = header+bar).
const STACK = 'flex min-h-[calc(100dvh-var(--chrome,0px))] flex-col justify-center pt-2';
/** Round 10 (founder): the main question IS the page title — top, centred, the largest text. */
function Question({ children }: { children: ReactNode }) {
  return <h1 className="mx-auto max-w-xl text-center text-2xl font-bold leading-tight text-foreground sm:text-3xl" data-testid="step-question">{children}</h1>;
}
/** A small context line above or under the question (never a second heading). */
function Context({ children }: { children: ReactNode }) {
  return <p className="mx-auto max-w-xl text-center text-base text-muted-foreground">{children}</p>;
}
/** Topics rated before Continue is full strength (founder: "rate more than three"). */
const TOPICS_TARGET = 5;

// ─── page: access + data ───────────────────────────────────────────────────────────────

export function EventClosePage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, session, isLoading, sessionChecked } = useAuth();
  const authLoading = isLoading || !sessionChecked;
  const [event, setEvent] = useState<EventWithHost | null>(null);
  const [eventLoading, setEventLoading] = useState(true);
  const [close, setClose] = useState<CloseState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    eventsService.getEventBySlug(slug).then((found) => {
      if (cancelled) return;
      setEvent(found);
      setEventLoading(false);
    });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!event || !user) return;
    let cancelled = false;
    getEventClose(event.id)
      .then((c) => !cancelled && setClose(c))
      .catch(() => !cancelled && setFailed(true));
    return () => { cancelled = true; };
  }, [event, user]);

  if (authLoading || eventLoading) return <ClarityPageLoader />;
  if (!session) return <Navigate to={`/login?redirect=/events/${slug}/close`} replace />;
  if (!event) return <Navigate to="/events" replace />;
  if (failed) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-base text-muted-foreground">We could not load this page. Please reload it.</p>
      </main>
    );
  }
  if (!close) return <ClarityPageLoader />;
  // The close belongs to a registration (or the host); anyone else goes to the event page.
  if (!close.isAttendee) return <Navigate to={`/events/${event.slug}`} replace />;
  return <CloseFlow event={event} initial={close} viewerId={user!.id} />;
}


// ─── flow ──────────────────────────────────────────────────────────────────────────────

function CloseFlow({ event, initial, viewerId }: { event: EventWithHost; initial: CloseState; viewerId: string }) {
  const navigate = useNavigate();
  const [headerRef, headerHeight] = useMeasuredHeight();
  const [barRef, barHeight] = useMeasuredHeight();

  // Feedback
  const [score, setScore] = useState<number | null>(initial.score);
  const [liked, setLiked] = useState(initial.liked ?? '');
  const [improve, setImprove] = useState(initial.improve ?? '');
  // Founder (2026-10-05): the quote permission is ticked from the start, not when they type.
  // A saved false only counts once there are saved words: the score's save writes false with no
  // text, which is not a refusal (round-10b review).
  const [quoteOk, setQuoteOk] = useState(initial.liked === null ? true : (initial.quoteOk ?? true));
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState<number | null>(initial.score);
  const [hint, setHint] = useState<string | null>(null);

  // Data the later steps need, read up front so the step list is known before the start screen.
  const [cmpPoints, setCmpPoints] = useState<PointWithUserPosition[] | null>(null);
  // Founder (round 10b): the close is the evening's only "after" — the seven, then the three.
  const [stanceIds, setStanceIds] = useState<string[] | null>(null);
  // How many of the three are set: the counter and Continue follow it (the topics pattern).
  const [stanceSet, setStanceSet] = useState(0);
  const [nextEvent, setNextEvent] = useState<EventWithHost | null | undefined>(undefined);
  const [nextRegistered, setNextRegistered] = useState(false);
  const [seriesPeople, setSeriesPeople] = useState<number | null>(null);
  const [tonightPeople, setTonightPeople] = useState<EventAttendee[]>([]);
  const [hostLinkedIn, setHostLinkedIn] = useState<string | null>(null);
  const [linkedinLoaded, setLinkedinLoaded] = useState(!initial.asks.includes('connect'));
  const [community, setCommunity] = useState<Community | null>(null);
  const [communityLoaded, setCommunityLoaded] = useState(!initial.asks.includes('community'));
  // Asks answered here tonight: Back skips them (one answer per ask per evening, held by the server).
  const [answered, setAnswered] = useState<PersonalAsk[]>([]);
  // Founder (round 10b, one flow): every ask that still applies is a step of its own. A community
  // ask whose group cannot be shown, or a LinkedIn ask whose link cannot, is dropped — never blank.
  const asks = initial.asks.filter(
    (a) => !((a === 'community' && communityLoaded && !community) || (a === 'connect' && linkedinLoaded && !hostLinkedIn)),
  );
  // A string key, so the step list is rebuilt only when the asks actually change.
  const asksKey = asks.join(',');
  // Set when they reserve inside the close: the thank-you shows the reserved event.
  const [reserved, setReserved] = useState(false);
  // Set when they join the community inside the close: the thank-you says so.
  const [joined, setJoined] = useState<string | null>(null);

  useEffect(() => {
    loadTagPoints(CMP7_TAG, viewerId).then(setCmpPoints).catch(() => setCmpPoints([]));
    loadTagPoints(CMP3_TAG, viewerId)
      .then((pts) => { setStanceIds(pts.map((p) => p.id)); setStanceSet(pts.filter(isAnswered).length); })
      .catch(() => setStanceIds([]));
    eventsService
      .getUpcomingEvents()
      .then(async (list) => {
        const n = pickNextEvent(event, list);
        // Both facts before the first screen: the step count must not change after it shows.
        const registered = n ? await eventsService.isUserRsvpd(n.id, viewerId).catch(() => false) : false;
        if (n) setSeriesPeople(await getSeriesPeople(n.id));
        setNextRegistered(registered);
        setNextEvent(n);
      })
      .catch(() => setNextEvent(null));
    eventsService.getEventAttendees(event.id).then(setTonightPeople).catch(() => undefined);
    getProfile(event.hostId)
      .then((p) => setHostLinkedIn(p?.linkedinUrl ? safeLinkHref(p.linkedinUrl) ?? null : null))
      .catch(() => undefined)
      .finally(() => setLinkedinLoaded(true));
    // The community card: the group Postgres invites this person to (the event's, or by location).
    getCommunitySlug(event.id)
      .then(async (slug) => {
        if (!slug) return;
        const org = await organizationsService.getOrganizationBySlug(slug).catch(() => null);
        if (!org) return;
        const [counts, part] = await Promise.all([
          organizationsService.getMemberCounts([org.id]).catch(() => null),
          organizationsService.getParticipation([org.id]).catch(() => null),
        ]);
        setCommunity({ org, members: counts ? (counts[org.id] ?? 0) : null, participation: part?.[org.id] });
      })
      .catch(() => undefined)
      .finally(() => setCommunityLoaded(true));
  }, [event, viewerId]);

  // The positions re-check shows the statements this person answered before; they were answered
  // once (P1336 prep), so this is a re-check, not a second survey.
  const askedRef = useRef<string[] | null>(null);
  const before = useRef<Map<string, string | undefined> | null>(null);
  if (askedRef.current === null && cmpPoints !== null) {
    const setBefore = cmpPoints.filter(isAnswered);
    askedRef.current = setBefore.map((p) => p.id);
    before.current = new Map(setBefore.map((p) => [p.id, JSON.stringify(p.userPosition)]));
  }
  const positionIds = askedRef.current ?? [];
  // "No changes" until a position actually differs from what it was when the step opened.
  const [positionsChanged, setPositionsChanged] = useState(false);
  const recheckStance = useCallback(() => {
    loadTagPoints(CMP3_TAG, viewerId).then((pts) => setStanceSet(pts.filter(isAnswered).length)).catch(() => undefined);
  }, [viewerId]);
  const recheckPositions = useCallback(() => {
    loadTagPoints(CMP7_TAG, viewerId)
      .then((pts) => setPositionsChanged(pts.some((p) => before.current?.has(p.id) && before.current.get(p.id) !== JSON.stringify(p.userPosition))))
      .catch(() => undefined);
  }, [viewerId]);

  const steps = useMemo<Exclude<Step, 'intro' | 'end'>[]>(() => {
    const s: Exclude<Step, 'intro' | 'end'>[] = ['score', 'topics'];
    if (positionIds.length > 0) s.push('positions');
    if (positionIds.length > 0 && (stanceIds?.length ?? 0) > 0) s.push('stance');
    s.push('improve', 'appreciate');
    // Postgres offers an ask only while it applies (not a member yet, not connected yet).
    if (asksKey) s.push(...(asksKey.split(',') as PersonalAsk[]));
    return s;
  }, [positionIds.length, stanceIds, asksKey]);
  /** The agenda: each pair (the CMP re-check, the feedback) is one line (founder, rounds 9 and 10b). */
  const agenda = steps.filter((s) => s !== 'appreciate' && s !== 'stance');
  // Founder (round 10): reserving the next evening lives on the thank-you, not in a step of its own.
  const offerNext = !!nextEvent && !nextRegistered;
  const ready = cmpPoints !== null && stanceIds !== null && nextEvent !== undefined && communityLoaded && linkedinLoaded;

  // Someone returning by link after giving feedback goes straight to what is left.
  // A returning visitor resumes: the score alone does not mean the feedback is finished (review).
  // A reload returns to the screen it left (Gemini review): skipped text is NULL like unanswered
  // text, so the saved answers alone cannot tell where someone was. The tab remembers; the
  // server's "finished" still wins, and a step that no longer applies falls back below.
  const stepKey = `p1389-step:${event.id}`;
  const [step, setStep] = useState<Step>(() => {
    if (initial.finished) return 'end';
    try {
      const saved = sessionStorage.getItem(stepKey) as Step | null;
      if (saved && saved !== 'intro' && saved !== 'end') return saved;
    } catch { /* storage blocked: fall back to the saved answers */ }
    return initial.score === null
      ? 'intro'
      : initial.liked === null && initial.improve === null
      ? 'topics'
      : initial.liked === null // improve answered, "what did you like" not yet (round-10 review)
      ? 'appreciate'
      : initial.asks[0] ?? 'end';
  });
  useEffect(() => {
    try { sessionStorage.setItem(stepKey, step); } catch { /* best effort */ }
  }, [step, stepKey]);
  // A resumed ask that cannot be shown (its group did not load) goes to the thank-you.
  const resumed = useRef(false);
  useEffect(() => {
    if (!ready || resumed.current) return;
    resumed.current = true;
    if (isAsk(step) && !asks.includes(step)) setStep(asks.find((a) => a !== step) ?? 'end');
    else if (step !== 'intro' && step !== 'end' && !steps.includes(step as never)) setStep(initial.score === null ? 'intro' : 'topics');
  }, [ready, step, asks]);
  useEffect(() => { setHint(null); }, [step]);
  // Reaching the thank-you is recorded once, so skipped text never looks like an unfinished close.
  const finishedSent = useRef(initial.finished);
  useEffect(() => {
    if (step !== 'end' || finishedSent.current) return;
    finishedSent.current = true;
    // Retried on a bad connection (Codex review): a lost "finished" would reopen the questions.
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
      void finishEventClose(event.id).then((ok) => {
        if (!ok && ++tries < 5) timer = setTimeout(attempt, 3000 * tries);
      });
    };
    attempt();
    return () => { if (timer) clearTimeout(timer); };
  }, [step, event.id]);
  // The part of a step reached (founder, round 10: progress counts half steps). The ask's own
  // screens report theirs; the feedback pair is two halves of one agenda line.
  const [askPart, setAskPart] = useState({ at: 0, of: 1 });

  const go = useCallback((to: Step) => {
    setStep(to);
    window.scrollTo(0, 0);
  }, []);
  // The thank-you is a destination with the app menus back (immersive-letter-route.ts reads ?done=1).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const isDone = searchParams.get('done') === '1';
    if ((step === 'end') === isDone) return;
    const params = new URLSearchParams(searchParams);
    if (step === 'end') params.set('done', '1');
    else params.delete('done');
    setSearchParams(params, { replace: true });
  }, [step, searchParams, setSearchParams]);

  // An ask answered tonight is never shown again: both directions step over it.
  const skipAnswered = (to: Step, dir: 1 | -1): Step => {
    let t = to;
    while (isAsk(t) && answered.includes(t)) t = steps[steps.indexOf(t as never) + dir] ?? (dir > 0 ? 'end' : 'intro');
    return t;
  };
  const after = (from: Step): Step => skipAnswered((from === 'intro' ? steps[0] : steps[steps.indexOf(from as never) + 1]) ?? 'end', 1);
  const prev = (from: Step): Step => skipAnswered(steps[steps.indexOf(from as never) - 1] ?? 'intro', -1);

  // Explicit overrides win over state, which has not re-rendered yet when a skip clears a box.
  const saveFeedback = async (fb: { score?: number | null; liked?: string; improve?: string } = {}): Promise<boolean> => {
    setSaving(true);
    const l = fb.liked ?? liked;
    const ok = await saveEventFeedback(event.id, {
      score: fb.score !== undefined ? fb.score : score,
      liked: l,
      improve: fb.improve ?? improve,
      quoteOk: quoteOk && l.trim() !== '',
    });
    setSaving(false);
    if (!ok) toast.error('Could not save. Please check your connection.');
    return ok;
  };

  const chooseScore = async (n: number) => {
    if (busy.current) return;
    setScore(n);
    busy.current = true;
    const ok = await saveFeedback({ score: n }).finally(() => { busy.current = false; });
    if (ok) go(after('score'));
  };

  // Taps arrive faster than a re-render disables a button: one write at a time, by ref.
  const busy = useRef(false);
  const once = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (busy.current) return undefined;
    busy.current = true;
    setSaving(true);
    try {
      return await fn();
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const answer = (which: PersonalAsk) => async (a: AskAnswer) => {
    const ok = await once(() => answerPersonalAsk(event.id, which, a));
    if (ok === undefined) return;
    if (!ok) return toast.error('Could not save. Please check your connection.');
    setAnswered((x) => [...x, which]);
    go(after(which));
  };

  // An ask with screens of its own (gift stages, community terms) goes back inside itself first.
  const askBack = useRef<(() => boolean) | null>(null);
  const back = () => {
    if (saving || busy.current) return;
    if (step === 'intro') return navigate(`/events/${event.slug}`);
    if (step === 'community' && askBack.current?.()) return;
    go(prev(step));
  };

  // The bar is pinned on every width (founder, P1402 /prepare), so the page always reserves its height.
  // The thank-you has no bar but the app's bottom tabs (?done=1), so it clears those instead.
  const contentPadding: React.CSSProperties & Record<'--chrome', string> = {
    '--chrome': `${headerHeight + barHeight + 40}px`,
    paddingBottom: step === 'end' ? 'calc(6rem + env(safe-area-inset-bottom))' : barHeight > 0 ? barHeight + 24 : 'max(1.5rem, env(safe-area-inset-bottom))',
  };
  const index = agenda.indexOf((step === 'appreciate' ? 'improve' : step === 'stance' ? 'positions' : step) as never);
  const pair = steps.includes('stance') && (step === 'positions' || step === 'stance');
  const part =
    step === 'improve' || (pair && step === 'positions') ? { at: 0, of: 2 }
    : step === 'appreciate' || step === 'stance' ? { at: 1, of: 2 }
    : step === 'community' ? askPart : { at: 0, of: 1 };
  const hostAvatar = (
    <GravatarAvatar
      name={event.hostName}
      photoUrl={event.hostAvatarUrl ?? undefined}
      avatarColor={event.hostAvatarColor}
      isPledger={event.hostHasPledged ?? false}
      size="sm"
    />
  );

  /** A text step (founder, round 10): the question is the page title; the drawer holds the answer —
   *  Submit (dimmed until there is text, a tap says so) and the small way past; the box is above. */
  const textAsk = (opts: { question: string; text: string; setText: (v: string) => void; placeholder: string; skipLabel: string; from: Step; extra?: ReactNode }) => (
    <section className={cn(STACK, 'gap-4')} data-testid={`step-${opts.from}`}>
    <Question>{opts.question}</Question>
    {/* Founder (round 10b): the box sits under the question, never in the bottom bar. */}
    <div className="mx-auto w-full max-w-xl space-y-2">
      <Textarea
        aria-label={opts.question}
        value={opts.text}
        placeholder={opts.placeholder}
        onChange={(e) => opts.setText(e.target.value)}
        rows={4}
        maxLength={2000}
        className={cn('resize-none text-base', PLACEHOLDER_CLASS)}
      />
      {opts.extra}
    </div>
    <Drawer barRef={barRef}>
      <div className="flex justify-center">
      <ActionRow
        primary={
          <div className="w-full max-w-sm" title={opts.text.trim() ? undefined : 'Write a sentence first.'}>
            <LetterPrimaryCta
              label="Submit"
              disabled={saving}
              onClick={async () => {
                if (!opts.text.trim()) return setHint('Write a sentence first, or continue without it.');
                if (await saveFeedback()) go(after(opts.from));
              }}
              className={opts.text.trim() ? undefined : 'opacity-50 hover:bg-blue-600'}
            />
          </div>
        }
        secondary={
          <LetterPrimaryCta
            label={opts.skipLabel}
            variant="secondary"
            onClick={async () => {
              if (saving) return;
              // "Without feedback" means without it (Codex review): words saved earlier — e.g. before
              // going Back — are removed on the server too, with the quote permission they carried.
              opts.setText('');
              const cleared = opts.from === 'appreciate' ? { liked: '' } : { improve: '' };
              if (await saveFeedback(cleared)) go(after(opts.from));
            }}
          />
        }
      />
      </div>
      {!opts.text.trim() && hint && <p role="status" className="text-center text-sm text-foreground" data-testid="submit-hint">{hint}</p>}
    </Drawer>
    </section>
  );

  // Wait for every step's data before the first screen, so the step count never changes under the person.
  if (!ready) return <ClarityPageLoader />;

  const tonightLine =
    seriesPeople !== null && seriesPeople > 0
      ? `${seriesPeople} ${seriesPeople === 1 ? 'person has' : 'people have'} come to Clarity Nights so far`
      : tonightPeople.length > 0
      ? `${tonightPeople.length} ${tonightPeople.length === 1 ? 'person' : 'people'} came tonight`
      : null;

  return (
    <div className="min-h-[100dvh] bg-background" data-testid="p1389-close">
      {step !== 'end' && (
        <>
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
              {step === 'intro' ? (
                <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground" data-testid="step-name">Feedback</p>
              ) : (
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold leading-snug text-foreground" data-testid="step-name">{stepName(step)}</p>
                  <LetterProgressBar
                    currentChapter={Math.max(index, 0)}
                    totalChapters={agenda.length}
                    fraction={part.at / part.of}
                    label={`Step ${Math.max(index, 0) + 1} of ${agenda.length}`}
                  />
                </div>
              )}
            </div>
          </div>
          <div style={{ height: headerHeight }} aria-hidden />
        </>
      )}

      <main className="mx-auto max-w-2xl space-y-6 px-4 pt-4" style={contentPadding}>
        {step === 'intro' && (
          // Founder (2026-10-05): frame it first, like /prepare's plan — thanks, how long, which steps.
          // Founder (round 8): a bookend, so centred; "takes 5 minutes", never a step count.
          <section className="flex min-h-[calc(100dvh-var(--chrome,0px))] flex-col items-center justify-center gap-5 text-center" data-testid="step-intro">
            <div className="space-y-1">
              <div data-testid="intro-thanks"><Question>We need your feedback</Question></div>
              <p className="text-base text-muted-foreground">It takes 5 minutes.</p>
            </div>
            <ol className="w-fit space-y-2 text-left" data-testid="intro-agenda">
              {agenda.map((s, i) => (
                <li key={s} className="flex items-center gap-3 text-base text-foreground">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">{i + 1}</span>
                  {stepName(s)}
                </li>
              ))}
            </ol>
            <StepActions ref={barRef}>
              <LetterPrimaryCta label="Start feedback" onClick={() => go(after('intro'))} />
            </StepActions>
          </section>
        )}

        {step === 'score' && (
          // Founder (round 10): a small thanks and the evening, then the question big and centred;
          // the drawer holds the 0-10 only.
          <section className={cn(STACK, 'items-center gap-4')} data-testid="step-score">
            <Context>Thank you for participating</Context>
            <div className="w-full max-w-md"><EventReminder event={event} card /></div>
            <Question>How likely would you recommend this event to a friend or colleague?</Question>
            {/* Round 10b: the scale sits under the question like every other answer; the bar keeps
                Submit. The card's own button is hidden — the bar's Submit sends the same number. */}
            <div className="mx-auto w-full max-w-xl">
              <ComprehensionRatingCard
                initialValue={score}
                lowLabel="Not at all likely"
                highLabel="Extremely likely"
                onSelect={(n) => void chooseScore(n)}
                onSelectionChange={setPicked}
                disabled={saving}
                ctaClassName="hidden"
                className="border-0 bg-transparent p-0 shadow-none"
              />
            </div>
            <Drawer barRef={barRef}>
              <div className="flex justify-center">
                <div className="w-full max-w-sm">
                  <LetterPrimaryCta label="Submit" disabled={saving || picked === null} onClick={() => picked !== null && void chooseScore(picked)} />
                </div>
              </div>
            </Drawer>
          </section>
        )}

        {step === 'topics' && (
          <TopicsStep barRef={barRef} headerHeight={headerHeight} hint={hint} onHint={setHint} onContinue={() => go(after('topics'))} onSkip={() => go(after('topics'))} />
        )}

        {step === 'positions' && (
          <section className="space-y-4" data-testid="step-positions">
            <Question>Did your value perception of CMP change?</Question>
            {/* A position is saved on the tap; re-read after it to know whether anything changed. */}
            <div onClickCapture={() => { setTimeout(recheckPositions, 600); setTimeout(recheckPositions, 1500); }}>
              <StakePage tag={CMP7_TAG} embedded pointsOnly onlyIds={positionIds} linksInNewTab />
            </div>
            <StepActions ref={barRef}>
              {/* Founder: the button says what happens — nothing changed, or the changes are kept. */}
              <LetterPrimaryCta label={positionsChanged ? 'Save changes' : 'No changes'} onClick={() => go(after('positions'))} />
            </StepActions>
          </section>
        )}

        {step === 'stance' && stanceIds && (
          // Founder (round 10b): the three about opting in — their stance after the evening.
          <section className="space-y-4" data-testid="step-stance">
            <Question>Where do you stand on CMP in your important conversations?</Question>
            {/* A position is saved on the tap; re-read after it to count what is set. */}
            <div onClickCapture={() => { setTimeout(recheckStance, 600); setTimeout(recheckStance, 1500); }}>
              <StakePage tag={CMP3_TAG} embedded pointsOnly onlyIds={stanceIds} linksInNewTab />
            </div>
            {/* Founder (round 10b): the topics step's pattern — a counter that motivates, Continue
                dimmed until all are set (a tap says what is missing), Skip as the small link. */}
            <StepActions ref={barRef}>
              <div className="mb-3 w-full max-w-sm" aria-live="polite" data-testid="stance-count">
                <LetterProgressBar
                  currentChapter={0}
                  totalChapters={1}
                  stepCount={stanceIds.length}
                  committedSteps={Math.min(stanceSet, stanceIds.length)}
                  label={`${Math.min(stanceSet, stanceIds.length)} of ${stanceIds.length} set`}
                  tone="subtle"
                />
              </div>
              <ActionRow
                primary={
                  <div className="w-full max-w-sm" title={stanceSet >= stanceIds.length ? undefined : STANCE_HINT}>
                    <LetterPrimaryCta
                      label="Continue"
                      onClick={() => (stanceSet >= stanceIds.length ? go(after('stance')) : setHint(STANCE_HINT))}
                      className={stanceSet >= stanceIds.length ? undefined : 'opacity-50 hover:bg-blue-600'}
                    />
                  </div>
                }
                secondary={<LetterPrimaryCta label="Skip" variant="secondary" onClick={() => go(after('stance'))} />}
              />
              {stanceSet < stanceIds.length && hint && (
                <p role="status" className="pt-1 text-center text-sm text-foreground" data-testid="stance-hint">{hint}</p>
              )}
            </StepActions>
          </section>
        )}

        {step === 'improve' && (
          textAsk({
              question: 'How can we improve our next event?',
              text: improve,
              setText: setImprove,
              placeholder: 'We welcome your critical feedback. Even one sentence helps.',
              skipLabel: 'Continue without feedback',
              from: 'improve',
            })
        )}

        {step === 'appreciate' && (
          textAsk({
              question: "What did you like about today's event?",
              text: liked,
              setText: setLiked,
              placeholder: 'Your experience in 2-3 sentences. Who do you think should come to our future events, and why?',
              skipLabel: 'Continue without sharing',
              from: 'appreciate',
              extra: (
                <label className="flex min-h-11 items-center gap-2 text-sm text-foreground" data-testid="quote-ok">
                  <input type="checkbox" checked={quoteOk} onChange={(e) => setQuoteOk(e.target.checked)} className="h-4 w-4 accent-blue-600" />
                  You may quote me by name to invite new people to future events.
                </label>
              ),
            })
        )}

        {step === 'connect' && hostLinkedIn && (
          <ConnectAsk hostName={event.hostName} host={hostAvatar} href={hostLinkedIn} saving={saving} barRef={barRef} onAnswer={answer('connect')} />
        )}

        {step === 'community' && community && (
          <CommunityAsk
            community={community}
            saving={saving}
            barRef={barRef}
            onAnswer={answer('community')}
            join={() => once(() => joinCommunityFromClose(event.id))}
            onJoined={() => { setJoined(community.org.name); setAnswered((x) => [...x, 'community']); go(after('community')); }}
            backRef={askBack}
            onPart={setAskPart}
          />
        )}

        {step === 'end' && (
          // Founder (round 10): the thank-you IS the reserve screen — a destination with the app menus
          // back (?done=1), the next evening as a small card and ONE button; no "Not now" (D3).
          <section className="flex min-h-[calc(100dvh-14rem)] flex-col items-center justify-center gap-5 text-center" data-testid="step-end">
            {/* Founder (round 10b): the thanks is courtesy, the invitation is the one thing to do —
                so the invitation is the title and the thanks the small line above it. */}
            {nextEvent && offerNext ? (
              <>
                <Context>Thank you for your feedback</Context>
                <Question>Join the next Clarity Night</Question>
              </>
            ) : nextEvent && (reserved || nextRegistered) ? (
              <>
                <Context>Thank you for your feedback</Context>
                <Question>Your place is reserved</Question>
              </>
            ) : (
              <Question>Thank you for your feedback</Question>
            )}
            {joined && <Context><span data-testid="end-joined">You joined {joined}.</span></Context>}
            {nextEvent && (reserved || nextRegistered) && (
              // The same block a registration ends with: details, add to calendar, share (P1403).
              <div className="w-full max-w-md text-left" data-testid="end-reserved">
                <EventBox event={nextEvent} groupChatUrl={null} title={null} testId="end-card" />
              </div>
            )}
            {nextEvent && offerNext && (
              <div className="flex w-full max-w-md flex-col items-center gap-4" data-testid="end-next">
                {/* The card opens the event for anyone who wants the details first: this is a
                    destination with the app menus, so leaving costs nothing. */}
                <Link to={`/events/${nextEvent.slug}`} className="block w-full rounded-lg text-left hover:shadow-md" data-testid="next-event-box">
                  <EventReminder event={nextEvent} withPlace card />
                </Link>
                <SocialProof testId="series-people" people={tonightPeople} line={tonightLine} />
                <div className="w-full max-w-sm">
                  <LetterPrimaryCta
                    label="Reserve my place"
                    disabled={saving}
                    onClick={async () => {
                      const ok = await once(() => eventsService.rsvpToEvent(nextEvent.id, viewerId));
                      if (ok === undefined) return;
                      if (!ok) return toast.error('Could not register. Please try again.');
                      setReserved(true);
                      setNextRegistered(true);
                    }}
                  />
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

// ─── pieces ────────────────────────────────────────────────────────────────────────────

const TOPICS_HINT = `Rate at least ${TOPICS_TARGET} topics, or add your own.`;
const STANCE_HINT = 'Set all three, or skip.';

/** /topics' whole list, with the statements step's progress bar in the drawer (founder, /prepare). */
function TopicsStep({
  barRef,
  headerHeight,
  hint,
  onHint,
  onContinue,
  onSkip,
}: {
  barRef: (node: HTMLDivElement | null) => void;
  headerHeight: number;
  hint: string | null;
  onHint: (h: string | null) => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const [progress, setProgress] = useState({ ratedCount: 0, added: false });
  const onProgress = useCallback(({ ratedCount, added }: { ratedCount: number; added: boolean }) => {
    setProgress({ ratedCount, added });
    if (ratedCount >= TOPICS_TARGET || added) onHint(null);
  }, [onHint]);
  const canGo = progress.ratedCount >= TOPICS_TARGET || progress.added;
  const shown = Math.min(progress.ratedCount, TOPICS_TARGET);
  return (
    <section className="space-y-4" data-testid="step-topics">
      {/* Founder (round 7): the title, sort and "Suggest a topic" stay at the top while the rows
          scroll, and "Show more" adds as many rows as fit this screen. */}
      <TopicVotingList
        onProgress={onProgress}
        title={<Question>Help us pick a more interesting topic for the next event</Question>}
        stickyTop={headerHeight}
      />
      <StepActions ref={barRef}>
        <div className="mb-3 w-full max-w-sm" aria-live="polite" data-testid="topics-count">
          <LetterProgressBar
            currentChapter={0}
            totalChapters={1}
            stepCount={TOPICS_TARGET}
            committedSteps={shown}
            label={`${shown} of ${TOPICS_TARGET} rated`}
            tone="subtle"
          />
        </div>
        {/* Founder (P1387): dimmed, not disabled — a tap says what is missing; Skip is the small link. */}
        <ActionRow
          primary={
            <div className="w-full max-w-sm" title={canGo ? undefined : TOPICS_HINT}>
              <LetterPrimaryCta
                label="Continue"
                onClick={() => (canGo ? onContinue() : onHint(TOPICS_HINT))}
                className={canGo ? undefined : 'opacity-50 hover:bg-blue-600'}
              />
            </div>
          }
          secondary={<LetterPrimaryCta label="Skip" variant="secondary" onClick={onSkip} />}
        />
        {!canGo && hint && (
          <p role="status" className="pt-1 text-center text-sm text-foreground" data-testid="topics-hint">{hint}</p>
        )}
      </StepActions>
    </section>
  );
}

/**
 * The community ask (founder, round 7): the group as information (no way out of the flow), its
 * About opening in place, then "Join as member" shows the group terms right here — accepting them
 * IS joining (P1010: the membership row is the acceptance record) — and the close carries on.
 */
function CommunityAsk({
  community,
  saving,
  barRef,
  onAnswer,
  join,
  onJoined,
  backRef,
  onPart,
}: {
  community: Community;
  saving: boolean;
  barRef: (node: HTMLDivElement | null) => void;
  onAnswer: (a: AskAnswer) => void;
  /** The membership and the yes in ONE server transaction (round-9 review): a failed join can
   *  never leave a yes without a membership. undefined = a write was already running. */
  join: () => Promise<boolean | undefined>;
  onJoined: () => void;
  /** The header's Back: from the terms it returns to the group card, not out of the ask. */
  backRef: React.MutableRefObject<(() => boolean) | null>;
  onPart: (p: { at: number; of: number }) => void;
}) {
  const { org } = community;
  const [stage, setStage] = useState<'card' | 'terms'>('card');
  const [joining, setJoining] = useState(false);
  useEffect(() => { onPart({ at: stage === 'terms' ? 1 : 0, of: 2 }); }, [stage, onPart]);
  useEffect(() => {
    backRef.current = () => (stage === 'terms' ? (setStage('card'), true) : false);
    return () => { backRef.current = null; };
  }, [stage, backRef]);
  useEffect(() => { window.scrollTo(0, 0); }, [stage]);

  if (stage === 'terms') {
    const coa = COA_VERSIONS[CURRENT_COA_VERSION];
    const accept = async () => {
      if (joining) return;
      setJoining(true);
      const ok = await join();
      if (ok === undefined) return setJoining(false);
      if (!ok) {
        toast.error("Couldn't complete your join. Please try again.");
        return setJoining(false);
      }
      analytics.track('org_joined', { org_slug: org.slug, terms_version: CURRENT_COA_VERSION });
      toast.success(`You've joined ${org.name}`);
      onJoined();
    };
    return (
      <section className={cn(STACK, 'gap-4')} data-testid="community-terms">
        <div className="space-y-2">
          {/* The join page's own wording (/groups/:slug/join): joining first, the terms explained. */}
          <Question>Join {org.name}</Question>
          <Context>{coa.intro}</Context>
        </div>
        <CertificateFrame ariaLabel="Clarity Group Terms" title={coa.title} kicker="A commitment to every member" epigraph="We all crave being understood. Let's commit to listen.">
          <CertificateOathBody sections={[coa.yourRight, coa.myPromise, coa.exception]} />
        </CertificateFrame>
        <StepActions ref={barRef}>
          <ActionRow
            primary={<LetterPrimaryCta label={joining ? 'Joining…' : 'Accept terms & join'} disabled={joining || saving} onClick={() => void accept()} />}
            secondary={<LetterPrimaryCta label="Back" variant="secondary" onClick={() => setStage('card')} />}
          />
        </StepActions>
      </section>
    );
  }

  return (
    // Founder (round 10, /presi3 slide 17): the invitation, one line, the group card. The long
    // About text is gone (D2): the card already says what the group is.
    <section className={cn(STACK, 'items-center gap-4')} data-testid="ask-community">
      <Question>Join the Communication Activism Community</Question>
      <Context>Practise clarity together. Build trust that holds.</Context>
      <div className="w-full max-w-md" data-testid="community-card">
        <OrgCard org={org} memberCount={community.members} participation={community.participation} isMine={false} asStatic />
      </div>
      <Drawer barRef={barRef}>
        {/* Equal choices get equal buttons (founder, P1336: "otherwise it feels rigged"). */}
        <div className="grid w-full grid-cols-2 gap-2" data-testid="ask-answers">
          <Button size="lg" disabled={saving} onClick={() => setStage('terms')} className="h-12 min-w-0 rounded-full bg-blue-600 text-base font-bold text-white hover:bg-blue-700">
            Join as member
          </Button>
          <Button size="lg" variant="outline" disabled={saving} onClick={() => onAnswer('no')} className="h-12 min-w-0 rounded-full text-base">
            Not now
          </Button>
        </div>
      </Drawer>
    </section>
  );
}

/** The 2nd ask (founder, round 10b): one tap to connect — the offer itself comes later, in the
 *  host's own LinkedIn message, never as a pitch inside the evening's feedback. */
function ConnectAsk({
  hostName,
  host,
  href,
  saving,
  barRef,
  onAnswer,
}: {
  hostName: string;
  host: ReactNode;
  href: string;
  saving: boolean;
  barRef: (node: HTMLDivElement | null) => void;
  onAnswer: (a: AskAnswer) => void;
}) {
  return (
    <section className={cn(STACK, 'items-center gap-4')} data-testid="ask-connect">
      <Question>Let's connect on LinkedIn</Question>
      {/* The card is the same link as Connect (founder: people tap the middle as often as the button). */}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => { if (saving) return e.preventDefault(); onAnswer('yes'); }}
        className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:border-blue-300 hover:shadow-md"
        data-testid="connect-card"
      >
        {host}
        <span className="text-base font-semibold text-foreground">{hostName}</span>
        <Linkedin className="h-5 w-5 text-[#0A66C2]" aria-hidden />
      </a>
      <Drawer barRef={barRef}>
        {/* Equal choices get equal buttons (founder, P1336: "otherwise it feels rigged"). */}
        <div className="grid w-full grid-cols-2 gap-2" data-testid="ask-answers">
          {/* A real link (round-10b review): a new tab from a link is never popup-blocked, unlike
              window.open after an await; the yes is recorded on the same tap. */}
          <Button asChild size="lg" className="h-12 min-w-0 rounded-full bg-blue-600 px-3 text-base font-bold text-white hover:bg-blue-700">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={saving || undefined}
              onClick={(e) => { if (saving) return e.preventDefault(); onAnswer('yes'); }}
            >
              Connect
            </a>
          </Button>
          <Button size="lg" variant="outline" disabled={saving} onClick={() => onAnswer('no')} className="h-12 min-w-0 rounded-full px-3 text-base">
            Not now
          </Button>
        </div>
      </Drawer>
    </section>
  );
}

interface Community { org: Organization; members: number | null; participation?: OrgParticipation }

/** The bottom bar: the answer's buttons only (founder, round 10b), pinned on every width. */
function Drawer({ barRef, children }: { barRef: (node: HTMLDivElement | null) => void; children: ReactNode }) {
  return (
    <StepActions ref={barRef} className="px-0">
      <div className={cn(BAR_INNER_CLASS, 'flex max-h-[70dvh] flex-col items-stretch gap-3 overflow-y-auto text-left')} data-testid="drawer">
        {children}
      </div>
    </StepActions>
  );
}

/** Which evening: a thumbnail, the title, the date (and place). Information, not a link. */
function EventReminder({ event, withPlace = false, card = false }: { event: EventWithHost; withPlace?: boolean; card?: boolean }) {
  const date = new Date(event.datetime).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  // 24-hour, like the registration block on the next screen (round-10b review: one time format).
  const time = withPlace ? new Date(event.datetime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : null;
  const place = withPlace ? event.location?.split(',')[0]?.trim() : null;
  return (
    <div className={cn('flex items-center gap-3', card && 'rounded-lg border border-border bg-card p-3')} data-testid={withPlace ? undefined : 'close-event-box'}>
      {event.bannerUrl && (
        <picture className="h-16 w-28 shrink-0 overflow-hidden rounded-md sm:h-20 sm:w-36">
          {event.bannerMobileUrl && <source media="(max-width: 639px)" srcSet={event.bannerMobileUrl} />}
          <img src={event.bannerUrl} alt="" className="h-full w-full object-cover" />
        </picture>
      )}
      <div className="min-w-0">
        <p className="line-clamp-2 text-base font-semibold text-foreground">{event.title}</p>
        <p className="text-sm text-muted-foreground">{[date, time, place].filter(Boolean).join(' · ')}</p>
      </div>
    </div>
  );
}
