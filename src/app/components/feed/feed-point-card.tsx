/**
 * @file feed-point-card.tsx
 * @description P491: Lightweight point card for the public feed.
 * Takes PointWithUserPosition (production type), renders pin icon, statement, position buttons, tag pills.
 * Slate left border. Opens /point/:id through its `Details →` button only (P1415).
 */

import { useState, useMemo, useEffect, useRef, useId } from 'react';
import { useOpenPath } from '@/app/components/shared/links-in-new-tab';
import { Pin } from 'lucide-react';
import { toast } from 'sonner';
import { linkifyText } from '@/app/utils/linkify';
import { stripHashtags } from '@/lib/utils';
import { TagPills } from '@/app/components/shared/tag-pills';
import {
  PositionButtons,
} from '@/app/components/shared';
import { adjustPositionCounts, getPositionCTACopy, getPositionGroup } from '@/app/utils/position-helpers';
import { QuotedStory } from '@/app/components/social/point-card-with-links';
import { ThreadLineGroup, ThreadLineItem } from '@/app/components/shared';
import { InlineVisibilityIcon } from '@/app/components/shared';
import {
  CardCountText,
  CardExpander,
  CardFooterActions,
  CardMenu,
  CardSlotLink,
} from '@/app/components/shared/card-footer-controls';
import type { PointWithUserPosition, PositionType, StoryWithAuthor } from '@/app/types';
import { useAuth } from '@/auth';
import { RemovePositionDialog, useRemovePositionGuard } from '@/app/components/shared/remove-position-dialog';
import { getAnonPosition, setAnonPosition } from '@/app/hooks/useAnonPosition';
import { AnonPositionCTA } from '@/app/components/shared/anon-position-cta';
import { useTextOverflow } from '@/app/hooks/use-text-overflow';
import { useReturnState } from '@/app/hooks/use-return-state';
import { UNRESOLVED_WRITE_MESSAGE, canSendWrite, isNetworkWriteFailure } from '@/app/hooks/use-online-write-guard';
import {
  beginPositionWrite,
  endPositionWrite,
  isLatestPositionWrite,
  recordConfirmedPosition,
  sendPositionWrite,
  settlePositionWrite,
} from '@/app/data/position-write-outcome';
import { networkMark } from '@/lib/network-outcome';

interface FeedPointCardProps {
  point: PointWithUserPosition;
  activeTag?: string;
  /**
   * P543: Notify parent that a position it COUNTED was removed — parent decrements that bucket and
   * the total, and drops the point at zero. Called only when the withdrawn position is one the
   * page's counts contain (the fetched one); a position added on this card since the fetch was
   * never counted, so there is nothing for the page to lower (P1296 review).
   */
  onPointRemoved?: (pointId: string, removedPosition: PositionType | null) => void;
  /**
   * P1212 §5 — the stories arguing this point, batch-fetched by the page
   * (`getStoriesForPoints`, one query per page — never per card).
   *
   * Undefined means "not loaded" and renders no count; an empty array means "loaded,
   * none linked" and renders the `0 stories` label. Profile point cards and the point
   * detail page already carried this affordance; the feed was the surface that did not.
   */
  linkedStories?: StoryWithAuthor[];
  /** Which list the card sits on — carried on `feed_card_shared`. */
  surface?: 'feed' | 'stake';
  /** P1336: hide the anonymous "Sign up or log in to save your position" nudge — for embeds
   *  where the visitor already has an identity (a registrant in onboarding). Default false. */
  hideAnonSignupCta?: boolean;
}

