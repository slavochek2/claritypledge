/**
 * @file PrepRoom.tsx
 * @description P1336 — the room's side of the preparation: the gate a registrant whose
 * preparation is not complete sees at `/events/:slug/room`, and the banner on /ready and /meet
 * that keeps the preparation one tap away for someone who joined without it.
 *
 * "Join the room without preparing" enters directly — no confirmation dialog — and is
 * remembered for this browser session, so the gate does not reappear on every visit to /room.
 */
import { Skeleton } from '@/components/ui/skeleton';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth';
import { useConnectivity } from '@/app/contexts/offline-status-context';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import { Button } from '@/components/ui/button';
import type { EventWithHost } from '@/app/types';
import { PrepStatus } from './PrepPieces';
import { PrepBannerSkeleton } from './PrepBannerSkeleton';
import { usePrepState } from './use-prep-state';
import { gatesRoomOnPreparation, offersPreparation, recipeFor } from '../series-recipes';
import { MEMBERSHIP_READ_TIMEOUT_MS, useEventCommunity, useEventCommunityName, useEventMembership } from '../use-event-community';
import { whenVisible } from '../when-visible';
import { cn } from '@/lib/utils';

const bypassKey = (eventId: string, viewerId: string) => `p1336-room-bypass:${viewerId}:${eventId}`;
export function hasBypassedPrep(eventId: string, viewerId: string): boolean {
  try {
    return sessionStorage.getItem(bypassKey(eventId, viewerId)) === '1';
  } catch {
    return false;
  }
}
function rememberBypass(eventId: string, viewerId: string) {
  try {
    sessionStorage.setItem(bypassKey(eventId, viewerId), '1');
  } catch { /* storage unavailable: the gate shows again next visit */ }
}

/** The signed-in id from the SESSION, not the profile — the same rule as EventRoomAccess (P1369):
 *  offline, or while the profile read is still out, `user` is null but the session is not. */
function useViewerId(): string | null {
  const { user, session } = useAuth();
  return session?.user?.id ?? user?.id ?? null;
}

/** How long an unanswered preparation read may hold the room before the gate steps aside — the
 *  room's own promise (P1369) is a cached copy or needs-connection within about 5 seconds. */
const GATE_READ_DEADLINE_MS = 5000;

/** Whether the room should stop this viewer at the preparation gate. `null` while unknown.
 *  It never traps anyone outside the room: offline, no viewer id, a failed read or a read that
 *  outlives the deadline all mean "no gate". */
export function useRoomPrepGate(event: EventWithHost | null, granted: boolean): { gate: boolean | null } {
  const viewerId = useViewerId();
  const { offline } = useConnectivity();
  const isHost = !!(event && viewerId && event.hostId === viewerId);
  // P1542: an optional preparation (hikes) never stops anyone at the door.
  const applies = !!(granted && gatesRoomOnPreparation(event) && !isHost && viewerId && !offline);
  const state = usePrepState(applies ? event : null, viewerId ?? undefined);
  const [timedOut, setTimedOut] = useState(false);
  const pending = applies && state.loading;
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setTimedOut(true), GATE_READ_DEADLINE_MS);
    return () => clearTimeout(t);
  }, [pending]);
  if (!applies || !viewerId || !event) return { gate: false };
  if (state.loading) return { gate: timedOut ? false : null };
  if (state.error) return { gate: false };
  if (state.progress.complete) return { gate: false };
  return { gate: !hasBypassedPrep(event.id, viewerId) };
}

export function PrepRoomGate({ event, onJoin }: { event: EventWithHost; onJoin: () => void }) {
  const navigate = useNavigate();
  const viewerId = useViewerId();
  return (
    <section
      className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-sm flex-col items-center justify-center space-y-6 px-4 py-10 text-center lg:min-h-[calc(100vh-5rem)]"
      data-testid="prep-room-gate"
    >
      {/* [DRAFT] */}
      <h1 className="text-2xl font-bold leading-snug text-foreground">You haven&apos;t prepared yet</h1>
      <p className="text-base leading-relaxed text-muted-foreground">
        The discussion uses a special structure. Ten minutes of preparation lets you take part fully.
      </p>
      <div className="flex flex-col items-center gap-1">
        <LetterPrimaryCta label="Prepare now" onClick={() => navigate(`/events/${event.slug}/prepare?from=room`)} />
        <LetterPrimaryCta
          label="Join the room without preparing"
          onClick={() => {
            if (viewerId) rememberBypass(event.id, viewerId);
            onJoin();
          }}
          variant="secondary"
        />
        {/* [DRAFT] the consequence line — no confirmation dialog on skip. */}
        <p className="text-sm text-muted-foreground" data-testid="prep-room-skip-consequence">
          You&apos;ll miss the shared definitions and the meeting principle. You can catch up any time.
        </p>
      </div>
    </section>
  );
}

