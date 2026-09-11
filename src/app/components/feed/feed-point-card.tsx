/**
 * @file feed-point-card.tsx
 * @description P491: Lightweight point card for the public feed.
 * Takes PointWithUserPosition (production type), renders pin icon, statement, position buttons, tag pills.
 * Slate left border. Clickable → navigates to /point/:id.
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pin, ChevronRight, ChevronDown } from 'lucide-react';
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
  AddStoryPill,
  CardOpenButton,
  CardShareButton,
  EditYourStoryLink,
} from '@/app/components/shared/card-footer-controls';
import type { PointWithUserPosition, PositionType, StoryWithAuthor } from '@/app/types';
import { pointsService } from '@/app/data/points-service';
import { useAuth } from '@/auth';
import { RemovePositionDialog, useRemovePositionGuard } from '@/app/components/shared/remove-position-dialog';
import { getAnonPosition, setAnonPosition } from '@/app/hooks/useAnonPosition';
import { AnonPositionCTA } from '@/app/components/shared/anon-position-cta';
import { useTextOverflow } from '@/app/hooks/use-text-overflow';

interface FeedPointCardProps {
  point: PointWithUserPosition;
  activeTag?: string;
  /** P543: Notify parent that a position was removed — parent decides whether to filter or decrement */
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
}