export function FeedPointCard({ point, activeTag, onPointRemoved, linkedStories, surface = 'feed', hideAnonSignupCta = false }: FeedPointCardProps) {
  // P1336: in-app paths open in a new tab when the host flow says so (onboarding's embedded stake).
  const openPath = useOpenPath();
  const { session } = useAuth();
  const viewerId = session?.user?.id;

  // P594: Expand/collapse for truncated text. P1296 item 6: measured by the shared hook the
  // story cards use (P1259 change 6), so a resize or a late webfont re-measures too.
  const statementRef = useRef<HTMLParagraphElement>(null);
  // P1364 §5: remembered per visit — Back reopens what the reader had open (use-return-state.ts).
  const [statementExpanded, setStatementExpanded] = useReturnState(`feed-point-text:${point.id}`, false);
  const [storiesExpanded, setStoriesExpanded] = useReturnState(`feed-point-stories:${point.id}`, false);
  const statementOverflows = useTextOverflow(statementRef, [point.statement]);

  // Optimistic position state
  const [localPosition, setLocalPosition] = useState<PositionType | null>(null);
  // P502: Separate anon position state — used only for button highlight, never for count adjustment
  const [anonPosition, setAnonPositionState] = useState<PositionType | null>(null);
  /* P1296 review (MEDIUM) — a CONFIRMED withdrawal must retire the position this card was
     fetched with, not only its local override. Before this, clearing `localPosition` made the card
     fall back to `point.userPosition` from the original fetch: the button stayed lit and the
     "+ Add a story" link kept offering a story for a stance the viewer had just dropped.
     The page lowers the counts itself (P543) — and its counts contain ONLY the position this
     card was fetched with, so that is the one the withdrawal reports (below), never a local
     change made since. Treating the fetched position as gone afterwards is what keeps
     `adjustPositionCounts` from lowering it a second time. A fresh fetch (a new `userPosition`
     object) is the only thing that brings it back. */
  const [withdrawn, setWithdrawn] = useState(false);
  // P1369: /feed and /stake render cached cards offline — a vote there must never look saved.
  // P1420: `canSendWrite` probes first when only an earlier failure says "unreachable".
  /* P1369 review: a failed save takes the vote back only if it was the latest click, and back to
     the last SAVED local vote — not to what showed before that click, which may itself have been
     an unsaved click that also failed (Agree then Disagree, both failing, left Agree lit). */
  const savedLocal = useRef<PositionType | null>(null);
  /* P1420 round 3: the generation of the write `savedLocal` came from. A write that succeeded is
     the server's state even if a newer click superseded it in the UI, so it still moves the
     baseline (only forwards): a later failure then rolls back to the TRUE server state. */
  const savedGeneration = useRef(0);
  /* P1420: keyed on the fetched position VALUE. Since in-place refresh keeps the card mounted, a
     refreshed row is a new object every few seconds on a weak connection; resetting on identity
     would re-light a confirmed withdrawal from any refresh, even one that agrees with it. */
  const fetchedPosition = point.userPosition?.position ?? null;
  useEffect(() => { setWithdrawn(false); savedLocal.current = null; }, [fetchedPosition]);
  const serverPosition = withdrawn ? null : fetchedPosition;
  /* P1420: a removal whose answer was lost settles up to a minute later, after the rows may have
     been refreshed in place. The callback must read the position the page counts NOW (a refreshed
     row may already exclude the viewer) — the render it was created in is stale. */
  const serverPositionRef = useRef(serverPosition);
  serverPositionRef.current = serverPosition;
  // P1420: a settle still running when the card unmounts stops (no reads, no effects).
  const unmounted = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    unmounted.current = controller;
    return () => controller.abort();
  }, []);

  // P401: Guard position removal — only shows dialog when linked stories exist
  const { dialogProps, guardedRemovePosition } = useRemovePositionGuard({
    userId: viewerId ?? '',
    onAfterRemove: () => {
      // The position the PAGE counted: the fetched one, or none if nothing was fetched or it was
      // already withdrawn. Reporting a local change instead lowered the wrong bucket, and with
      // nothing fetched it lowered a position that was never counted — dropping a point another
      // person still holds (review of the P1296 fix delta; the bug predates P1296).
      const removedPosition = serverPositionRef.current;
      setLocalPosition(null);
      savedLocal.current = null;
      setWithdrawn(true);
      // P543: delegate to the parent — it uses functional setState for current totalPositions.
      // Only for a counted position: both parents lower the TOTAL unconditionally, so calling them
      // for an uncounted one dropped a point another person still holds.
      if (removedPosition) onPointRemoved?.(point.id, removedPosition);
    },
  });

  const openDetails = () => openPath(`/point/${point.id}`);
  const cardId = useId(); // P1415: describes `Details →` by this card's name
  const effectivePosition = session?.user
    ? (localPosition ?? serverPosition)
    : anonPosition;
  // P1420: read after an await (the probe), when the render that started the click may be stale.
  const effectivePositionRef = useRef(effectivePosition);
  effectivePositionRef.current = effectivePosition;

  useEffect(() => {
    if (localPosition !== null && localPosition === serverPosition) {
      setLocalPosition(null);
    }
  }, [serverPosition, localPosition]);

  // P502: Load anon position from localStorage on mount
  useEffect(() => {
    if (!session?.user) {
      const stored = getAnonPosition(point.id) as PositionType | null;
      if (stored) setAnonPositionState(stored);
    }
  }, [session?.user, point.id]);

  const baseCounts = useMemo(
    () => point.positionCounts ?? {
      strongly_agree: 0, agree: 0, somewhat_agree: 0,
      unsure: 0,
      somewhat_disagree: 0, disagree: 0, strongly_disagree: 0,
    },
    [point.positionCounts]
  );

  // P502: Count adjustment uses authedEffective (localPosition ?? serverPosition) —
  // never anonPosition — so anonymous clicks don't inflate aggregates.
  const authedEffective = localPosition ?? serverPosition;
  const counts = useMemo(
    () => adjustPositionCounts(baseCounts, serverPosition, authedEffective),
    [baseCounts, serverPosition, authedEffective],
  );

  /* P1296 item 1 — the viewer's contribution CTA, the profile point card's logic (P822 +
     P470 Case E) on every card. The profile gates it on `isOwnProfile`; that condition is
     dropped here because a feed or stake card always shows the VIEWER's own relation to the
     point. A signed-in viewer only: an anonymous position is local-storage only (P502) and
     has its own CTA below.

     Waits for the links: until they load there is no telling whether the viewer already has
     a story here, and offering "+ Add a story" to someone who has one is the wrong call.
     The linked set is read through RLS, so it includes the viewer's own private story. */
  const viewerStory = viewerId && linkedStories
    ? linkedStories.find((linked) => linked.authorId === viewerId)
    : undefined;
  const addStoryCopy = viewerId && authedEffective && linkedStories !== undefined && !viewerStory
    ? getPositionCTACopy(getPositionGroup(authedEffective))
    : null;

  /* A confirmed vote is the viewer's position again: it also ends a withdrawal (P1420 round 3).
     Without this, re-voting after a removal kept `withdrawn` set — the stale fetched position was
     hidden while still counted, so the count went up twice. */
  const confirmBaseline = (generation: number, position: PositionType) => {
    if (generation <= savedGeneration.current) return;
    savedGeneration.current = generation;
    savedLocal.current = position;
    setWithdrawn(false);
  };

  const handlePositionClick = async (position: PositionType) => {
    // P502: Anonymous user → optimistic local position, no redirect
    if (!session?.user) {
      const newPosition = effectivePosition === position ? null : position;
      setAnonPositionState(newPosition);
      setAnonPosition(point.id, newPosition);
      return;
    }

    const userId = session.user.id;
    if (!(await canSendWrite())) return;

    // From refs, AFTER the probe: a click made meanwhile (or a refresh) may have changed them.
    const newPosition = effectivePositionRef.current === position ? null : position;

    if (newPosition === null) {
      // Toggle-off: use guarded removal to warn about linked stories
      await guardedRemovePosition(point.id);
      return;
    }

    const generation = beginPositionWrite(userId, point.id);
    const isLatest = () => isLatestPositionWrite(userId, point.id, generation);
    try {
      setLocalPosition(newPosition);

      const sentAt = networkMark();
      try {
        // Bounded: a captive portal can leave the request unanswered for good.
        await sendPositionWrite(userId, point.id, newPosition, generation);
        confirmBaseline(generation, newPosition);
        // P543: Card's local optimistic state (localPosition + adjustPositionCounts) handles
        // the visual update — no parent callback needed for set-position path
      } catch (err) {
        // Revert to the last saved local vote (not to the fetched position: an earlier, saved
        // change on this card is still the viewer's position). A newer write owns the display.
        if (!isNetworkWriteFailure(err, sentAt)) {
          if (!isLatest()) return;
          setLocalPosition(savedLocal.current);
          toast.error('Failed to save position.');
          return;
        }
        // P1420: sent, never answered — it may have landed. Ask the server.
        const outcome = await settlePositionWrite({
          userId,
          pointId: point.id,
          generation,
          expected: newPosition,
          signal: unmounted.current.signal,
        });
        if (outcome.kind === 'superseded') return;
        if (outcome.kind === 'confirmed') {
          confirmBaseline(generation, newPosition);
          recordConfirmedPosition(userId, point.id, generation, newPosition);
          return;
        }
        setLocalPosition(savedLocal.current);
        toast.error(outcome.kind === 'rejected' ? 'Your position was not saved. Try again.' : UNRESOLVED_WRITE_MESSAGE); // copy approved by founder 2026-10-05
      }
    } finally {
      endPositionWrite(userId, point.id); // bounded bookkeeping (P1420 round 3)
    }
  };

  return (
    <>
    <RemovePositionDialog {...dialogProps} />
    {/* P1415 — the card is NOT a control: tapping its body navigates nowhere, at any width (on
        phones the whole-card tap kept sending readers away by accident). `Details →` in the
        footer opens the point; the links inside the card open what they name. So no
        role="button", tab stop, pointer cursor or "the whole card is a link" hover border. */}
    <article
      className="bg-card rounded-lg shadow-sm border-l-4 border-l-muted-foreground/50 border border-border"
      /* P1212 — see feed-story-card.tsx. Without a name this root is announced as its whole
         subtree, and §5 put an expandable list of QuotedStory cards inside it, so the
         concatenation now includes every linked story's author and prose. */
      aria-label={`Point: ${point.statement}`}
      /* P1364: a stable per-card handle for the Back-position e2e (first card fully in view). */
      data-testid={`feed-point-card-${point.id}`}
      /* P1391: the preparation scrolls to the first unanswered card by this id. */
      data-point-id={point.id}
    >
      {/* P1415: the card's name, referenced by `Details →` (aria-describedby). `hidden`: read only
          through that reference, never in the page flow. */}
      <span id={cardId} hidden>{`Point: ${point.statement}`}</span>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Pin icon */}
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600">
            <Pin className="w-4 h-4 rotate-45" />
          </div>

          <div className="flex-1 min-w-0">
            {/* Statement with inline visibility icon. P1296 item 6 — `text-base` and 40 lines,
                the story cards' measure (arbitrary value: see feed-story-card.tsx).
                P1366 — this is the card's top row, so the `⋯` menu joins it, top-right. Its
                negative margins let the 44px target sit in the card's padding instead of
                pushing the statement down. */}
            <div className="flex items-start justify-between gap-2">
              <p
                ref={statementRef}
                className={`min-w-0 flex-1 text-base font-medium text-foreground break-words ${statementExpanded ? '' : 'line-clamp-[40]'}`}
              >
                <InlineVisibilityIcon visibility={point.visibility} />{' '}
                {linkifyText(stripHashtags(point.statement, point.tags))}
              </p>
              <CardMenu
                type="point"
                id={point.id}
                surface={surface}
                description={point.statement.slice(0, 100)}
                className="-mt-2 -mr-2"
              />
            </div>
            {statementOverflows && !statementExpanded && (
              <button
                onClick={(e) => { e.stopPropagation(); setStatementExpanded(true); }}
                className="text-sm text-blue-600 font-medium mt-1"
              >
                show more
              </button>
            )}
            {statementExpanded && (
              <button
                onClick={(e) => { e.stopPropagation(); setStatementExpanded(false); }}
                className="text-sm text-muted-foreground mt-1"
              >
                show less
              </button>
            )}

            {/* Tag pills */}
            <TagPills tags={point.tags} systemTags={point.systemTags} context="feed" activeTag={activeTag} className="mt-2" />
            {/* A replaced wording, shown when the feed lists every version: without this the old
                and new wording of one st sit side by side, indistinguishable (the #v pill is hidden). */}
            {point.supersededBy && (
              <p className="mt-1 text-sm text-muted-foreground" data-testid="earlier-wording">Earlier wording</p>
            )}

            {/* Position buttons. P1296: share USED TO sit at the end of this row. It moved out
                (since P1366 into the `⋯` menu above); the row is the position buttons alone, so
                tabbing through it no longer lands on an unrelated control between the last
                position and the story list. */}
            <div role="presentation" className="mt-2" onClick={(e) => e.stopPropagation()}>
              <PositionButtons
                userPosition={effectivePosition}
                counts={counts}
                onPositionClick={handlePositionClick}
                onClear={async () => {
                  if (!session?.user) {
                    setAnonPositionState(null);
                    setAnonPosition(point.id, null);
                    return;
                  }
                  if (!(await canSendWrite())) return;
                  await guardedRemovePosition(point.id);
                }}
              />
            </div>
            {/* P502: Anonymous position CTA */}
            {!hideAnonSignupCta && !session?.user && anonPosition && (
              <AnonPositionCTA pointId={point.id} position={anonPosition} />
            )}
          </div>
        </div>
      </div>

      {/* P1296 item 1, laid out by P1366 — the footer every story and point card carries, on
          /feed, /stake and the profile: the solid story expander and the viewer's slot left,
          `Details →` right (card-footer-controls.tsx). Share lives in the `⋯` up top. */}
      <div
        role="presentation"
        /* FOUNDER DECISION 2026-09-29: the row starts at the card's left edge, in line with the
           pin, mirroring `Details →` flush right — `px-4`, no statement-column indent. The
           expanded story list below keeps that indent (16 + 44 = the old 60px). */
        className="flex flex-col gap-2 px-4 py-2.5 border-t border-border"
        onClick={(e) => e.stopPropagation()}
        data-testid="point-card-footer"
      >
        <CardFooterActions type="point" onDetails={openDetails} describedBy={cardId} loading={linkedStories === undefined}>
          {linkedStories && linkedStories.length > 0 && (
            <CardExpander
              label={`${linkedStories.length} ${linkedStories.length === 1 ? 'story' : 'stories'}`}
              expanded={storiesExpanded}
              onToggle={() => setStoriesExpanded(!storiesExpanded)}
              testId="feed-point-story-expander"
            />
          )}
          {/* The viewer's slot: their story on this point, or the invitation to write one. It
              opens the story to READ — the old `?edit=true` link dropped readers into an editor. */}
          {viewerStory && (
            <CardSlotLink kind="your-story" onClick={() => openPath(`/story/${viewerStory.id}`)} />
          )}
          {addStoryCopy && (
            <CardSlotLink kind="add-story" copy={addStoryCopy} onClick={() => openPath(`/create?pointId=${point.id}`)} />
          )}
          {linkedStories?.length === 0 && !viewerStory && !addStoryCopy && <CardCountText>0 stories</CardCountText>}
        </CardFooterActions>

        {/* The SAME QuotedStory the profile point card and live sessions render, not a local
            text preview. A second excerpt renderer here would be a ninth surface with its own
            label handling, its own agent treatment and its own truncation rule. */}
        {storiesExpanded && linkedStories && linkedStories.length > 0 && (
          /* P1270 §2 — the thread line the other surfaces already had. `ThreadLine` is the
             universal "belongs to" pattern (decisions.md 2026-03-17): "All stories get
             ThreadLine — even single items need the connecting line to visually anchor them
             to the parent card." */
          <div className="sm:pl-[44px]">
          <ThreadLineGroup>
            {linkedStories.map((linked, index) => (
              <ThreadLineItem key={linked.id} isLast={index === linkedStories.length - 1}>
                <QuotedStory
                  scopeId={point.id}
                  // Production -> prototype shape, the same conversion
                  // point-detail-page.tsx performs. `linkedPointIds` is unused by QuotedStory
                  // (it renders author, text and media only) and the feed has not fetched the
                  // reverse direction here.
                  story={{
                    id: linked.id,
                    authorId: linked.authorId,
                    text: linked.content,
                    createdAt: linked.createdAt,
                    visibility: linked.visibility,
                    linkedPointIds: [],
                    understoodCount: linked.understoodCount,
                    imageUrl: linked.imageUrl,
                    // P1212 §4: the video and its quotes travel with the story.
                    videoUrl: linked.videoUrl,
                    videoQuotes: linked.videoQuotes,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    openPath(`/story/${linked.id}`);
                  }}
                  onAuthorClick={(e) => {
                    e.stopPropagation();
                    openPath(`/p/${linked.authorSlug || linked.authorId}`);
                  }}
                  getStoryAuthor={() => ({
                    id: linked.authorId,
                    name: linked.authorName,
                    slug: linked.authorSlug,
                    avatarColor: linked.authorAvatarColor,
                    avatarUrl: linked.authorAvatarUrl,
                    earsCount: linked.authorEarsCount,
                    hasPledged: linked.authorHasPledged,
                  })}
                  /* P1259 change 4 — THE FEED ONLY. This is the surface where a point
                     carries several stories at once, so it is the only one where two
                     authors can disagree in front of the reader with nothing saying so.
                     The profile's stance-above-the-point layout is deliberately untouched
                     (founder: "profile stay same"). `authorPositionOnPoint` is attached per
                     (point, author) by getStoriesForPoints, so `linked` is already scoped to
                     THIS point. */
                  authorPosition={linked.authorPositionOnPoint}
                />
              </ThreadLineItem>
            ))}
          </ThreadLineGroup>
          </div>
        )}
      </div>
    </article>
    </>
  );
}