/**
 * "Start your preparation" (0 done) / "Finish your preparation" (in progress), with the
 * attendee's status, so the host can check it on their phone. Prepared → "Prepared ✓" only.
 * `source="event"` is the same banner on the event page (where the 24h reminder lands): the
 * preparation then ends on its own end screen rather than "Join the room".
 */
export function PrepRoomBanner({ event, source = 'room', centered = false }: {
  event: EventWithHost | null;
  source?: 'room' | 'event';
  /** P1542 VQA round 5: on the centred thank-you screens the optional learning link is centred at every width. */
  centered?: boolean;
}) {
  const viewerId = useViewerId();
  const { offline } = useConnectivity();
  const navigate = useNavigate();
  const isHost = !!(event && viewerId && event.hostId === viewerId);
  // Offline the preparation cannot be read: show nothing rather than "not started" to someone who
  // prepared (review 2026-10-01).
  const applies = !!(offersPreparation(event) && !isHost && viewerId && !offline);
  const state = usePrepState(applies ? event : null, viewerId ?? undefined);
  const offer = event ? recipeFor(event.seriesSlug).prepare.offer : null;
  // Founder round 3: the link names the community (the event's organising group).
  const community = useEventCommunityName(event, applies && !!offer);
  if (!applies || !event || state.error) return null;
  // P1586: a banner that is applicable but still being read would push the content below it when it
  // lands, so it holds its footprint (not-applicable and failed reads still render nothing).
  if (state.loading) return <PrepBannerSkeleton source={source} />;
  const { progress } = state;
  const started = !!state.prep?.startedAt;
  // From the event page the entry below prepare IS the event: mark it, so prepare's "Back to the event" can pop.
  const open = () => navigate(
    `/events/${event.slug}/prepare${source === 'room' ? '?from=room' : ''}`,
    source === 'event' ? { state: { fromEvent: true } } : undefined,
  );
  const status = progress.done === 0 ? 'Preparation not started' : `${progress.done} of ${progress.total} steps`;
  const cta = progress.done === 0 ? 'Start your preparation' : 'Finish your preparation';
  // P1542 UAT 2026-10-23: where the series makes it optional learning (a hike), it is one quiet link, no status.
  if (offer) {
    if (progress.complete || state.learned) return null;
    return (
      <div className={`flex min-h-11 items-center text-sm ${centered ? 'w-full justify-center' : ''}`} data-testid="prep-room-banner">
        <button type="button" onClick={open} className={`min-h-10 text-blue-600 hover:underline ${centered ? 'text-center' : 'text-left'}`} data-testid="prep-room-banner-cta">
          {progress.done === 0 ? offer.start(community ?? null) : offer.resume(community ?? null)}
        </button>
      </div>
    );
  }

  if (source === 'room') {
    // UAT 2026-10-01: in the room this sits on the Back line, not as a box under it. Prepared →
    // nothing here: the roster's check mark beside the person's own row carries it.
    if (progress.complete) return null;
    return (
      <div className="flex min-h-11 flex-wrap items-center justify-end gap-x-2 text-sm" data-testid="prep-room-banner">
        <span className="text-muted-foreground" data-testid="prep-status">{status}</span>
        <button type="button" onClick={open} className="min-h-10 font-medium text-blue-600 hover:underline" data-testid="prep-room-banner-cta">
          {cta}
        </button>
      </div>
    );
  }

  // The event page: prepared is one quiet line, no box (nothing left to do).
  if (progress.complete) {
    return (
      <div data-testid="prep-room-banner">
        <PrepStatus progress={progress} started={started} />
      </div>
    );
  }
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-3 rounded-lg border border-border px-3 py-1"
      data-testid="prep-room-banner"
    >
      <span className="text-sm text-muted-foreground" data-testid="prep-status">{status}</span>
      <button type="button" onClick={open} className="min-h-10 text-sm font-medium text-blue-600 hover:underline" data-testid="prep-room-banner-cta">
        {cta}
      </button>
    </div>
  );
}

