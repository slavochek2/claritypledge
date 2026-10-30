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
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, Linkedin } from 'lucide-react';
import { useDeclareAppMenu, useHideTodaysStrip } from '@/app/components/layout/app-menu-override';
import { useHideTodaysStripForEvent } from '@/app/components/layout/app-shell/shell-nav';
import { toast } from 'sonner';
import { isSessionMismatch } from '@/lib/session-guard';
import { useSignInAgain } from '@/app/hooks/useSignInAgain';
import { useGoBack } from '@/app/hooks/use-go-back';
import { useFinishCloseOnce } from './use-finish-close';
import { useCloseBack } from './use-close-back';
import { closeSearch, replaceIntoClose } from './close-arrival';
import { CloseHeader } from './CloseHeader';
import { closeStepKey, useCloseDraft } from './use-close-draft';
import { useQuoteConsent } from './use-quote-consent';
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
import { feedbackAlwaysOpen, recipeFor, resolveCloseSteps, type ResolvedCloseStep } from '../series-recipes';
/** The three statements about opting in (P1055's triad), asked after the seven. */
const CMP3_TAG = 'cmp3';
import { EventBox, GroupChatOffer, JoinOffer, SocialProof } from '../prep/PrepPieces';
import { useGroupChatOpened } from '../use-group-chat-opened';
import { whenVisible } from '../when-visible';
import { OrgCard } from '@/app/pages/org-directory-page';
import { organizationsService } from '@/app/data/organizations-service';
import type { Organization, OrgParticipation } from '@/app/data/organizations-service.interface';
import { isAnswered, loadTagPoints, usePrepState } from '../prep/use-prep-state';
import { shortCommunityName, useOrgMembership } from '../use-event-community';
import { useJoinResume } from './use-join-resume';
import { JoinedWelcome } from './JoinedWelcome';
import { ActionRow, PINNED_FADE_CLASS, PINNED_FADE_OFF_CLASS, PINNED_FLAT_DESKTOP_CLASS, StepActions, useMeasuredHeight, useScrolledToEnd } from '../prep/prep-ui';
import { safeLinkHref } from '../location-utils';
import { analytics } from '@/lib/mixpanel';
import { CertificateFrame, CertificateOathBody } from '@/app/components/agreements/certificate-frame';
import { COA_VERSIONS, CURRENT_COA_VERSION } from '@/app/content/coa-versions';

/** 'join' (P1542 round 5): the group terms opened from a hike's thank-you, after it. */
type Step = 'intro' | ResolvedCloseStep | 'end' | 'join' | 'welcome';
/** 'welcome' (P1542 round 9): the short success screen after joining from the group terms. */

/** Each step's name: the start screen's agenda and the header above it say the same thing
 *  (founder, round 9). The two feedback screens are one agenda line. */