export function FeedPointCard({ point, activeTag, onPointRemoved, linkedStories, surface = 'feed' }: FeedPointCardProps) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const viewerId = session?.user?.id;

  // P594: Expand/collapse for truncated text. P1296 item 6: measured by the shared hook the
  // story cards use (P1259 change 6), so a resize or a late webfont re-measures too.
  const statementRef = useRef<HTMLParagraphElement>(null);
  const [statementExpanded, setStatementExpanded] = useState(false);
  const [storiesExpanded, setStoriesExpanded] = useState(false);
  const statementOverflows = useTextOverflow(statementRef, [point.statement]);

  // Optimistic position state
  const [localPosition, setLocalPosition] = useState<PositionType | null>(null);
  // P502: Separate anon position state — used only for button highlight, never for count adjustment
  const [anonPosition, setAnonPositionState] = useState<PositionType | null>(null);
  const serverPosition = point.userPosition?.position ?? null;

  // P401: Guard position removal — only shows dialog when linked stories exist
  const { dialogProps, guardedRemovePosition } = useRemovePositionGuard({
    userId: viewerId ?? '',
    onAfterRemove: () => {
      const removedPosition = localPosition ?? serverPosition;
      setLocalPosition(null);
      // P543: Always delegate to parent — it uses functional setState for current totalPositions
      onPointRemoved?.(point.id, removedPosition);
    },
  });

  const handleClick = () => {
    navigate(`/point/${point.id}`);
  };
  const effectivePosition = session?.user
    ? (localPosition ?? serverPosition)
    : anonPosition;

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
     a story here, and offering "+ Add your story" to someone who has one is the wrong call.
     The linked set is read through RLS, so it includes the viewer's own private story. */
  const viewerStory = viewerId && linkedStories
    ? linkedStories.find((linked) => linked.authorId === viewerId)
    : undefined;
  const addStoryCopy = viewerId && authedEffective && linkedStories !== undefined && !viewerStory
    ? getPositionCTACopy(getPositionGroup(authedEffective))
    : null;

  const handlePositionClick = async (position: PositionType) => {
    // P502: Anonymous user → optimistic local position, no redirect
    if (!session?.user) {
      const newPosition = effectivePosition === position ? null : position;
      setAnonPositionState(newPosition);
      setAnonPosition(point.id, newPosition);
      return;
    }

    const newPosition = effectivePosition === position ? null : position;

    if (newPosition === null) {
      // Toggle-off: use guarded removal to warn about linked stories
      await guardedRemovePosition(point.id);
      return;
    }

    setLocalPosition(newPosition);

    try {
      await pointsService.setPosition(point.id, session.user.id, newPosition);
      // P543: Card's local optimistic state (localPosition + adjustPositionCounts) handles
      // the visual update — no parent callback needed for set-position path
    } catch {
      // Revert on error
      setLocalPosition(null);
      toast.error('Failed to save position.');
    }
  };

  return (
    <>
    <RemovePositionDialog {...dialogProps} />
    <div
      role="button"
      tabIndex={0}
      className="bg-card rounded-lg shadow-sm border-l-4 border-l-muted-foreground/50 border border-border cursor-pointer hover:border-muted-foreground/70 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      /* P1212 — see feed-story-card.tsx. Without a name this root is announced as its whole
         subtree, and §5 put an expandable list of QuotedStory cards inside it, so the
         concatenation now includes every linked story's author and prose. */
      aria-label={`Point: ${point.statement}`}
      onClick={handleClick}
      onKeyDown={(e) => {
        // P1212: only the CARD ITSELF activates. Without the target check this fires for a
        // keydown on any nested control — the story expander, a position button, a
        // QuotedStory, the share sheet — and, because it calls preventDefault(), cancels
        // that control's own activation before navigating.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Pin icon */}
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600">
            <Pin className="w-4 h-4 rotate-45" />
          </div>

          <div className="flex-1 min-w-0">
            {/* Statement with inline visibility icon. P1296 item 6 — `text-base` and 40 lines,
                the story cards' measure (arbitrary value: see feed-story-card.tsx). */}
            <p
              ref={statementRef}
              className={`text-base font-medium text-foreground break-words ${statementExpanded ? '' : 'line-clamp-[40]'}`}
            >
              <InlineVisibilityIcon visibility={point.visibility} />{' '}
              {linkifyText(stripHashtags(point.statement, point.tags))}
            </p>
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
            <TagPills tags={point.tags} context="feed" activeTag={activeTag} className="mt-2" />

            {/* Position buttons. P1296: share USED TO sit at the end of this row — the only card
                whose share was not in a footer. It moved to the footer below; the row is the
                position buttons alone, so tabbing through it no longer lands on an unrelated
                control between the last position and the story list. */}
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
                  await guardedRemovePosition(point.id);
                }}
              />
            </div>
            {/* P502: Anonymous position CTA */}
            {!session?.user && anonPosition && (
              <AnonPositionCTA pointId={point.id} position={anonPosition} />
            )}
          </div>
        </div>
      </div>

      {/* P1296 item 1 — the footer every story and point card carries, on /feed, /stake and
          the profile: count and contribution CTA left; share, then open-in-new, right. This card
          had no footer row at all (its story count sat in the body and its share in the
          position row), so this is a new row, shaped like the story card's. */}
      <div
        role="presentation"
        className="flex flex-col gap-2 px-4 py-2.5 border-t border-border"
        onClick={(e) => e.stopPropagation()}
        data-testid="point-card-footer"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {linkedStories !== undefined && (
              linkedStories.length > 0 ? (
                <button
                  onClick={() => setStoriesExpanded(!storiesExpanded)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-blue-600 transition-colors min-h-[40px]"
                  aria-expanded={storiesExpanded}
                  data-testid="feed-point-story-expander"
                >
                  {storiesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>
                    {linkedStories.length} {linkedStories.length === 1 ? 'story' : 'stories'}
                  </span>
                </button>
              ) : (
                <span className="text-sm text-muted-foreground">0 stories</span>
              )
            )}
            {viewerStory && (
              <EditYourStoryLink onClick={() => navigate(`/story/${viewerStory.id}?edit=true`)} />
            )}
            {addStoryCopy && (
              <AddStoryPill copy={addStoryCopy} onClick={() => navigate(`/create?pointId=${point.id}`)} />
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            <CardShareButton
              type="point"
              id={point.id}
              surface={surface}
              description={point.statement.slice(0, 100)}
            />
            <CardOpenButton type="point" onOpen={handleClick} />
          </div>
        </div>

        {/* The SAME QuotedStory the profile point card and live sessions render, not a local
            text preview. A second excerpt renderer here would be a ninth surface with its own
            label handling, its own agent treatment and its own truncation rule. */}
        {storiesExpanded && linkedStories && linkedStories.length > 0 && (
          /* P1270 §2 — the thread line the other surfaces already had. `ThreadLine` is the
             universal "belongs to" pattern (decisions.md 2026-03-17): "All stories get
             ThreadLine — even single items need the connecting line to visually anchor them
             to the parent card." */
          <ThreadLineGroup>
            {linkedStories.map((linked, index) => (
              <ThreadLineItem key={linked.id} isLast={index === linkedStories.length - 1}>
                <QuotedStory
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
                    navigate(`/story/${linked.id}`);
                  }}
                  onAuthorClick={(e) => {
                    e.stopPropagation();
                    navigate(`/p/${linked.authorSlug || linked.authorId}`);
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
        )}
      </div>
    </div>
    </>
  );
}