/** P1595 (founder-approved copy, 2026-10-30): the registered page says who organises the hike, why the short guide is
 *  worth it, the one button, and that it is optional. One place, so a swap is one line. */
export const LEARN_INVITATION_ORGANISED = 'This hike is organised by';
export const LEARN_INVITATION_SUBTITLE = 'We welcome honest conversations with people who see the world differently. This short guide shows what to expect.';
export const LEARN_INVITATION_OPTIONAL = 'Optional. You can come without it.';
/** The one button: the guide's length in its label (it replaced the separate "6 min" pill). */
export const learnInvitationCta = (started: boolean, minutes: number | null) =>
  minutes === null ? (started ? 'Continue' : 'See how we talk')
  : started ? `Continue (${minutes} min left)` : `See how we talk (${minutes} min)`;

/**
 * Round 10b (founder): what this browser last learned, from reads that all answered, about whether the learning
 * invitation applies to this person. Being a member, or having learned, is a fact about the person and the COMMUNITY,
 * so the answer is kept per viewer and organising group: a member sees neither card nor placeholder on every later
 * event of that group on this device. Only "started" (Continue vs Learn more) is per event.
 */
interface LearnCardMemory { show: boolean; community: string | null }
/** What the card shows; frozen at the deadline (round 10f). */
interface LearnCardDisplay { started: boolean; name: string | null; slug: string | null; titleKnown: boolean; minutes: number | null }
// Round 10f: an event with no group has no community to share an answer with — it is remembered per event.
export const learnCardCommunityKey = (viewerId: string, orgId: string | null, eventId: string) =>
  orgId ? `p1542-learn-card:${viewerId}:org:${orgId}` : `p1542-learn-card:${viewerId}:no-org:${eventId}`;
export const learnCardEventKey = (viewerId: string, eventId: string) => `p1542-learn-card:${viewerId}:event:${eventId}`;
function readJson<T>(key: string): Partial<T> | null {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<T> | null; } catch { return null; }
}
function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: nothing is remembered */ }
}
function readLearnCardMemory(key: string): LearnCardMemory | null {
  const v = readJson<LearnCardMemory>(key);
  return v && typeof v.show === 'boolean' ? { show: v.show, community: typeof v.community === 'string' ? v.community : null } : null;
}
function readStarted(key: string): boolean {
  return readJson<{ started: boolean }>(key)?.started === true;
}

/**
 * P1542 founder UAT round 6 (A, decision 39) and round 6c (J): on a hike's registration thank-you the learning is ONE
 * centred invitation — the named community as a heading, one subtitle (LEARN_INVITATION_SUBTITLE), a computed
 * "6 min" pill, then the page's ONE button, the filled blue "Learn more". A partial learner is invited to continue
 * ("N min left", "Continue"). A learner (here or anywhere, hasLearned) or a member of the event's group sees nothing:
 * there is nothing left to ask. Round 10b: while that is unknown its footprint holds a skeleton (see below).
 */
