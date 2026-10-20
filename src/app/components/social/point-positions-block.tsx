/**
 * @file point-positions-block.tsx
 * @description P1508 D6 — the point page's "Filter by position" block, extracted so the canvas's
 * open point renders the same one: the filter tabs, everyone's position rows with their story
 * behind a toggle, and "Perspectives without position". Moved from point-detail-page.tsx unchanged.
 * (The spread lives on the point card, not here — founder, fifth round.)
 *
 * The page owns the state the block shows (the filter, which story is open) and passes it in:
 * the point page keeps the filter in `?filter=` and the open story in useReturnState; the canvas
 * keeps both in component state, per point, and never writes the address.
 */
import { AgentByline } from '@/app/components/shared/agent-byline';
import { useEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { PointPositionWithUser, PositionType, PositionButtonGroup, StoryWithAuthor, Story as AppStory } from '@/app/types';
import { getPositionGroup } from '@/app/utils/position-helpers';
import { useAgentAccountIds } from '@/app/contexts/agent-accounts-context';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import {
  PositionBadge,
  FilterTabs,
  ThreadLineGroup,
  ThreadLineItem,
  type PositionFilter,
} from '@/app/components/shared';
import { EarBadge } from '@/components/ui/ear-badge';
import { StoryCardWithLinks, type StoryAuthor } from '@/app/components/social/story-card-with-links';
import type { Story as ProtoStory } from '@/app/components/shared/prototype-types';
import { totalPositions, type LevelCounts } from '@/lib/position-spread';

interface PointPositionsBlockProps {
  /** everyone's position on the point, with names */
  positions: PointPositionWithUser[];
  /** seven-level counts: the tabs and the spread */
  counts: LevelCounts;
  /** the stories linked to this point (any author), newest first */
  stories: StoryWithAuthor[];
  viewerId?: string;
  /** the viewer's own story, when the page read it separately (it takes priority on their row) */
  viewerStory?: StoryWithAuthor | AppStory | null;
  filter: PositionFilter;
  onFilterChange: (filter: PositionFilter) => void;
  /** whose story is open (a user id), or null */
  expandedId: string | null;
  onExpandedChange: (next: string | null | ((prev: string | null) => string | null)) => void;
  /** P621: the viewer unlinks this point from their story */
  onUnlinkStory?: (storyId: string) => void;
  /** a person whose story the page already shows above (the canvas card's owner): no toggle here */
  storyShownAbove?: string;
  /**
   * The canvas: Escape anywhere in the block closes the open story and only that — the panel
   * around it must not close (the toggle keeps focus after opening, outside the story region).
   */
  collapseOnEscape?: boolean;
}

export function PointPositionsBlock({
  positions,
  counts,
  stories,
  viewerId,
  viewerStory = null,
  filter: positionFilter,
  onFilterChange,
  expandedId: expandedHolderId,
  onExpandedChange: setExpandedHolderId,
  onUnlinkStory,
  storyShownAbove,
  collapseOnEscape = false,
}: PointPositionsBlockProps) {
  const navigate = useNavigate();

  // Derive Map<userId, StoryWithAuthor> from the batch-fetched stories for this point.
  // RLS enforces visibility — trust what the query returns.
  const storyByAuthorId = useMemo(() => {
    const map = new Map<string, StoryWithAuthor>();
    for (const story of stories) {
      if (story.authorId === storyShownAbove) continue;
      // Take only the first story per author (array is ordered desc by created_at)
      if (!map.has(story.authorId)) {
        map.set(story.authorId, story);
      }
    }
    return map;
  }, [stories, storyShownAbove]);

  // P574: Stories whose authors have no position on this point
  const positionlessStories = useMemo(() => {
    const positionUserIds = new Set(positions.map(p => p.userId));
    const result: StoryWithAuthor[] = [];
    for (const [authorId, story] of storyByAuthorId) {
      if (!positionUserIds.has(authorId)) {
        result.push(story);
      }
    }
    return result;
  }, [storyByAuthorId, positions]);

  // Group positions by stance
  const positionGroups = useMemo(() => {
    const groups: Record<PositionButtonGroup, PointPositionWithUser[]> = {
      agree: [],
      disagree: [],
      unsure: [],
    };

    for (const pos of positions) {
      const group = getPositionGroup(pos.position as PositionType);
      groups[group].push(pos);
    }

    return groups;
  }, [positions]);

  // Position counts for filter tabs
  const positionCounts = useMemo(() => ({
    all: totalPositions(counts),
    agree: counts.agree + counts.strongly_agree + counts.somewhat_agree,
    disagree: counts.disagree + counts.strongly_disagree + counts.somewhat_disagree,
    unsure: counts.unsure,
  }), [counts]);

  // Which position groups to show based on filter
  const positionsToShow: PositionButtonGroup[] =
    positionFilter === 'all' ? ['agree', 'disagree', 'unsure'] : [positionFilter as PositionButtonGroup];

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!collapseOnEscape || e.key !== 'Escape' || e.defaultPrevented || expandedHolderId === null) return;
    e.preventDefault();
    const toggle = e.currentTarget.querySelector<HTMLElement>(`[aria-controls="story-${expandedHolderId}"]`);
    setExpandedHolderId(null);
    toggle?.focus();
  };

  return (
    // A keyboard listener only, for the open story below (the codebase's wrapper pattern).
    <div role="presentation" onKeyDown={onKeyDown} data-testid="point-positions-block">
      {/* Positions section */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {/* Filter tabs */}
        <FilterTabs
          activeFilter={positionFilter}
          onFilterChange={(filter) => { onFilterChange(filter); setExpandedHolderId(null); }}
          counts={positionCounts}
        />

        {/* Position holders by stance */}
        <div className="p-4 space-y-4">
          {positionsToShow.map(positionGroup => {
            const holdersInGroup = positionGroups[positionGroup];

            if (holdersInGroup.length === 0 && positionFilter === 'all') {
              return null; // Hide empty sections when showing all
            }

            if (holdersInGroup.length === 0) {
              return (
                <p key={positionGroup} className="text-center text-muted-foreground text-sm py-3">
                  (no positions yet)
                </p>
              );
            }

            return (
              <div key={positionGroup} className="space-y-3">
                {holdersInGroup.map(holder => {
                  const isViewer = viewerId === holder.userId;

                  // P542: Determine story data — viewer's story takes priority
                  const holderStory = holder.userId === storyShownAbove
                    ? null
                    : isViewer && viewerStory
                      ? viewerStory
                      : storyByAuthorId.get(holder.userId) ?? null;
                  const hasStory = holderStory !== null;
                  const isExpanded = expandedHolderId === holder.userId;

                  return (
                    <div key={holder.id}>
                      <PositionHolderCard
                        holder={holder}
                        onProfileClick={() => navigate(`/p/${holder.userSlug}`)}
                        hasStory={hasStory}
                        isExpanded={isExpanded}
                        onToggle={() => {
                          setExpandedHolderId(prev =>
                            prev === holder.userId ? null : holder.userId
                          );
                        }}
                      />
                      {/* P542: Expandable story region */}
                      {holderStory && isExpanded && (
                        <ExpandableStoryRegion
                          holder={holder}
                          story={holderStory}
                          isViewer={isViewer}
                          onCollapse={() => setExpandedHolderId(null)}
                          onUnlinkPoint={isViewer ? onUnlinkStory : undefined}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {positions.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-6">
              No one has taken a position yet
            </p>
          )}
        </div>

      </div>

      {/* P574: Positionless stories section */}
      {positionlessStories.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden mt-4">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-medium text-muted-foreground">Perspectives without position</h3>
          </div>
          <div className="p-4 space-y-3">
            {positionlessStories.map(story => {
              const isExpanded = expandedHolderId === story.authorId;

              return (
                <div key={story.id}>
                  <PositionlessStoryRow
                    story={story}
                    isExpanded={isExpanded}
                    onToggle={() => {
                      setExpandedHolderId(prev =>
                        prev === story.authorId ? null : story.authorId
                      );
                    }}
                    onProfileClick={() => navigate(`/p/${story.authorSlug}`)}
                  />
                  {isExpanded && (
                    <PositionlessStoryRegion
                      story={story}
                      onCollapse={() => setExpandedHolderId(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact row for a position holder. Shows chevron + "story" when hasStory is true.
 * P542: All holders render as uniform compact rows.
 */
function PositionHolderCard({
  holder,
  onProfileClick,
  hasStory = false,
  isExpanded = false,
  onToggle,
}: {
  holder: PointPositionWithUser;
  onProfileClick: () => void;
  hasStory?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
}) {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const { isAgentAccountId, isLoading: identityPending } = useAgentAccountIds();
  const isAgent = isAgentAccountId(holder.userId);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${holder.userName}'s profile`}
      onClick={onProfileClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          // If this row has a story, Enter/Space toggles expand instead of navigating
          if (hasStory && onToggle) {
            onToggle();
          } else {
            onProfileClick();
          }
        }
      }}
      className={`group flex items-center gap-3 p-3 bg-muted rounded-lg border border-border cursor-pointer hover:bg-accent hover:border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none transition-colors${isAgent ? ' agent-card-drained' : ''}`}
      {...(isAgent ? { 'data-agent-row': 'true' } : {})}
      {...(hasStory ? {
        'aria-expanded': isExpanded,
        'aria-controls': `story-${holder.userId}`,
      } : {})}
    >
      {/* P852 Round-E: pledger ring restored at compact size — semantic correctness over clip aesthetics */}
      <GravatarAvatar
        name={holder.userName}
        photoUrl={holder.userAvatarUrl}
        avatarColor={holder.userAvatarColor}
        size="sm"
        isPledger={holder.userHasPledged}
        isAgent={isAgent}
        identityPending={identityPending}
        className="!w-5 !h-5 !text-[10px]"
      />

      {/* P1141 amendment: the drain covers the identity cluster (name, ear, stance) and
          STOPS before the story toggle — a blue control the reader can act on. It used to
          wrap the whole row, greying that button. The inner span keeps `flex-wrap` so
          name+badges still wrap at 320px, and the toggle stays a direct child of the outer
          flex row so its `ml-auto` still right-aligns against it. */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
        <span className={"flex min-w-0 flex-wrap items-center gap-1.5"}>
          {/* P1141 amendment: an agent account is named the same way on every surface;
              the raw stored `Agent · {Name}` used to leak through here. */}
          {isAgent ? (
            <AgentByline name={holder.userName} />
          ) : (
            <span className="font-medium text-foreground text-sm truncate">{holder.userName}</span>
          )}
          {/* P1104: an agent account holds no reputation. EarBadge is "never conditionally
              hide — 0 is meaningful" for people, so the suppression lives here at the call
              site, not in the component. */}
          {!isAgent && !identityPending && <EarBadge count={holder.earCount} name={holder.userName} />}
          <PositionBadge position={holder.position} />
        </span>

        {/* Chevron + "story" toggle — or "Add a story" CTA */}
        {hasStory && onToggle && (
          <button
            ref={toggleRef}
            data-testid="story-toggle"
            onClick={e => { e.stopPropagation(); onToggle(); }}
            className="ml-auto flex items-center gap-1 text-xs font-medium border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 rounded-full px-2.5 py-1 transition-colors shrink-0"
            aria-label={isExpanded ? `Collapse story by ${holder.userName}` : `Expand story by ${holder.userName}`}
          >
            {isExpanded ? <ChevronDown size={14} className="transition-transform" /> : <ChevronRight size={14} className="transition-transform" />}
            <span>1 story</span>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * P542: Expanded story region with ThreadLine connecting line.
 * Shows story card below the position row with vertical connector.
 */
function ExpandableStoryRegion({
  holder,
  story,
  isViewer,
  onCollapse,
  onUnlinkPoint,
}: {
  holder: PointPositionWithUser;
  story: StoryWithAuthor | AppStory;
  isViewer: boolean;
  onCollapse: () => void;
  onUnlinkPoint?: (storyId: string) => void;
}) {
  const regionRef = useRef<HTMLDivElement>(null);

  // Build proto story and author for StoryCardWithLinks
  const protoStory: ProtoStory = {
    id: story.id,
    authorId: 'authorId' in story ? story.authorId : (story as AppStory).authorId,
    text: 'content' in story ? story.content : (story as StoryWithAuthor).content,
    createdAt: story.createdAt,
    visibility: story.visibility,
    linkedPointIds: [],
    understoodCount: story.understoodCount,
    // P1349: this copy predates P1141 and dropped the story's media, so point pages showed no video.
    imageUrl: 'imageUrl' in story ? story.imageUrl : undefined,
    videoUrl: 'videoUrl' in story ? story.videoUrl : undefined,
    videoQuotes: 'videoQuotes' in story ? story.videoQuotes : undefined,
  };

  // Author info — differs for viewer (uses holder data) vs others (uses StoryWithAuthor)
  const storyAuthor: StoryAuthor = isViewer || !('authorName' in story)
    ? {
        id: holder.userId,
        name: holder.userName,
        hasPledged: holder.userHasPledged,
        ear: holder.earCount,
        avatarUrl: holder.userAvatarUrl,
        avatarColor: holder.userAvatarColor,
      }
    : {
        id: (story as StoryWithAuthor).authorId,
        name: (story as StoryWithAuthor).authorName,
        role: (story as StoryWithAuthor).authorRole,
        hasPledged: (story as StoryWithAuthor).authorHasPledged,
        ear: (story as StoryWithAuthor).authorEarsCount ?? 0,
        avatarUrl: (story as StoryWithAuthor).authorAvatarUrl,
        avatarColor: (story as StoryWithAuthor).authorAvatarColor,
      };

  const storyTags = 'tags' in story ? story.tags : undefined;

  // Handle Escape key to collapse and return focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Not when something else already handled this Escape (an open popover closes first).
      if (e.key === 'Escape' && !e.defaultPrevented) {
        // Handled here: a dialog around the block (the canvas panel) must not also close.
        e.preventDefault();
        onCollapse();
        // Return focus to the toggle button in the row
        const toggle = document.querySelector(`[aria-controls="story-${holder.userId}"]`);
        if (toggle instanceof HTMLElement) toggle.focus();
      }
    };

    const region = regionRef.current;
    if (region) {
      region.addEventListener('keydown', handleKeyDown);
      return () => region.removeEventListener('keydown', handleKeyDown);
    }
  }, [holder.userId, onCollapse]);

  return (
    <div
      id={`story-${holder.userId}`}
      role="region"
      aria-label={`${holder.userName}'s story`}
      ref={regionRef}
    >
      <ThreadLineGroup>
        <ThreadLineItem isLast>
          <StoryCardWithLinks
            story={protoStory}
            author={storyAuthor}
            context="point-detail"
            compact
            tags={storyTags}
            onUnlinkPoint={onUnlinkPoint}
          />
        </ThreadLineItem>
      </ThreadLineGroup>
    </div>
  );
}

/**
 * P574: Compact row for a positionless story author.
 * Similar to PositionHolderCard but without a position badge.
 */
function PositionlessStoryRow({
  story,
  isExpanded,
  onToggle,
  onProfileClick,
}: {
  story: StoryWithAuthor;
  isExpanded: boolean;
  onToggle: () => void;
  onProfileClick: () => void;
}) {
  const { isAgentAccountId, isLoading: identityPending } = useAgentAccountIds();
  const isAgent = isAgentAccountId(story.authorId);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${story.authorName}'s profile`}
      aria-expanded={isExpanded}
      aria-controls={`story-${story.authorId}`}
      onClick={onProfileClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      className={`group flex items-center gap-3 p-3 bg-muted rounded-lg border border-border cursor-pointer hover:bg-accent hover:border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none transition-colors${isAgent ? ' agent-card-drained' : ''}`}
      {...(isAgent ? { 'data-agent-row': 'true' } : {})}
    >
      <GravatarAvatar
        name={story.authorName}
        photoUrl={story.authorAvatarUrl}
        avatarColor={story.authorAvatarColor}
        size="sm"
        isPledger={story.authorHasPledged ?? false}
        isAgent={isAgent}
        identityPending={identityPending}
        className="!w-5 !h-5 !text-[10px]"
      />
      {/* P1141 amendment: the drain covers the identity cluster (name, ear, stance) and
          STOPS before the story toggle — a blue control the reader can act on. It used to
          wrap the whole row, greying that button. The inner span keeps `flex-wrap` so
          name+badges still wrap at 320px, and the toggle stays a direct child of the outer
          flex row so its `ml-auto` still right-aligns against it. */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
        <span className={"flex min-w-0 flex-wrap items-center gap-1.5"}>
          {/* P1141 amendment: an agent account is named the same way on every surface;
              the raw stored `Agent · {Name}` used to leak through here. */}
          {isAgent ? (
            <AgentByline name={story.authorName} />
          ) : (
            <span className="font-medium text-foreground text-sm truncate">{story.authorName}</span>
          )}
          {!isAgent && !identityPending && <EarBadge count={story.authorEarsCount ?? 0} name={story.authorName} />}
        </span>

        <button
          data-testid="story-toggle"
          onClick={e => { e.stopPropagation(); onToggle(); }}
          className="ml-auto flex items-center gap-1 text-xs font-medium border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 rounded-full px-2.5 py-1 transition-colors shrink-0"
          aria-label={isExpanded ? `Collapse story by ${story.authorName}` : `Expand story by ${story.authorName}`}
        >
          {isExpanded ? <ChevronDown size={14} className="transition-transform" /> : <ChevronRight size={14} className="transition-transform" />}
          <span>1 story</span>
        </button>
      </div>
    </div>
  );
}

/**
 * P574: Expanded story region for a positionless story.
 * Mirrors ExpandableStoryRegion but derives author from StoryWithAuthor.
 */
function PositionlessStoryRegion({
  story,
  onCollapse,
}: {
  story: StoryWithAuthor;
  onCollapse: () => void;
}) {
  const regionRef = useRef<HTMLDivElement>(null);

  const protoStory: ProtoStory = {
    id: story.id,
    authorId: story.authorId,
    text: story.content,
    createdAt: story.createdAt,
    visibility: story.visibility,
    linkedPointIds: [],
    understoodCount: story.understoodCount,
    // P1349: same media omission as above.
    imageUrl: story.imageUrl,
    videoUrl: story.videoUrl,
    videoQuotes: story.videoQuotes,
  };

  const storyAuthor: StoryAuthor = {
    id: story.authorId,
    name: story.authorName,
    role: story.authorRole,
    hasPledged: story.authorHasPledged ?? false,
    ear: story.authorEarsCount ?? 0,
    avatarUrl: story.authorAvatarUrl,
    avatarColor: story.authorAvatarColor,
  };

  const storyTags = story.tags;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Not when something else already handled this Escape (an open popover closes first).
      if (e.key === 'Escape' && !e.defaultPrevented) {
        // Handled here: a dialog around the block (the canvas panel) must not also close.
        e.preventDefault();
        onCollapse();
        const toggle = document.querySelector(`[aria-controls="story-${story.authorId}"]`);
        if (toggle instanceof HTMLElement) toggle.focus();
      }
    };

    const region = regionRef.current;
    if (region) {
      region.addEventListener('keydown', handleKeyDown);
      return () => region.removeEventListener('keydown', handleKeyDown);
    }
  }, [story.authorId, onCollapse]);

  return (
    <div
      id={`story-${story.authorId}`}
      role="region"
      aria-label={`${story.authorName}'s story`}
      ref={regionRef}
    >
      <ThreadLineGroup>
        <ThreadLineItem isLast>
          <StoryCardWithLinks
            story={protoStory}
            author={storyAuthor}
            context="point-detail"
            compact
            tags={storyTags}
          />
        </ThreadLineItem>
      </ThreadLineGroup>
    </div>
  );
}