const STEP_NAME: Record<Exclude<Step, 'intro' | 'end' | 'join' | 'welcome' | PersonalAsk>, string> = {
  score: 'How was it?',
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
/** A question step's name in the header (a recipe may rename the score and appreciate steps). */
const headerTitle = (step: Step, recipe: ReturnType<typeof recipeFor>, split: boolean) =>
  step === 'appreciate' && recipe.appreciate.stepName ? recipe.appreciate.stepName
  : step === 'score' && recipe.scoreStepName ? recipe.scoreStepName
  : step === 'intro' || step === 'end' || step === 'join' || step === 'welcome' ? '' : stepName(step, split);

const stepName = (s: Exclude<Step, 'intro' | 'end' | 'join' | 'welcome'>, split = false) =>
  isAsk(s) ? ASK_NAME[s]
  : split && s === 'improve' ? 'Feedback: what to improve'
  : split && s === 'appreciate' ? 'Feedback: what was good'
  : STEP_NAME[s];

/** Example text inside a box: clearly lighter and italic, so nobody mistakes it for an answer. */
const PLACEHOLDER_CLASS = 'placeholder:italic placeholder:text-gray-400';
/** Every step's title starts at the same place under the header (visual review, round 7). */
// Founder (round 10b): short screens centre what sits above the bar in the space it leaves,
// so no screen shows a white band between the question and the buttons (--chrome = header+bar).
const STACK = 'flex min-h-[calc(100dvh-var(--chrome,0px))] flex-col justify-center pt-2';
/** Round 10 (founder): the main question IS the page title — top, centred, the largest text. */
function Question({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cn('mx-auto max-w-xl text-center text-2xl font-bold leading-tight text-foreground sm:text-3xl', className)} data-testid="step-question">{children}</h1>;
}
/** A small context line above or under the question (never a second heading). */
function Context({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('mx-auto max-w-xl text-center text-base text-muted-foreground', className)}>{children}</p>;
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

/** P1542 founder UAT round: the close drawn INSIDE the event room (?view=feedback) — its header goes into the room's
 *  sticky head, its ways out return to the room, and the URL stays the room's (CloseInRoom.tsx). */
export type CloseRoom = {
  headSlot: HTMLElement | null;
  /** Where the room's pinned head ends (px from the page top), for the centred steps. */
  chromeTop: number;
  leave: () => void;
  /** The "finished" write landed: the room ticks its step and ends its offer at once (P1542 review G2; round 3: only
   *  once the server confirmed it, never on merely reaching the thank-you). */
  onFinished?: () => void;
  /** A non-learner's Join: the learning, in the room, ending on the group terms (P1542 review G3). */
  learnThenJoin?: () => void;
};

export function CloseFlow({ event, initial, viewerId, room }: { event: EventWithHost; initial: CloseState; viewerId: string; room?: CloseRoom }) {
  // The intro's Back: a POP when the event page (or the room) opened this, so the event's own Back does not land
  // here again; a cold arrival (the QR code: /close is the only entry) goes to the event, replaced.
  const recipe = recipeFor(event.seriesSlug);
  // Founder 2026-10-26: a hike's feedback is open before the hike; opened before its start, the score step says so.
  const beforeHikeStart = feedbackAlwaysOpen(event) && Date.now() < new Date(event.datetime).getTime();
  // P1542 VQA round 4 (founder: the app menu on every page): a hike's feedback steps keep the app menu.
  useDeclareAppMenu(!!recipe.prepare.offer);
  const backToEvent = useGoBack(`/events/${event.slug}`);
  // Round 6b (history): the room's "Start now" PUSHES the close and marks the route state, so browser Back from the
  // first question returns to the room; the thank-you's "Back to the event" never pushes, so browser Back after it
  // cannot show the thank-you or a question again (P1562: it returns past the room too — use-close-back.ts).
  const { backToRoom, backToEvent: backToEventPage, arrival } = useCloseBack(event.slug);
  const navigate = useNavigate();
  const signInAgain = useSignInAgain();
  const [headerRef, headerHeight] = useMeasuredHeight();
  const [barRef, barHeight] = useMeasuredHeight();

  // Feedback
  const [score, setScore] = useState<number | null>(initial.score);
  // P1542 review round 9: the answers' drafts (words only) and the quote permission, which lives only on the server and
  // is written only by the box (use-quote-consent.ts; founder 2026-10-05: ticked from the start when nothing is saved).
  const draft = useCloseDraft(viewerId, event.id, { liked: initial.liked, improve: initial.improve });
  const { liked, setLiked, improve, setImprove } = draft;
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
  // P1542 round 5: a named join offer (a hike) is on the thank-you for every non-member, so its group always loads.
  const [communityLoaded, setCommunityLoaded] = useState(!initial.asks.includes('community') && !recipe.joinOffer.named);
  // Round 6b (Codex): true / false once known, null when the membership read failed — an unknown is never "not a
  // member", so a member whose read failed is not shown the Join offer (a later visit reads it again).
  // Round 7f (metered-services rule 3): read once the group is known and the tab is visible, outside the community
  // lookup, so it gates nothing; undefined until it lands (no Join). A recipe without a named join offer never reads it.
  const memberRead = useOrgMembership(recipe.joinOffer.named ? community?.org.id : null, viewerId);
  const [joinedHere, setJoinedHere] = useState(false);
  const isMember: boolean | null | undefined = joinedHere ? true : recipe.joinOffer.named ? memberRead : false;
  // Round 7g (2): the hike thank-you holds its actions until the membership answer lands (no group → nothing to wait for).
  const actionsHeld = recipe.joinOffer.named && !!community && isMember === undefined;
  // Asks answered here tonight: Back skips them (one answer per ask per evening, held by the server).
  const [answered, setAnswered] = useState<PersonalAsk[]>([]);
  // Founder (round 10b, one flow): every ask that still applies is a step of its own. A community
  // ask whose group cannot be shown, or a LinkedIn ask whose link cannot, is dropped — never blank.
  // P1542 founder UAT round 5: where the join offer is named (a hike) it is not a close step: the thank-you invites every
  // non-member to join. Someone who has learned (here or anywhere, hasLearned) goes straight to the group terms; anyone
  // else learns first (inside the room's frame), then lands on the terms. Nobody reaches the terms without learning.
  const learning = usePrepState(recipe.joinOffer.named ? event : null, viewerId);
  const learnLoaded = !recipe.joinOffer.named || !learning.loading;
  const learned = !learning.error && learning.learned;
  const asks = initial.asks.filter(
    (a) => !((a === 'community' && ((communityLoaded && !community) || recipe.joinOffer.named))
      || (a === 'connect' && linkedinLoaded && !hostLinkedIn)),
  );
  // A string key, so the step list is rebuilt only when the asks actually change.
  const asksKey = asks.join(',');
  // Set when they reserve inside the close: the thank-you shows the reserved event.
  const [reserved, setReserved] = useState(false);
  // Set when they join the community inside the close: the thank-you says so.
  const [joined, setJoined] = useState<string | null>(null);
  // P1542 founder round 3: after a hike people coordinate (travel, photos) in the event's group chat. Only a
  // registered attendee reaches the close, and RLS returns the link only to them (P1194).
  const [groupChatUrl, setGroupChatUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!recipe.prepare.offer || !event.hasGroupChat) return;
    let cancelled = false;
    // Round 7e (metered-services rule 3): no request from a hidden tab.
    const cancelWait = whenVisible(() => {
      eventsService.getEventGroupChatUrl(event.id).then((u) => { if (!cancelled) setGroupChatUrl(u); }).catch(() => undefined);
    });
    return () => { cancelled = true; cancelWait(); };
  }, [event.id, event.hasGroupChat, recipe]);
  // Round 6 (decision 43): the thank-you offers the group chat only to someone who has not opened it yet.
  const chat = useGroupChatOpened(event.id, recipe.smartOffers ? groupChatUrl : null, viewerId);

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
  }, [event, viewerId, recipe]);

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

  // P1542: the series' recipe picks and orders the steps; its two conditions are "only if prepared"
  // (the CMP re-check) and "only while it applies" (Postgres offers an ask only while it applies).
  const steps = useMemo<Exclude<Step, 'intro' | 'end'>[]>(
    () => resolveCloseSteps(recipe, {
      prepared: positionIds.length > 0,
      stanceCount: stanceIds?.length ?? 0,
      asks: asksKey ? (asksKey.split(',') as PersonalAsk[]) : [],
    }),
    [recipe, positionIds.length, stanceIds, asksKey],
  );
  /** The agenda: each pair (the CMP re-check, the feedback) is one line (founder, rounds 9 and 10b). */
  // P1542 VQA: a recipe with no intro screen (the hike) counts the two feedback screens as two steps, so no two screens read the same "Step N of M".
  const splitFeedback = !recipe.closeIntro;
  const agenda = steps.filter((s): s is ResolvedCloseStep => s !== 'join' && s !== 'welcome' && (splitFeedback || s !== 'appreciate') && s !== 'stance');
  // Founder (round 10): reserving the next evening lives on the thank-you, not in a step of its own.
  // P1542 (founder 2026-10-23): a series with no next-event offer (a hike) never shows one.
  const offerNext = !!recipe.next && !!nextEvent && !nextRegistered;
  const ready = cmpPoints !== null && stanceIds !== null && nextEvent !== undefined && communityLoaded && linkedinLoaded && learnLoaded;

  // Someone returning by link after giving feedback goes straight to what is left.
  // A returning visitor resumes: the score alone does not mean the feedback is finished (review).
  // A reload returns to the screen it left (Gemini review): skipped text is NULL like unanswered
  // text, so the saved answers alone cannot tell where someone was. The tab remembers; the
  // server's "finished" still wins, and a step that no longer applies falls back below.
  const [searchParams, setSearchParams] = useSearchParams();
  const [stepKey] = useState(() => closeStepKey(viewerId, event.id)); // round 6 (Q3): per person, another's dropped
  const [step, setStep] = useState<Step>(() => {
    // P1542 round 5: back from the learning the thank-you's Join started, straight to the group terms.
    // The router's search (the room's ?view=feedback&join=1 included), not the address bar's — P1542 review round 4.
    if (recipe.joinOffer.named && searchParams.get('join') === '1') return 'join';
    if (initial.finished) return 'end';
    try {
      const saved = sessionStorage.getItem(stepKey) as Step | null;
      if (saved && saved !== 'intro' && saved !== 'end') return saved;
    } catch { /* storage blocked: fall back to the saved answers */ }
    // P1542 UAT 2026-10-23: a recipe without the intro screen starts on its first question (the room's card was the intro).
    return initial.score === null
      ? recipe.closeIntro ? 'intro' : recipe.close[0] as Step
      : initial.liked === null && initial.improve === null
      ? 'topics'
      : initial.liked === null // improve answered, "what did you like" not yet (round-10 review)
      ? 'appreciate'
      : initial.asks[0] ?? 'end';
  });
  useEffect(() => {
    try { sessionStorage.setItem(stepKey, step); } catch { /* best effort */ }
  }, [step, stepKey]);
  // A series with the box (Clarity Night) runs it; one where writing is the consent (a hike) has no box to run.
  const hasQuoteBox = !!recipe.appreciate.consent;
  const consent = useQuoteConsent(event.id, initial.quoteOk, step, hasQuoteBox);
  // Visual review round 5: arrived from the learning the Join started, the terms are step 2 of joining.
  // Round 5c (C): only the learning's own finish marks this (route state), so the step count is shown only to someone
  // who came through step 1 in this flow; a direct ?join=1 or the learner's Review group terms reads "Group terms".
  const [joinViaLearning] = useState(() => (window.history.state?.usr as { joinViaLearning?: boolean } | null)?.joinViaLearning === true);
  // The group terms are a focused step: the phone's "Today's event" strip steps aside so the terms keep the screen.
  useHideTodaysStrip(step === 'join');
  // Round 6b: a hike's feedback steps and thank-you are inside the event the phone's "Today's event" strip points to.
  useHideTodaysStripForEvent(event.slug, !!recipe.prepare.offer);
  // A resumed ask that cannot be shown (its group did not load) goes to the thank-you.
  const resumed = useRef(false);
  useEffect(() => {
    if (!ready || resumed.current) return;
    resumed.current = true;
    if (isAsk(step) && !asks.includes(step)) setStep(asks.find((a) => a !== step) ?? 'end');
    else if (step === 'join') { /* useJoinResume decides (it waits for the membership read) */ }
    else if (step !== 'intro' && step !== 'end' && !steps.includes(step as never)) setStep(initial.score === null ? (recipe.closeIntro ? 'intro' : steps[0] ?? 'end') : steps[1] ?? 'end');
  }, [ready, step, asks]);
  // Round 7f/7g: membership lands after ready, so a resumed group terms waits for it and leaves for the thank-you only
  // for a member or an unknown (never shows a member the terms, never bounces a non-member on a slow read), whichever
  // of ready / membership settles first.
  useJoinResume({ ready, atJoin: step === 'join', showable: !!community && learned, isMember, leave: () => setStep('end') });
  useEffect(() => { setHint(null); }, [step]);
  // Reaching the thank-you is recorded once (retried until it lands, even after a move to the group terms — round 6d).
  useFinishCloseOnce(step === 'end', event.id, initial.finished, room?.onFinished);
  const { clear: clearDraft } = draft;
  useEffect(() => { if (step === 'end') clearDraft(); }, [step, clearDraft]); // D4: a finished close keeps no draft
  // The part of a step reached (founder, round 10: progress counts half steps). The ask's own
  // screens report theirs; the feedback pair is two halves of one agenda line.
  const [askPart, setAskPart] = useState({ at: 0, of: 1 });

  const go = useCallback((to: Step) => {
    setStep(to);
    window.scrollTo(0, 0);
  }, []);
  // The thank-you is a destination with the app menus back (immersive-letter-route.ts reads ?done=1).
  // In the room the URL is the room's (?view=feedback): only a finished ?join=1 is dropped, and the room's own entry
  // state (its depth and marks) is kept.
  const location = useLocation();
  useEffect(() => {
    const params = closeSearch(searchParams, step, !!room);
    if (params) setSearchParams(params, { replace: true, state: room ? location.state : arrival });
  }, [step, searchParams, setSearchParams, arrival, room, location.state]);

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
    // The snapshot this save sends: only drafts still equal to it are cleared when it lands (round 6, Q2).
    const sent = { liked: fb.liked ?? liked, improve: fb.improve ?? improve };
    const ok = await saveEventFeedback(event.id, {
      score: fb.score !== undefined ? fb.score : score,
      liked: sent.liked,
      improve: sent.improve,
      // F1/Z1: an unticked box rides along (re-sent first); a tick never does. No box: the server reads the words.
      quoteOk: hasQuoteBox ? await consent.forAnswerSave() : null,
    });
    setSaving(false);
    if (ok) draft.markSaved(sent); // D4: what was sent is saved — its draft goes
    else toast.error('Could not save. Please check your connection.');
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
    // In the room, every way out of the close returns to the room (founder UAT round).
    if (step === 'intro') return (room?.leave ?? backToEvent)();
    if (step === 'join') return go('end');
    // No intro screen in this recipe: Back from the first question leaves the close — for a hike, to the room it came from.
    if (!recipe.closeIntro && prev(step) === 'intro') return (room?.leave ?? (recipe.room.backToEvent ? backToRoom : backToEvent))();
    if (step === 'community' && askBack.current?.()) return;
    go(prev(step));
  };

  // The bar is pinned on every width (founder, P1402 /prepare), so the page always reserves its height.
  // The thank-you has no bar but the app's bottom tabs (?done=1), so it clears those instead.
  const contentPadding: React.CSSProperties & Record<'--chrome', string> = {
    // In the room the centred steps fill what is left under the room's measured head (founder, 2026-10-29: decision
    // (B), top-aligned, reversed — the questions sit vertically centred again, as on /close).
    '--chrome': `${(room ? room.chromeTop : headerHeight) + barHeight + 40}px`,
    paddingBottom: step === 'end' ? 'calc(6rem + env(safe-area-inset-bottom))' : barHeight > 0 ? barHeight + 24 : 'max(1.5rem, env(safe-area-inset-bottom))',
  };
  const index = agenda.indexOf((step === 'appreciate' && !splitFeedback ? 'improve' : step === 'stance' ? 'positions' : step) as never);
  const pair = steps.includes('stance') && (step === 'positions' || step === 'stance');
  const part =
    step === 'improve' && !splitFeedback ? { at: 0, of: 2 }
    : pair && step === 'positions' ? { at: 0, of: 2 }
    : (step === 'appreciate' && !splitFeedback) || step === 'stance' ? { at: 1, of: 2 }
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
  const textAsk = (opts: { question: string; text: string; setText: (v: string) => void; placeholder: string; skipLabel: string; from: Step; extra?: ReactNode; helper?: string; optional?: boolean }) => {
    // P1542 VQA round 4: optional writing (a hike's recommendation) keeps Submit at full strength (P955: no dimmed
    // primary as decoration); an empty Submit continues like the skip link, saving no words and so no quote.
    const skip = async () => {
      if (saving) return;
      // "Without feedback" means without it (Codex review): words saved earlier — e.g. before
      // going Back — are removed on the server too, with the quote permission they carried.
      opts.setText('');
      const cleared = opts.from === 'appreciate' ? { liked: '' } : { improve: '' };
      if (await saveFeedback(cleared)) go(after(opts.from));
    };
    const dim = !opts.text.trim() && !opts.optional;
    return (
    // Round 5d: a hike's text steps start at the top on a phone (no centred gap above the question, and the keyboard
    // never covers the box). Round 10 (founder): from 520px up they sit in the middle, like the score step before them.
    <section className={cn(recipe.prepare.offer ? 'flex flex-col pt-6 min-[520px]:min-h-[calc(100dvh-var(--chrome,0px))] min-[520px]:justify-center min-[520px]:pt-2' : STACK, 'gap-4')} data-testid={`step-${opts.from}`}>
    <div className="space-y-1">
      <Question>{opts.question}</Question>
      {opts.helper && <p className="text-center text-sm text-muted-foreground" data-testid="step-helper">{opts.helper}</p>}
    </div>
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
          <div className="w-full max-w-sm" title={dim ? 'Write a sentence first.' : undefined}>
            <LetterPrimaryCta
              label="Submit"
              disabled={saving}
              onClick={async () => {
                if (!opts.text.trim()) return opts.optional ? skip() : setHint('Write a sentence first, or continue without it.');
                if (await saveFeedback()) go(after(opts.from));
              }}
              className={dim ? 'opacity-50 hover:bg-blue-600' : undefined}
            />
          </div>
        }
        secondary={
          <LetterPrimaryCta
            label={opts.skipLabel}
            variant="secondary"
            onClick={() => void skip()}
          />
        }
      />
      </div>
      {!opts.text.trim() && hint && <p role="status" className="text-center text-sm text-foreground" data-testid="submit-hint">{hint}</p>}
    </Drawer>
    </section>
    );
  };

  // Wait for every step's data before the first screen, so the step count never changes under the person.
  if (!ready) return <ClarityPageLoader />;

  const tonightLine =
    seriesPeople !== null && seriesPeople > 0 && recipe.next
      ? `${seriesPeople} ${seriesPeople === 1 ? 'person has' : 'people have'} come ${recipe.next.seriesPeople} so far`
      : tonightPeople.length > 0
      ? `${tonightPeople.length} ${tonightPeople.length === 1 ? 'person' : 'people'} came tonight`
      : null;

  return (
    // P1542 VQA round 4 (founder: the app menu on every page): a hike's steps sit in the signed-in shell; the
    // pinned bars rise above the phone's bottom tabs (index.css, [data-close-shell]).
    <div className={cn(!room && 'min-h-[100dvh]', 'bg-background')} data-testid="p1389-close" data-close-shell={recipe.prepare.offer ? '' : undefined}>
      <CloseHeader
        step={step}
        offer={!!recipe.prepare.offer}
        embedded={!!room}
        slot={room?.headSlot ?? null}
        onBack={back}
        toEnd={() => go('end')}
        backToEvent={backToEventPage}
        joinContext={step === 'join' && joinViaLearning && community ? shortCommunityName(community.org.name) : null}
        title={headerTitle(step, recipe, splitFeedback)}
        // Round 5c (H): a hike's last step fills its segment (no sliver at "Step 3 of 3").
        progress={{ chapter: Math.max(index, 0), total: agenda.length, fraction: splitFeedback && part.of === 1 && index === agenda.length - 1 ? 1 : part.at / part.of }}
        headerRef={headerRef}
        headerHeight={headerHeight}
        firstQuestion={!recipe.closeIntro && step === steps[0]}
      />

      <main className="mx-auto max-w-2xl space-y-6 px-4 pt-4" style={contentPadding}>
        {step === 'intro' && (
          // Founder (2026-10-05): frame it first, like /prepare's plan — thanks, how long, which steps.
          // Founder (round 8): a bookend, so centred; "takes 2 minutes", never a step count.
          <section className="flex min-h-[calc(100dvh-var(--chrome,0px))] flex-col items-center justify-center gap-5 text-center" data-testid="step-intro">
            <div className="space-y-1">
              <div data-testid="intro-thanks"><Question>We need your feedback</Question></div>
              <p className="text-base text-muted-foreground">It takes 2 minutes.</p>
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
          // Founder 2026-10-26 (round 8e): on a narrow screen the step starts at the top (no centred band above it), so
          // both rows of the two-row scale sit above the pinned Submit without scrolling.
          <section className={cn(STACK, 'items-center gap-4 max-[519px]:justify-start max-[519px]:gap-3')} data-testid="step-score">
            {/* Founder 2026-10-26: before a hike has started nobody has participated yet — no thanks line then (the
                early-feedback line below explains). After the start, and for Clarity Night, unchanged. */}
            {!beforeHikeStart && <Context>Thank you for participating</Context>}
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
                // !p-0: the card's own p-5 otherwise wins over a plain p-0 (class order), and costs the scale 40px at 320.
                className="border-0 bg-transparent !p-0 shadow-none"
                // Founder 2026-10-26: every number a >= 40px target at 320 (two rows on a narrow screen).
                wrapScale
              />
            </div>
            <Drawer barRef={barRef}>
              <div className="flex justify-center">
                <div className="w-full max-w-sm">
                  {/* Founder 2026-10-26 (P955: no dead primary): Submit is never disabled for want of a number — the
                      stance step's pattern, enabled with a hint on the tap. Disabled only while a save is in flight. */}
                  <LetterPrimaryCta
                    label="Submit"
                    disabled={saving}
                    onClick={() => (picked !== null ? void chooseScore(picked) : setHint(SCORE_HINT))}
                  />
                </div>
              </div>
              {picked === null && hint && <p role="status" className="pt-1 text-center text-sm text-foreground" data-testid="score-hint">{hint}</p>}
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
            {/* P1542 UAT 2026-10-23: a recipe with the CMP re-check as one step shows the stance here, not on a screen of its own. */}
            {recipe.cmpOneStep && stanceIds && stanceIds.length > 0 && (
              <div className="space-y-4 pt-4" data-testid="positions-stance">
                <h2 className="mx-auto max-w-xl text-center text-xl font-bold leading-tight text-foreground">Where do you stand on CMP in your important conversations?</h2>
                <div onClickCapture={() => { setTimeout(recheckStance, 600); setTimeout(recheckStance, 1500); }}>
                  <StakePage tag={CMP3_TAG} embedded pointsOnly onlyIds={stanceIds} linksInNewTab />
                </div>
              </div>
            )}
            <StepActions ref={barRef}>
              {/* Founder: the button says what happens — nothing changed, or the changes are kept. */}
              <LetterPrimaryCta label={positionsChanged ? 'Save changes' : recipe.cmpOneStep ? 'Continue' : 'No changes'} onClick={() => go(after('positions'))} />
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
              question: recipe.appreciate.question,
              text: liked,
              setText: setLiked,
              placeholder: recipe.appreciate.placeholder,
              helper: recipe.appreciate.helper,
              skipLabel: 'Continue without sharing',
              from: 'appreciate',
              optional: recipe.appreciate.optional,
              extra: hasQuoteBox ? (
                <label className="flex min-h-11 items-center gap-2 text-sm text-foreground" data-testid="quote-ok">
                  <input type="checkbox" checked={consent.quoteOk} onChange={(e) => consent.toggle(e.target.checked)} className="h-4 w-4 accent-blue-600" />
                  {recipe.appreciate.consent}
                </label>
              ) : recipe.appreciate.consentLine ? (
                <p className="text-sm text-muted-foreground" data-testid="quote-consent-line">{recipe.appreciate.consentLine}</p>
              ) : undefined,
            })
        )}

        {step === 'connect' && hostLinkedIn && (
          <ConnectAsk hostName={event.hostName} host={hostAvatar} href={hostLinkedIn} saving={saving} barRef={barRef} onAnswer={answer('connect')} />
        )}

        {step === 'community' && community && (
          <CommunityAsk
            community={community}
            named={recipe.joinOffer.named}
            saving={saving}
            barRef={barRef}
            barHeight={barHeight}
            onAnswer={answer('community')}
            join={() => once(() => joinCommunityFromClose(event.id))}
            onJoined={() => { setJoined(community.org.name); setAnswered((x) => [...x, 'community']); go(after('community')); }}
            backRef={askBack}
            onPart={setAskPart}
          />
        )}

        {/* Round 7f/7g: a resumed group terms while the membership read is out (one request, or until the tab is seen),
            and for the one commit before a member or an unknown is sent on to the thank-you — never a blank step. */}
        {step === 'join' && community && learned && isMember !== false && <ClarityPageLoader />}
        {step === 'join' && community && learned && isMember === false && (
          <CommunityAsk
            community={community}
            named
            startAtTerms
            quietJoin
            context={joinViaLearning ? (
              <div data-testid="join-context">
                <p className="text-sm font-semibold text-foreground" data-testid="step-name">Joining {shortCommunityName(community.org.name)}</p>
                <p className="text-xs text-muted-foreground">Part 2 of 2 · Group terms</p>
              </div>
) : undefined /* Founder round 9: no "Group terms" eyebrow above "Join …". */}
            saving={saving}
            barRef={barRef}
            barHeight={barHeight}
            // Round 6 (decision 45): the secondary is "Back" — to the thank-you, recording NO refusal, so the join
            // stays offered there (founder round 5: every non-member is invited).
            onAnswer={() => go('end')}
            join={() => once(async () => {
              // The close's own join where the ask is offered (it records the yes with the membership); otherwise a
              // plain join (the person said no to the ask earlier, and the invitation is now for everyone).
              if (initial.asks.includes('community') && !answered.includes('community')) return joinCommunityFromClose(event.id);
              await organizationsService.joinOrganization(community.org.id);
              return true;
            }).catch(() => false)}
            onJoined={() => { setJoined(community.org.name); setJoinedHere(true); setAnswered((x) => [...x, 'community']); go('welcome'); }}
            backRef={askBack}
            onPart={setAskPart}
          />
        )}

        {step === 'welcome' && community && (
          <JoinedWelcome community={community.org.name} orgId={community.org.id} orgSlug={community.org.slug} onContinue={() => go('end')} />
        )}

        {step === 'end' && recipe.prepare.offer && (
          // P1542 founder UAT round 6 (E, decision 42): one centred stack, no boxed cards — the thanks, 40px, the ONE
          // action (join, for a non-member), and the group chat as a quiet link for someone who has not opened it.
          // No "Not now": a destination is left by its Back; a control that only hides something is gone.
          <section className="flex flex-col items-center pt-6 text-center min-[520px]:min-h-[calc(100dvh-var(--chrome,0px))] min-[520px]:justify-center min-[520px]:pt-2" data-testid="step-end">
            <Check className="h-8 w-8 text-green-600" aria-hidden="true" data-testid="end-success" />
            <h1 className="mt-2 text-2xl font-bold leading-tight text-foreground [text-wrap:balance]" data-testid="step-question">Thank you for your feedback</h1>
            {joined && <p className="mt-2 text-base text-muted-foreground" data-testid="end-joined">You joined {shortCommunityName(joined)}.</p>}
            {/* Round 7g (2): the action area (Join + group chat) waits for the membership answer, so the Join block is
                never inserted above a group-chat link already under a thumb. The thanks above shows at once; what
                arrives later (the chat link has its own two reads) only ever appends below. */}
            {!actionsHeld && recipe.joinOffer.named && community && isMember === false && !joined && (
              // One label for everyone (founder E); the line under it says what follows. Learned → the group terms;
              // not learned (or part way) → the short learning inside the room's frame, which lands on the terms.
              // The learning REPLACES the thank-you (and lands back on it by replacing too), so the history never holds
              // a second copy of the thank-you behind the group terms.
              <div className="mt-10 w-full">
                <JoinOffer
                  community={shortCommunityName(community.org.name)}
                  learned={learned}
                  started={learning.progress.done > 0}
                  minutes={learning.minutes}
                  onJoin={() => (learned ? go('join') : (room?.learnThenJoin ?? (() => navigate(`/events/${event.slug}/prepare?from=room&then=join`, replaceIntoClose(arrival))))())}
                />
              </div>
            )}
            {!actionsHeld && groupChatUrl && chat.opened === false && recipe.afterChatCaption && (
              // Round 6c (F): the flow's one group-chat offer — link, caption directly under it.
              <div className="mt-6">
                <GroupChatOffer url={groupChatUrl} caption={recipe.afterChatCaption} onOpen={() => chat.markOpened('feedback_thankyou')} testId="end-group-chat" captionTestId="end-group-chat-caption" />
              </div>
            )}
          </section>
        )}

        {step === 'end' && !recipe.prepare.offer && (
          // Founder (round 10): the thank-you IS the reserve screen — a destination with the app menus
          // back (?done=1), the next evening as a small card and ONE button; no "Not now" (D3).
          <section className="flex min-h-[calc(100dvh-14rem)] flex-col items-center justify-center gap-5 text-center" data-testid="step-end">
            {/* Founder (round 10b): the thanks is courtesy, the invitation is the one thing to do —
                so the invitation is the title and the thanks the small line above it. (A hike's thank-you is above.) */}
            {nextEvent && offerNext ? (
              <>
                <Context>Thank you for your feedback</Context>
                <Question>{recipe.next?.heading}</Question>
              </>
            ) : nextEvent && reserved ? (
              <>
                <Context>Thank you for your feedback</Context>
                <Question>Your place is reserved</Question>
              </>
            ) : (
              <Question>Thank you for your feedback</Question>
            )}
            {joined && <Context><span data-testid="end-joined">You joined {joined}.</span></Context>}
            {/* P1542 UAT 2026-10-23: only a place reserved HERE is announced; someone already registered for the next
                event just finished this one, so the thank-you claims no reservation. */}
            {nextEvent && reserved && (
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
                      let ok: boolean | undefined;
                      try {
                        ok = await once(() => eventsService.rsvpToEvent(nextEvent.id, viewerId));
                      } catch (err) {
                        // P1441: the client could not act as this person, so nothing was sent.
                        if (isSessionMismatch(err)) return signInAgain(nextEvent.slug);
                        throw err;
                      }
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
// [FOUNDER DECISION: copy — PROPOSED] the score step's hint when Submit is tapped with no number picked.
const SCORE_HINT = 'Pick a number from 0 to 10.';

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
  named = false,
  startAtTerms = false,
  quietJoin = false,
  context,
  saving,
  barRef,
  barHeight = 0,
  onAnswer,
  join,
  onJoined,
  backRef,
  onPart,
}: {
  community: Community;
  /** P1542 (founder 2026-10-23, a hike): headed with the group's own name; "Review group terms", then "Accept and
   *  join" with "Not now" as the small link under it. Clarity Night keeps its words. */
  named?: boolean;
  /** P1542 round 5: opened from the thank-you's invitation, the card is skipped (the invitation was it). */
  startAtTerms?: boolean;
  /** Round 9: the welcome screen that follows says it, so no toast on top of it. */
  quietJoin?: boolean;
  /** Round 6b: where this step sits ("Group terms", or "Joining … · Part 2 of 2"), above the heading — the page's own
   *  Back lives in the shell top bar. */
  context?: ReactNode;
  saving: boolean;
  barRef: (node: HTMLDivElement | null) => void;
  /** Round 6e: the pinned bar's measured height, so the end-of-terms check knows where the bar's top edge is. */
  barHeight?: number;
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
  const [stage, setStage] = useState<'card' | 'terms'>(startAtTerms ? 'terms' : 'card');
  const [joining, setJoining] = useState(false);
  // Round 6e: the fade above the pinned "Accept and join" goes once the terms are scrolled to their end.
  const [endRef, atEnd] = useScrolledToEnd(barHeight);
  useEffect(() => { onPart({ at: stage === 'terms' ? 1 : 0, of: 2 }); }, [stage, onPart]);
  useEffect(() => {
    backRef.current = () => (stage === 'terms' && !startAtTerms ? (setStage('card'), true) : false);
    return () => { backRef.current = null; };
  }, [stage, backRef, startAtTerms]);
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
      if (!quietJoin) toast.success(`You've joined ${org.name}`);
      onJoined();
    };
    return (
      <section className={cn(named ? 'flex flex-col pt-2' : STACK, 'gap-4')} data-testid="community-terms">
        <div className="space-y-2">
          {context && <div className="text-center">{context}</div>}
          {/* The join page's own wording (/groups/:slug/join): joining first, the terms explained. */}
          {/* Round 6b: a hike's heading and line are balanced (no single word stranded on a phone). */}
          <Question className={named ? '[text-wrap:balance]' : undefined}>Join {named ? shortCommunityName(org.name) : org.name}</Question>
          {/* Visual review round 5: a hike's join says it in plain words (the COA's own intro stays on /groups/:slug/join). */}
          {/* Round 6c/6e: "non‑binding" never splits — a non-breaking hyphen (U+2011) in plain text, so text-wrap: balance
              can still balance the line (it could not around the earlier inline no-wrap span). */}
          <Context className={named ? '[text-wrap:balance]' : undefined}>{named ? 'Members accept these non‑binding terms as a shared intention.' : coa.intro}</Context>
        </div>
        <CertificateFrame ariaLabel="Clarity Group Terms" title={coa.title} kicker="A commitment to every member" epigraph="We all crave being understood. Let's commit to listen." balanced={named}>
          <CertificateOathBody sections={[coa.yourRight, coa.myPromise, coa.exception]} prettyWrap={named} />
        </CertificateFrame>
        {/* Round 6e: the end of the terms, for the fade above the pinned bar. */}
        {named && <div ref={endRef} aria-hidden="true" className="h-px" data-testid="terms-content-end" />}
        {/* Round 5c (B): a hike's terms are read before accepting — the actions follow the terms in the page flow,
            never pinned over them. */}
        {named && (
          // Round 6b: PINNED, like every step's bar (FixedBottomBar; above the phone's bottom tabs via [data-close-shell]),
          // so "Accept and join" never moves while the terms scroll, and no blank band opens above the tabs. The page
          // reserves the bar's measured height, so the terms' last line still scrolls fully clear of it (round 5d).
          // Round 6d/6e: the same pinned-footer treatment as the room's Opt in bar (shared in prep-ui): a fade tall and
          // opaque enough that no line is cut at the edge, gone once the terms are scrolled to their end, flat on desktop.
          <StepActions ref={barRef} className={cn(PINNED_FADE_CLASS, atEnd && PINNED_FADE_OFF_CLASS, PINNED_FLAT_DESKTOP_CLASS)}>
          <div className="flex w-full justify-center" data-testid="terms-actions">
            <ActionRow
              primary={<LetterPrimaryCta label={joining ? 'Joining…' : 'Accept and join'} disabled={joining || saving} onClick={() => void accept()} />}
              // Round 6c (I): opened from the thank-you's Join, the way out is the shell top bar's "Back" (to the
              // thank-you, no refusal recorded — decision 45), so the pinned footer holds "Accept and join" alone.
              secondary={startAtTerms ? undefined : <LetterPrimaryCta label="Not now" variant="secondary" disabled={joining || saving} onClick={() => onAnswer('no')} />}
            />
          </div>
          </StepActions>
        )}
        {!named && (
        <StepActions ref={barRef}>
          {(
          <ActionRow
            primary={<LetterPrimaryCta label={joining ? 'Joining…' : 'Accept terms & join'} disabled={joining || saving} onClick={() => void accept()} />}
            secondary={<LetterPrimaryCta label="Back" variant="secondary" onClick={() => setStage('card')} />}
          />
          )}
        </StepActions>
        )}
      </section>
    );
  }

  return (
    // Founder (round 10, /presi3 slide 17): the invitation, one line, the group card. The long
    // About text is gone (D2): the card already says what the group is.
    <section className={cn(STACK, 'items-center gap-4')} data-testid="ask-community">
      {/* P1542 (founder 2026-10-23): a hike names its organising group (this card's own group), never a fixed name. */}
      <Question>{named ? `Join ${shortCommunityName(org.name)}` : `Join the ${shortCommunityName(org.name)}`}</Question>
      <Context>Practise clarity together. Build trust that holds.</Context>
      <div className="w-full max-w-md" data-testid="community-card">
        <OrgCard org={org} memberCount={community.members} participation={community.participation} isMine={false} asStatic />
      </div>
      {named ? (
        // P1542 VQA round 4: one primary, "Not now" the small link under it (the terms view's pattern).
        <StepActions ref={barRef}>
          <div className="flex w-full justify-center" data-testid="ask-answers">
            <ActionRow
              primary={<LetterPrimaryCta label="Review group terms" disabled={saving} onClick={() => setStage('terms')} />}
              secondary={<LetterPrimaryCta label="Not now" variant="secondary" disabled={saving} onClick={() => onAnswer('no')} />}
            />
          </div>
        </StepActions>
      ) : (
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
      )}
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