export function LearnInvitation({ event, className }: { event: EventWithHost; className?: string }) {
  const viewerId = useViewerId();
  const { sessionChecked } = useAuth();
  const { offline } = useConnectivity();
  const navigate = useNavigate();
  const isHost = !!(viewerId && event.hostId === viewerId);
  const offer = recipeFor(event.seriesSlug).prepare.offer;
  const applies = !!(offer && offersPreparation(event) && !isHost && viewerId && !offline);
  // Round 10b (2a): the session is still being restored — who this is is not known yet, so the card's place shows the
  // placeholder. A signed-out visitor (session checked, no viewer) gets nothing, never a placeholder that stays.
  const restoring = !viewerId && !sessionChecked && !!offer && offersPreparation(event) && !offline;
  const state = usePrepState(applies ? event : null, viewerId ?? undefined);
  const group = useEventCommunity(event, applies);
  const community = group === undefined ? undefined : group?.name ?? null;
  const member = useEventMembership(event, applies, viewerId);
  // Founder (round 10b): while it is unknown whether the card applies (learned? member?) and this browser has no trusted
  // answer, the card's exact footprint shows a placeholder; once the reads settle the card fills it (no movement), or
  // the placeholder goes — the last block on the page, so nothing below it moves.
  // (2) The hooks answer only for the inputs they were read for (a disabled hook's idle values read as "unknown"), so
  // the render where the viewer first becomes known never settles on them.
  const settled = !state.loading && member !== undefined;
  const actualShow = settled ? !state.error && !state.learned && member === false : null;
  // Round 10d/10e: one deadline bounds the WHOLE decision — the preparation read and the membership read, including a
  // membership read still waiting for the tab to be seen — counted from when the decision starts for this viewer and
  // event. Once it passes, the decision STAYS timed out for this viewer and event for the rest of this page view: a
  // trusted memory decides, else the card stays hidden, and a read that answers late is neither shown nor remembered
  // (the card never appears after the page has settled without it).
  // Round 10f: the deadline counts only while the tab is seen — a thank-you opened in a background tab starts its 4s
  // when it is first shown. At the timeout, what the card displays (started, title, minutes) is frozen for this page
  // view: a late answer changes nothing on screen.
  const deadlineKey = applies && viewerId ? `${viewerId}:${event.id}` : null;
  const deciding = !!deadlineKey && !settled;
  const [timedOut, setTimedOut] = useState<{ key: string; frozen: LearnCardDisplay } | null>(null);
  const decisionTimedOut = !!deadlineKey && timedOut?.key === deadlineKey;
  const displayRef = useRef<LearnCardDisplay | null>(null);
  useEffect(() => {
    if (!deciding || !deadlineKey || decisionTimedOut) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancelWait = whenVisible(() => {
      timer = setTimeout(() => {
        setTimedOut({ key: deadlineKey, frozen: displayRef.current ?? { started: false, name: null, slug: null, titleKnown: true, minutes: null } });
      }, MEMBERSHIP_READ_TIMEOUT_MS);
    });
    return () => { cancelWait(); if (timer) clearTimeout(timer); };
  }, [deciding, deadlineKey, decisionTimedOut]);
  // Round 10b (2b): only an answer every read actually gave is remembered. A failed prep read (error) or a membership
  // read that failed or timed out (null, "unknown") saves nothing, and the earlier memory stays; a null name (no group,
  // or a failed name read) never overwrites a remembered one.
  const trusted = settled && !decisionTimedOut && !state.error && member !== null;
  const liveStarted = settled ? state.progress.done > 0 : (applies && viewerId ? readStarted(learnCardEventKey(viewerId, event.id)) : false);
  const communityKey = applies && viewerId && event.orgId !== undefined ? learnCardCommunityKey(viewerId, event.orgId, event.id) : null;
  const memory = communityKey ? readLearnCardMemory(communityKey) : null;
  // The name: the read's, else the remembered one. While neither is known the title keeps its place, unseen — until the
  // membership read has settled (2c), by when the name is either known or not coming, and the fallback words show.
  const liveDisplay: LearnCardDisplay = {
    started: liveStarted,
    name: community !== undefined ? community : (memory?.community ?? null),
    // P1595 (Codex): the link's slug comes from the SAME answer as the name — a remembered name has none — and is frozen
    // with it at the deadline, so a late answer can never link a frozen name to another group.
    slug: community !== undefined ? group?.slug ?? null : null,
    titleKnown: community !== undefined || !!memory?.community || member !== undefined,
    minutes: state.minutes,
  };
  displayRef.current = liveDisplay;
  const display = decisionTimedOut && timedOut ? timedOut.frozen : liveDisplay;
  useEffect(() => {
    if (!applies || !viewerId || !trusted || actualShow === null) return;
    if (communityKey) {
      const prior = readLearnCardMemory(communityKey);
      writeJson(communityKey, { show: actualShow, community: community ?? prior?.community ?? null });
    }
    writeJson(learnCardEventKey(viewerId, event.id), { started: state.progress.done > 0 });
  }, [applies, viewerId, trusted, actualShow, communityKey, community, event.id, state.progress.done]);

  if (restoring && offer) return <LearnCard skeleton className={className} />;
  if (!applies || !offer) return null;
  const show = decisionTimedOut ? (memory?.show ?? false) : (actualShow ?? memory?.show ?? null);
  if (show === null) return <LearnCard skeleton className={className} />;
  return (
    <LearnCard
      className={className}
      settled={settled}
      name={display.name}
      slug={display.slug}
      // P1595 (Codex): a member or someone who completed the guide still sees who organises the hike; only the guide's
      // copy, the button and "optional" are the offer.
      offered={show}
      titleHidden={!display.titleKnown && !decisionTimedOut}
      started={display.started}
      minutes={display.minutes}
      // Round 6d (Codex): NO fromEvent marker — the page below the learning is this thank-you, not the event page,
      // so the learning's "Back to the event" must replace with the event rather than pop back here.
      onClick={() => navigate(`/events/${event.slug}/prepare`)}
    />
  );
}

/**
 * The learning invitation's one layout (P1595, founder-approved): under a thin divider, who organises the hike (the
 * community name links to its page), why the short guide is worth it, the page's ONE button with the guide's length,
 * and "optional". `skeleton` (round 10b) draws the same footprint as the app's loading placeholders: every line and the
 * button keep their real size, so the card that replaces it moves nothing. The skeleton has no button — a shape, never a
 * dead control.
 */
function LearnCard({ className, settled = false, name = null, slug = null, offered = true, titleHidden = false, started = false, minutes = null, onClick, skeleton = false }: {
  className?: string;
  settled?: boolean;
  name?: string | null;
  slug?: string | null;
  /** false: only the divider and who organises the hike (a member, or the guide already completed). */
  offered?: boolean;
  titleHidden?: boolean;
  started?: boolean;
  minutes?: number | null;
  onClick?: () => void;
  skeleton?: boolean;
}) {
  const bone = 'rounded-md text-transparent [box-decoration-break:clone]';
  const who = name ?? 'this community';
  // Nothing offered and no group to name: nothing to say.
  if (!skeleton && !offered && !name) return null;
  return (
    <section
      className={cn('flex flex-col items-center gap-3 text-center', className)}
      data-testid={skeleton ? 'learn-card-skeleton' : offered ? 'learn-card' : 'learn-card-organiser'}
      data-settled={settled ? 'true' : 'false'}
      aria-hidden={skeleton || undefined}
      aria-busy={skeleton || undefined}
    >
      <hr className="mb-3 w-full max-w-sm border-border" />
      <h2 id={skeleton ? undefined : "learn-card-title"} className="text-base font-normal text-foreground [text-wrap:balance]" data-testid="learn-card-title">
        {skeleton ? <Skeleton as="span" className={bone}>{LEARN_INVITATION_ORGANISED} this community.</Skeleton> : (
          <span className={cn(titleHidden && 'invisible')}>
            {LEARN_INVITATION_ORGANISED}{' '}
            {slug && name
              ? <Link to={`/groups/${slug}`} className="font-semibold underline underline-offset-4 hover:text-muted-foreground" data-testid="learn-card-community-link">{who}</Link>
              : <span className="font-semibold">{who}</span>}.
          </span>
        )}
      </h2>
      {offered && (
        <>
        <p className="text-base text-muted-foreground [text-wrap:balance]" data-testid="learn-card-reason">
          {skeleton ? <Skeleton as="span" className={bone}>{LEARN_INVITATION_SUBTITLE}</Skeleton> : LEARN_INVITATION_SUBTITLE}
        </p>
        {/* The ONE action on this page: the filled primary, full width (founder round 6c, J; P1595). */}
        <div className="mx-auto mt-2 w-full max-w-sm">
          {skeleton ? (
            <Skeleton className="min-h-14 w-full rounded-full" data-testid="learn-card-skeleton-button" />
          ) : (
            <Button
              className="min-h-14 w-full rounded-full text-base font-bold"
              onClick={onClick}
              data-testid="learn-card-cta"
            >
              {learnInvitationCta(started, minutes)}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground" data-testid="learn-card-optional">
          {skeleton ? <Skeleton as="span" className={bone}>{LEARN_INVITATION_OPTIONAL}</Skeleton> : LEARN_INVITATION_OPTIONAL}
        </p>
        </>
      )}
    </section>
  );
}
