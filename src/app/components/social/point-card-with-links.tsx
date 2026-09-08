/**
 * @file point-card-with-links.tsx
 * @description Production PointCard component with linked Stories support
 * Refactored from prototype to accept explicit props instead of using mock data
 */

import { AgentByline } from '@/app/components/shared/agent-byline';
import { useState, useMemo, useEffect } from 'react';
import { getAnonPosition, setAnonPosition as setAnonPositionStorage } from '@/app/hooks/useAnonPosition';
import { useEmbedNavigation } from '@/app/hooks/useEmbedNavigation';
import { AnonPositionCTA } from '@/app/components/shared/anon-position-cta';
import { Pin, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { EarBadge } from '@/components/ui/ear-badge';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { useAgentAccountIds } from '@/app/contexts/agent-accounts-context';
import {
  PointHeader,
  PositionButtons,
  PositionBadge,
  ShareButton,
  InlineVisibilityIcon,
  ThreadLineGroup,
  ThreadLineItem,
  type SevenPointCounts,
} from '@/app/components/shared';
import { linkifyText } from '@/app/utils/linkify';
import type { PositionType } from '@/app/types';
import { getPositionGroup, getPositionCTACopy, adjustPositionCounts, type PositionCTACopy } from '@/app/utils/position-helpers';
import type { Point, Position, Story } from '@/app/components/shared/prototype-types';
import { TagPills } from '@/app/components/shared/tag-pills';
import { StoryImage } from '@/app/components/shared/story-image';
import { StoryMedia } from '@/app/components/shared/story-media';
import { StoryVideoQuotes } from '@/app/components/shared/story-video-quotes';
import { useLazyStoryPlayer } from '@/app/hooks/use-lazy-story-player';
import { normalizeVideoQuotes } from '@/lib/video';
import { stripHashtags, stripAgentPrefix } from '@/lib/utils';
import { storyTextForDisplay } from '@/lib/story-quotes';

/** Author information for a story in quoted context */
export interface StoryAuthor {
  id: string;
  name: string;
  role?: string;
  hasPledged?: boolean;
  ear?: number;
  avatarUrl?: string;
  avatarColor?: string;
}

/** Profile owner information for point context */
export interface PointProfileOwner {
  id: string;
  name: string;
  hasPledged?: boolean;
  ear?: number;
  position?: PositionType;
  avatarUrl?: string;
  avatarColor?: string;
}

interface PointCardWithLinksProps {
  point: Point;
  linkedStories?: Story[];
  compact?: boolean;
  isDetailView?: boolean;
  /** When viewing on someone's profile, show their linked Story */
  profileOwner?: PointProfileOwner;
  /** Hide position buttons and action icons */
  hideActions?: boolean;
  /** Disable click-to-navigate behavior */
  disableNavigation?: boolean;
  /** Replace the "Tell your story →" CTA with a custom node (e.g. a status chip in /chat) */
  storyCTAOverride?: React.ReactNode;
  /** P465: Viewer's own story count for this point. When on profile page, passed from profile-page
   * secondary query (accurate for other profiles). Falls back to inline computation if not provided. */
  viewerStoryCount?: number;
  /** Live session mode: shows position buttons + expandable stories, hides share/open */
  liveSessionMode?: boolean;
  /** Callback when position is selected (live session mode) */
  onPositionSelect?: (position: Position) => void;
  /** Pre-selected position (live session mode) */
  selectedPosition?: Position;
  /** Get position counts for the point */
  getPointPositionCounts?: (point: Point) => SevenPointCounts;
  /** Current user ID for position tracking */
  currentUserId?: string;
  /** Get author info for a story */
  getStoryAuthor?: (authorId: string) => StoryAuthor | undefined;
  /** Callback when user clicks on a story */
  onStoryClick?: (storyId: string) => void;

  /** P470: Viewer's story ID for this point on another profile — used to render edit link */
  viewerStoryId?: string;
  /** P491: Tags for tag pill display (prototype Point type lacks tags) */
  tags?: string[];
  /** When true, position buttons are disabled (shown but not clickable). Used in letter reveal steps. */
  disablePositionButtons?: boolean;
  /** P847: Clear viewer's persisted position. Wire onClear once at page level. Do not instantiate a per-row guard. */
  onClear?: () => void;
}

// P822: Module-level helper — inline "+ Add your story" pill used across feed-view
// footer + quote-pattern footer. Hoisted out of the component so all four call sites
// share one definition (DRY) and the function has no implicit closures.
function renderAddStoryPill(
  show: boolean,
  ctaCopy: PositionCTACopy | null,
  pointId: string,
  navigate: (path: string) => void,
) {
  if (!show || !ctaCopy) return null;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigate(`/create?pointId=${pointId}`); }}
      aria-label={ctaCopy.ariaLabel}
      className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors whitespace-nowrap"
    >
      {ctaCopy.ctaText}
    </button>
  );
}

/**
 * PointCardWithLinks - displays a claim about reality (Point)
 * Visual: Gray left border, Clarity logo avatar (platform-owned), position buttons
 * Pattern B: Shows linked Stories expandable section
 */
export function PointCardWithLinks({
  point,
  linkedStories = [],
  compact = false,
  isDetailView = false,
  profileOwner,
  hideActions = false,
  disableNavigation = false,
  liveSessionMode = false,
  storyCTAOverride,
  viewerStoryCount,
  onPositionSelect,
  selectedPosition,
  getPointPositionCounts,
  currentUserId,
  getStoryAuthor,
  onStoryClick,
  viewerStoryId,
  tags,
  disablePositionButtons = false,
  onClear,
}: PointCardWithLinksProps) {
  const { isEmbed, isExpanded, embedNavigate } = useEmbedNavigation();
  const rawText = stripHashtags(point.text, tags);
  const fullText = rawText;
  // Truncate long point text in embeds to keep iframe compact
  const EMBED_TRUNCATE = 750;
  const displayText = isEmbed && fullText.length > EMBED_TRUNCATE
    ? fullText.slice(0, EMBED_TRUNCATE).trimEnd() + '...'
    : fullText;
  const isTextTruncated = isEmbed && fullText.length > EMBED_TRUNCATE;
  const isOwnProfile = !!(currentUserId && profileOwner?.id && currentUserId === profileOwner.id);
  const { isAgentAccountId, isLoading: identityPending } = useAgentAccountIds();
  const isOwnerAgent = isAgentAccountId(profileOwner?.id);
  const [userPosition, setUserPosition] = useState<Position>(
    selectedPosition ?? (currentUserId ? point.positions[currentUserId]?.position ?? null : null)
  );
  // P502: Anonymous position state — visual only, no count adjustment
  const [anonPosition, setAnonPositionState] = useState<PositionType | null>(() => {
    if (!currentUserId) {
      return getAnonPosition(point.id) as PositionType | null;
    }
    return null;
  });
  const [storiesExpanded, setStoriesExpanded] = useState(isExpanded);

  const handleStoriesToggle = () => {
    setStoriesExpanded(!storiesExpanded);
  };

  // P154: Sync userPosition state when position prop changes (after refetch)
  useEffect(() => {
    if (selectedPosition !== undefined) {
      setUserPosition(selectedPosition);
    } else if (currentUserId) {
      const propPosition = point.positions[currentUserId]?.position ?? null;
      setUserPosition(propPosition);
    }
  }, [point.positions, currentUserId, selectedPosition]);

  // Get base counts or use defaults
  const baseCounts = useMemo(
    () => getPointPositionCounts?.(point) ?? {
      strongly_agree: 0,
      agree: 0,
      somewhat_agree: 0,
      unsure: 0,
      somewhat_disagree: 0,
      disagree: 0,
      strongly_disagree: 0,
    },
    [getPointPositionCounts, point]
  );

  // In live session mode, show all linked stories (not filtered by owner)
  const allLinkedStories = linkedStories;

  // Track initial position
  const initialPosition = currentUserId
    ? point.positions[currentUserId]?.position || null
    : null;

  // Compute adjusted counts based on user's current position vs initial
  const counts = useMemo(
    () => adjustPositionCounts(baseCounts, initialPosition as PositionType | null, userPosition as PositionType | null),
    [baseCounts, initialPosition, userPosition],
  );

  // On profile pages, linkedStories are pre-filtered to the profile owner's stories
  // (filtered at data layer in profile-page-v2.tsx). In live session mode, all stories are passed.
  const filteredStories = linkedStories;
  const storiesToShow = filteredStories.slice(0, 3);

  const handleCardClick = () => {
    if (!isDetailView && !disableNavigation) {
      embedNavigate(`/point/${point.id}`);
    }
  };

  const handlePositionClick = (position: Position) => {
    // P502: Anonymous user → optimistic local position, no redirect
    if (!currentUserId) {
      const currentAnon = anonPosition;
      const newPos = (currentAnon === position ? null : position) as PositionType | null;
      setAnonPositionState(newPos);
      setAnonPositionStorage(point.id, newPos);
      return;
    }

    // Toggle: clicking same position removes it
    const newPosition = userPosition === position ? null : position;
    // Only optimistically update for selection; removal waits for dialog confirm
    if (newPosition !== null) {
      setUserPosition(newPosition);
    }
    onPositionSelect?.(newPosition);
  };

  const isPrivate = point.visibility === 'private';
  const borderColor = isPrivate ? 'border-l-amber-400' : 'border-l-slate-400';
  const bgTint = isPrivate ? 'bg-amber-50/50' : 'bg-white';

  const cardClassName = isDetailView
    ? `relative ${bgTint} rounded-lg shadow-sm border-l-4 ${borderColor} border border-border overflow-hidden`
    : `relative group ${bgTint} rounded-lg shadow-sm border-l-4 ${borderColor} border border-border overflow-hidden cursor-pointer hover:border-slate-300 hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2`;

  // Quote pattern: reserved for the other person's position. Hidden when viewer === profile owner
  // (the viewer's own stance is already expressed by the highlighted position button inside the point).
  const showQuotePattern =
    profileOwner && profileOwner.position && !isOwnProfile;

  // P822: viewer-story gate for inline "+ Add your story" pill in feed-view footer
  // (replaces the standalone CTA row that lived below the count row)
  const effectiveViewerStoryCount =
    viewerStoryCount ?? filteredStories.filter(s => s.authorId === currentUserId).length;
  const positionGroup = userPosition ? getPositionGroup(userPosition as PositionType) : null;
  const ctaCopy = positionGroup ? getPositionCTACopy(positionGroup) : null;
  const showInlineAddStoryPill =
    !!userPosition &&
    !isEmbed &&
    !liveSessionMode &&
    !hideActions &&
    isOwnProfile &&
    effectiveViewerStoryCount === 0 &&
    !!ctaCopy;

  return (
    <>
    <div
      role={!isDetailView && !disableNavigation ? 'button' : undefined}
      tabIndex={!isDetailView && !disableNavigation ? 0 : undefined}
      className={`${cardClassName}${isOwnerAgent ? ' agent-card-drained' : ''}`}
      {...(isOwnerAgent ? { 'data-agent-row': 'true' } : {})}
      onClick={!isDetailView && !disableNavigation ? handleCardClick : undefined}
      onKeyDown={!isDetailView && !disableNavigation ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      } : undefined}
    >
      {/* Main content */}
      <div className="p-4">
        {showQuotePattern && profileOwner && profileOwner.position ? (
          // Quote pattern: "{Name} {verb}:" outside, Point content in quoted box
          <>
            {/* Position label OUTSIDE the quoted box - Avatar + Name + Badge grouped */}
            <div className={`flex items-center gap-1.5 mb-2 text-sm text-gray-700${isOwnerAgent ? ' agent-card-drained' : ''}`} {...(isOwnerAgent ? { 'data-agent-row': 'true' } : {})}>
              <GravatarAvatar
                name={profileOwner.name}
                photoUrl={profileOwner.avatarUrl}
                avatarColor={profileOwner.avatarColor}
                size="sm"
                isPledger={profileOwner.hasPledged ?? false}
                isAgent={isOwnerAgent}
                identityPending={identityPending}
                className="!w-5 !h-5 !text-[10px]"
              />
              <span className={"inline-flex items-center gap-1.5"}>
              {/* P1141 amendment: an agent account is named the same way on every surface;
                  the raw stored `Agent · {Name}` used to leak through here. */}
              {isOwnerAgent ? (
                <AgentByline name={profileOwner.name} />
              ) : (
                <span className="font-medium">{profileOwner.name}</span>
              )}
              {!isOwnerAgent && !identityPending && <EarBadge count={profileOwner.ear ?? 0} name={profileOwner.name} size={14} />}
              <PositionBadge position={profileOwner.position} />
              </span>
            </div>

            {/* Quoted Point box */}
            <div className="bg-gray-50 border border-border rounded-lg p-3">
              {/* Two-column layout matching StoryCard structure */}
              <div className="flex items-start gap-3">
                {/* Pin icon column - matches StoryCard avatar width */}
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600">
                  <Pin className="w-4 h-4 rotate-45" />
                </div>

                {/* Content column */}
                <div className="flex-1 min-w-0">
                  {/* Point text with inline visibility icon */}
                  <p className={`text-gray-900 break-words ${compact ? 'text-sm' : 'text-base'}`}>
                    <InlineVisibilityIcon visibility={point.visibility} />{' '}
                    {linkifyText(displayText)}
                    {isTextTruncated && (
                      <button
                        onClick={(e) => { e.stopPropagation(); embedNavigate(`/point/${point.id}`); }}
                        className="ml-1 text-blue-600 hover:text-blue-700 text-sm"
                      >
                        show more
                      </button>
                    )}
                  </p>

                  {/* P491: Tag pills — after text, before position buttons */}
                  {tags && tags.length > 0 && (
                    <TagPills tags={tags} context="detail" className="mt-2" />
                  )}

                  {/* Position buttons */}
                  {!hideActions && (
                    <div role="presentation" className="mt-3" onClick={(e) => e.stopPropagation()}>
                      <PositionButtons
                        userPosition={currentUserId ? userPosition : anonPosition}
                        counts={counts}
                        onPositionClick={handlePositionClick}
                        narrow
                        disabled={disablePositionButtons}
                        onClear={onClear}
                      />
                      {/* P502: Anonymous position CTA */}
                      {!currentUserId && anonPosition && (
                        <AnonPositionCTA pointId={point.id} position={anonPosition} isEmbed={isEmbed} />
                      )}
                    </div>
                  )}
                </div>
              </div>


              {/* Footer - inside quoted box, pl-[44px] aligns with content column (32px icon + 12px gap) */}
              <div
                role="presentation"
                className="flex items-center justify-between mt-3 pt-3 border-t border-border pl-4 sm:pl-[44px]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Collapsible trigger (if has linked stories) or 0-stories CTA */}
                {(() => {
                  if (isDetailView) return <span />;
                  const storyLabel = `${filteredStories.length} ${filteredStories.length === 1 ? 'story' : 'stories'}`;

                  if (filteredStories.length > 0) {
                    // Expand chevron button always rendered when stories exist
                    return (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={handleStoriesToggle}
                          className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
                          aria-expanded={storiesExpanded}
                          aria-label={`${storiesExpanded ? 'Collapse' : 'Expand'} linked stories`}
                        >
                          {storiesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <span>{storyLabel}</span>
                        </button>
                        {/* Case E: viewer has a story on another profile's point */}
                        {!isEmbed && !liveSessionMode && !isOwnProfile && viewerStoryId && (
                          <button
                            onClick={(e) => { e.stopPropagation(); embedNavigate(`/story/${viewerStoryId}?edit=true`); }}
                            className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
                            aria-label="Edit your story"
                          >
                            · ✏ your story
                          </button>
                        )}
                        {/* P822: inline pill (own profile, no viewer story) */}
                        {renderAddStoryPill(showInlineAddStoryPill, ctaCopy, point.id, embedNavigate)}
                      </div>
                    );
                  }

                  if (showInlineAddStoryPill) {
                    // Case B/F: 0 stories, viewer has position — show 0-stories label + Add CTA
                    return (
                      <div className="flex items-center gap-2">
                        <ChevronRight size={14} className="text-gray-400" />
                        <span className="text-sm text-gray-600">{storyLabel}</span>
                        {renderAddStoryPill(showInlineAddStoryPill, ctaCopy, point.id, embedNavigate)}
                      </div>
                    );
                  }

                  if (profileOwner && filteredStories.length > 0) {
                    // Case G / no-position view: show story count without CTA
                    return (
                      <div className="flex items-center gap-2">
                        <ChevronRight size={14} className="text-gray-400" />
                        <span className="text-sm text-gray-600">{storyLabel}</span>
                      </div>
                    );
                  }

                  // Embed: always show story count as a link (even 0) — opens full point page
                  if (isEmbed) {
                    return (
                      <button
                        onClick={() => embedNavigate(`/point/${point.id}`)}
                        className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
                      >
                        <ChevronRight size={14} />
                        <span>{storyLabel}</span>
                      </button>
                    );
                  }

                  return <span />;
                })()}

                {/* Action icons - hidden in live session mode; embed: open button only (no share) */}
                {!hideActions && !liveSessionMode && (
                  <div className="flex items-center gap-1">
                    {!isEmbed && (
                      <ShareButton
                        type="point"
                        id={point.id}
                        description={point.text.slice(0, 100)}
                        fromUserId={profileOwner?.id}
                      />
                    )}
                    {(isEmbed || (!isDetailView && !disableNavigation)) && (
                      <MobileTooltip content="Open point">
                        <button
                          onClick={() => embedNavigate(`/point/${point.id}`)}
                          className="min-w-11 min-h-11 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                          aria-label="Open point"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </MobileTooltip>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          // Feed view: original layout with pin icon column
          <div className="flex gap-3">
            {/* Pin icon - same width as StoryCard avatar, blue to distinguish from Stories */}
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600">
              <Pin size={20} />
            </div>

            {/* Content column - aligned with StoryCard */}
            <div className="flex-1 min-w-0">
              {/* Header row - matches StoryCard's author info structure */}
              <div className="mb-2">
                <PointHeader
                  authorPosition={profileOwner?.position}
                  authorName={profileOwner?.name}
                  authorEarCount={profileOwner?.ear}
                />
              </div>

              {/* Point text with inline visibility icon */}
              <p className={`text-gray-900 break-words ${compact ? 'text-sm' : 'text-base'}`}>
                <InlineVisibilityIcon visibility={point.visibility} />{' '}
                {linkifyText(displayText)}
                {isTextTruncated && (
                  <button
                    onClick={(e) => { e.stopPropagation(); embedNavigate(`/point/${point.id}`); }}
                    className="ml-1 text-blue-600 hover:text-blue-700 text-sm"
                  >
                    show more
                  </button>
                )}
              </p>

              {/* P491: Tag pills — after text, before position buttons */}
              {tags && tags.length > 0 && (
                <TagPills tags={tags} context="detail" className="mt-2" />
              )}

              {/* Position buttons */}
              {!hideActions && (
                <div role="presentation" className="mt-3" onClick={(e) => e.stopPropagation()}>
                  <PositionButtons
                    userPosition={currentUserId ? userPosition : anonPosition}
                    counts={counts}
                    onPositionClick={handlePositionClick}
                    narrow
                    disabled={disablePositionButtons}
                    onClear={onClear}
                  />
                  {/* P502: Anonymous position CTA */}
                  {!currentUserId && anonPosition && (
                    <AnonPositionCTA pointId={point.id} position={anonPosition} isEmbed={isEmbed} />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer row - only for feed view (non-quote pattern) or live session mode */}
      {(!showQuotePattern || liveSessionMode) && (
        <>
        <div
          role="presentation"
          className="flex items-center justify-between pl-4 sm:pl-[68px] pr-4 py-3 border-t border-gray-100"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Collapsible trigger - show in live session mode with all stories, or on profile/feed with any linked stories */}
          {!isDetailView ? (() => {
            if (liveSessionMode) {
              if (allLinkedStories.length === 0) return <span />;
              return (
                <button
                  onClick={handleStoriesToggle}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
                  aria-expanded={storiesExpanded}
                  aria-label={`${storiesExpanded ? 'Collapse' : 'Expand'} linked stories`}
                >
                  {storiesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>{allLinkedStories.length} {allLinkedStories.length === 1 ? 'story' : 'stories'}</span>
                </button>
              );
            }
            const storyLabel = `${filteredStories.length} ${filteredStories.length === 1 ? 'story' : 'stories'}`;

            if (filteredStories.length > 0) {
              return (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleStoriesToggle}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
                    aria-expanded={storiesExpanded}
                    aria-label={`${storiesExpanded ? 'Collapse' : 'Expand'} linked stories`}
                  >
                    {storiesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span>{storyLabel}</span>
                  </button>
                  {/* Case E: viewer has a story on another profile's point */}
                  {!isEmbed && !isOwnProfile && viewerStoryId && (
                    <button
                      onClick={(e) => { e.stopPropagation(); embedNavigate(`/story/${viewerStoryId}?edit=true`); }}
                      className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
                      aria-label="Edit your story"
                    >
                      · ✏ your story
                    </button>
                  )}
                  {/* P822: inline + Add your story pill for own profile with no story */}
                  {renderAddStoryPill(showInlineAddStoryPill, ctaCopy, point.id, embedNavigate)}
                </div>
              );
            }

            // Embed: always show story count as a link (even 0) — opens full point page
            if (isEmbed) {
              const storyLabel = `${filteredStories.length} ${filteredStories.length === 1 ? 'story' : 'stories'} linked`;
              return (
                <button
                  onClick={() => embedNavigate(`/point/${point.id}`)}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
                >
                  <ChevronRight size={14} />
                  <span>{storyLabel}</span>
                </button>
              );
            }

            // P822: 0 stories + inline pill (own profile, viewer has position, no story)
            if (showInlineAddStoryPill) {
              return (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-600">0 stories</span>
                  {renderAddStoryPill(showInlineAddStoryPill, ctaCopy, point.id, embedNavigate)}
                </div>
              );
            }

            return <span />; /* Empty span for flexbox spacing */
          })() : (
            <span /> /* Empty span for flexbox spacing */
          )}

          {/* Action icons - hidden in live session mode; embed: open button only (no share) */}
          {!hideActions && !liveSessionMode && (
            <div className="flex items-center gap-1">
              {!isEmbed && (
                <ShareButton type="point" id={point.id} description={point.text.slice(0, 100)} fromUserId={profileOwner?.id} />
              )}
              {/* External link - only in feed (redundant in detail view) */}
              {!isDetailView && !disableNavigation && (
                <MobileTooltip content="Open point">
                  <button
                    onClick={() => embedNavigate(`/point/${point.id}`)}
                    className="min-w-11 min-h-11 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    aria-label="Open point"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </MobileTooltip>
              )}
            </div>
          )}
        </div>
        </>
      )}

      {/* Expanded linked stories - in feed view or live session mode */}
      {!isDetailView &&
        storiesExpanded &&
        (liveSessionMode || profileOwner) &&
        (liveSessionMode ? allLinkedStories : storiesToShow).length > 0 && (
          <div
            className={
              showQuotePattern ? 'pl-4 sm:pl-[60px] pr-4 pb-4' : 'pl-4 sm:pl-[68px] pr-4 pb-4'
            }
          >
            {(() => {
              const stories = liveSessionMode ? allLinkedStories.slice(0, 3) : storiesToShow;
              const totalStories = liveSessionMode ? allLinkedStories.length : filteredStories.length;

              // All stories get ThreadLine — even single items need the
              // connecting line to visually anchor them to the parent card
              return (
                <ThreadLineGroup>
                  {stories.map((story, index) => (
                    <ThreadLineItem
                      key={story.id}
                      isLast={index === stories.length - 1 && totalStories <= 3}
                    >
                      <QuotedStory
                        story={story}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onStoryClick) {
                            onStoryClick(story.id);
                          } else if (!liveSessionMode) {
                            embedNavigate(`/story/${story.id}`);
                          }
                        }}
                        onAuthorClick={(e) => {
                          e.stopPropagation();
                          if (!liveSessionMode) embedNavigate(`/p/${story.authorId}`);
                        }}
                        getStoryAuthor={getStoryAuthor}
                      />
                    </ThreadLineItem>
                  ))}
                  {totalStories > 3 && (
                    <ThreadLineItem isLast>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!liveSessionMode) embedNavigate(`/point/${point.id}`);
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        +{totalStories - 3} more stories
                      </button>
                    </ThreadLineItem>
                  )}
                </ThreadLineGroup>
              );
            })()}
          </div>
        )}
    </div>
    {/* storyCTAOverride: custom node for the story CTA slot when a position is taken.
        (P803, 2026-09-02: the only caller, StoryGuideChat, was removed as dead code —
        no current caller passes this prop; flagged as follow-up collateral, not deleted here.) */}
    {storyCTAOverride !== undefined && !liveSessionMode && storyCTAOverride}
    </>
  );
}

/**
 * Twitter-style quoted Story card - shows a linked story within a Point.
 */
export function QuotedStory({
  story,
  onClick,
  onAuthorClick,
  getStoryAuthor,
  authorPosition,
}: {
  story: Story;
  onClick: (e: React.MouseEvent) => void;
  /** Callback when author name/avatar is clicked */
  onAuthorClick?: (e: React.MouseEvent) => void;
  /** Get author info for the story */
  getStoryAuthor?: (authorId: string) => StoryAuthor | undefined;
  /**
   * P1259 change 4 — where THIS story's author stands on the point this card sits under.
   *
   * "a point with two opposed stories under it gives the reader no indication that the two
   * authors disagree" (spec, Problem). The chip renders beside the byline, below the point
   * rather than above it — founder, on the screenshot: "like we do in profile but below..
   * (profile stay same).. talking about feed only."
   *
   * Undefined or null renders NO chip. Never an empty or "unknown" one: a story whose
   * author holds no position on the point is a real state, and there is no completeness
   * constraint requiring a filed story to carry a position (spec, UX Notes).
   */
  authorPosition?: PositionType | null;
}) {
  const author = getStoryAuthor?.(story.authorId);
  const { isAgentAccountId, isLoading: identityPending } = useAgentAccountIds();
  const isAgent = isAgentAccountId(story.authorId);
  const [textExpanded, setTextExpanded] = useState(false);
  useEffect(() => { setTextExpanded(false); }, [story.id]);

  /* P1259 change 1 — this card is the "point card" surface: it is what the feed point card
     and the profile point card render for each linked story. Its timecodes used to be
     open-in-a-new-tab links; they now seek a player mounted here. */
  const player = useLazyStoryPlayer(!!story.videoUrl);

  /* P1259 change 4 — a missing stance is LOGGED, not swallowed, but not from here.
     `getStoriesForPoints` reports the (point, author) pairs it found no row for: once per
     fetch, where the gap is actually discovered, rather than once per render of every card
     on the page. See the note beside `authorPositionOnPoint` in stories-service-real.ts. */

  return (
    /* P1270 §5 — THE BYLINE SITS ABOVE THE BOX, matching `QuotedPointCard`.
       Founder, on the feed screenshot: "dont you think this should be outside for
       consistency purpsose? like why we reinvient the wheel?"

       These two components are the same idea in opposite directions — a point expanded to
       its stories, and a story expanded to its points — and they had drifted on every axis.
       `QuotedPointCard` renders `<div class="w-full text-left">` with the attribution row
       first and the bordered box second; this one nested the attribution INSIDE the box.
       Same shape now, so the remaining difference is props rather than structure, which is
       what unblocks merging them later (deferred in the spec's risk table). */
    <div className="w-full text-left" data-testid="quoted-story">
      {/* Author info ABOVE the box.

          P1270 §6 — THE GATE IS `author || isAgent`, NOT `author`, AND THAT IS THE FIX.
          `getStoryAuthor` resolves against POSITION HOLDERS on the embed surface
          (`point-detail-page.tsx`), and returns undefined whenever a story's author holds no
          position on the point they filed it under. Nothing tied those two sets together, so
          this whole block disappeared — avatar, AGENT chip, name and stance at once — and
          `/point/:id?embed=true` shipped a machine-written reading of a real named person
          with NO indication a machine wrote it and no route to the disclosure.

          Gating on `isAgent` derives from `story.authorId` and needs no lookup, so the marker
          can no longer be lost to a failed join. A marker with no name is strictly better
          than no marker; the name is additive when the lookup succeeds (spec, ACCEPT). */}
      {(author || isAgent) && (
        /* `flex-wrap` — P1270 §5, found by measuring at 320px, not by reading the code.
           The stance badge is `shrink-0`, so on a nested card (measured 179px wide at a 320px
           viewport) it took the width the NAME needed and the name truncated to "Connor L…".
           Confirmed by isolation rather than inference: hiding the badge in the live DOM took
           the name's available width from 78px back to the 95px it needs, un-truncating it.
           Pre-existing since P1259 put the badge here; §5 made it visible by putting this row
           under scrutiny, and made it slightly better by moving the row out of the box's
           padding.

           Wrapping is the documented preference, not a guess. `agent-byline.tsx` reached the
           same conclusion for the same reason one level down: "Two blind reviewers
           independently called that the worst thing on the page — WHOSE reading this is, is
           the one fact the byline exists to carry, and it was the only element being
           sacrificed." A card naming a real person who never consented is the last place to
           truncate that person's name to fit a badge. The badge drops to its own line
           instead; nothing is lost, and `truncate` stays the backstop for a name too long
           even for a full line. */
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
          {/* AVATAR + BYLINE ARE ONE UNSPLITTABLE GROUP. The first attempt let the ROW wrap
              with the avatar as its own flex item, which fixed the truncation and produced a
              worse result: the avatar was orphaned alone on line 1 with the name on line 3 —
              the "orphan sibling" the visual-QA checklist names. Only the BADGE may wrap. */}
          <span className="flex items-center gap-2 min-w-0">
          {/* P1270 §6 — THE AVATAR WRAPPER IS ONLY A CONTROL WHEN THERE IS SOMEWHERE TO GO.
              Same rule already applied to the name below, and the same rule `agent-byline.tsx`
              note 2 states: rendering a focusable `role="button"` whose handler resolves to
              nothing invites a click that answers no question and adds a phantom stop to
              keyboard tab order — on a row that has no accessible name to announce, because
              the name is precisely what failed to resolve. Found by adversarial review of the
              diff; the first version of this section kept the wrapper unconditionally. */}
          {author ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onAuthorClick?.(e);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onAuthorClick?.(e as unknown as React.MouseEvent);
              }
            }}
            className="hover:opacity-80 transition-opacity cursor-pointer"
          >
            {/* P1270 §6 — every field is optional-chained because `author` is now allowed
                to be undefined on the embed branch. `stripAgentPrefix` is applied by
                GravatarAvatar itself for an agent, and the empty-string fallback renders the
                initials placeholder rather than crashing — the SHAPE (square) is the channel
                that matters here and it comes from `isAgent`, not from the name. */}
            <GravatarAvatar
              name={author?.name ?? ''}
              photoUrl={author?.avatarUrl}
              avatarColor={author?.avatarColor}
              size="sm"
              isPledger={author?.hasPledged ?? false}
              isAgent={isAgent}
              identityPending={identityPending}
              className="!w-6 !h-6 !text-[11px]"
            />
          </span>
          ) : (
            /* No author resolved: the avatar still carries the SQUARE channel, but as inert
               presentation rather than a control that goes nowhere. */
            <GravatarAvatar
              name=""
              size="sm"
              isPledger={false}
              isAgent={isAgent}
              identityPending={identityPending}
              className="!w-6 !h-6 !text-[11px]"
            />
          )}
          {/* P1259 change 2 — THE AGENT BRANCH NO LONGER WRAPS THE BYLINE IN THIS SPAN.
              Two reasons, and the second is new to this spec.

              1. `agent-byline.tsx` note 1: wrapping the whole component in the
                 profile-navigation control makes the AGENT chip clickable, and a status
                 marker that navigates invites a click answering no question. The component
                 owns its own button, around the NAME alone, and call sites pass
                 `onNameClick`. This call site was still wrapping.

              2. P1259 removes the two-sentence footer from every story surface and makes
                 the byline name the ONLY route to the disclosure. So "the name is
                 clickable" stopped being a nicety and became an acceptance criterion, per
                 surface, verified rather than assumed — which meant looking at how each
                 surface actually renders it, and this one rendered a span inside a span.

              The human branch keeps the wrapper: there is no chip to protect, and its
              keyboard handling predates this change. */}
          {/* P1270 §5 — BYLINE AND STANCE ARE ONE GROUP, matching `QuotedPointCard` and the
              nine other byline sites, which all wrap `AgentByline` + the badge in a single
              span. This site was the only one that left the badge as a bare sibling of the
              row.

              HONEST NOTE ON WHY THIS WAS ADDED. It came out of a 375px measurement that was
              WRONG: badge-left minus name-right read 44-47px here against 6px in
              QuotedPointCard, which looked like the two nesting directions disagreeing. They
              do not. `AgentByline` sets `flex-wrap`, so at 375px it wraps to `[AGENT] on` /
              `Connor Leahy` and the name's right edge sits ~41px inside the byline BOX's
              right edge. The measurement was reading across a line break — comparing a
              wrapping component with a non-wrapping one. Measured against the byline box, both
              were already ~6-8px.

              KEPT ANYWAY, on its own merit rather than the bad measurement: grouping makes
              this row structurally identical to the nine sites and to QuotedPointCard, which
              is precisely what §5 is for, and it removes a real difference in how a squeeze
              is absorbed — as a bare sibling the badge could be separated from the name it
              captions; as one group it cannot. */}
          {isAgent ? (
            <AgentByline
              name={author?.name ?? ''}
              /* P1270 §6 — the handler is passed ONLY when there is an author to navigate
                 to. `agent-byline.tsx` note 2: "no handler means no button", precisely so a
                 dead control is never rendered. On the embed branch the disclosure route is
                 genuinely absent, and rendering a button that goes nowhere would be a worse
                 answer than rendering none — the marker still discloses, which is the floor
                 this section exists to restore. */
              onNameClick={author ? (e) => {
                e.stopPropagation();
                onAuthorClick?.(e);
              } : undefined}
            />
          ) : (
            /* Author name - clickable */
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onAuthorClick?.(e);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onAuthorClick?.(e as unknown as React.MouseEvent);
                }
              }}
              className="text-xs font-medium text-gray-700 hover:underline cursor-pointer"
            >
              {author?.name}
            </span>
          )}
          {/* Ear indicator - understanding credibility */}
          {!isAgent && !identityPending && author && <EarBadge count={author.ear ?? 0} name={author.name} />}
          {/* P1259 change 4 — this author's stance on the point above.

              P1270 §3 REVERSED THE DRAIN THAT USED TO BE HERE, and the comment it replaces
              called that drain "an invariant, not a style choice". It rested on two claims,
              both checked by command and both false:

                1. "a coloured stance badge is the discriminator that marks a card as
                   human-authored." `PositionBadge.tsx` renders ONE hardcoded blue for every
                   human — identical for a founding pledger with 40 ear-verifications and an
                   account made this morning. Colour never encoded standing, so draining it
                   removed no claim an agent was falsely making.
                2. "the avatar is exempt, so the card keeps a colour channel." True of the
                   test fixture, which seeds a saturated initials block. Production agent
                   avatars are black-and-white portraits measuring 0.00 saturation — recorded
                   in `e2e/p1104-agent-marker.spec.ts` itself.

              So the drain cost the reader the one marker carrying CONTENT — whether the
              machine read the subject as agreeing or disagreeing — and bought no disclosure
              the square black-and-white photo and the word AGENT were not already carrying.
              Those two are the channels now, and §6 shipped in the same change because one
              render branch was carrying neither. */}
          </span>
          {authorPosition && (
            <span data-testid="story-author-stance" className="inline-flex shrink-0">
              <PositionBadge position={authorPosition} />
            </span>
          )}
        </div>
      )}
      {/* THE BOX — content only, from here down. The click target, the border, the hover
          state and the focus ring all live on this element rather than on the outer
          container, so the attribution row above is not part of the control: clicking a
          name navigates to the profile, clicking the box navigates to the story, and the
          two no longer overlap. `QuotedPointCard` has always been shaped this way. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
          }
        }}
        className={`group/quote w-full text-left p-3 rounded-lg border border-border bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2${isAgent ? ' agent-card-drained' : ''}`}
        {...(isAgent ? { 'data-agent-row': 'true' } : {})}
      >
      {/* Story media — compact in quoted context.
          P1212 §4, second pass: this surface rendered `StoryImage` alone, so a story whose
          only media is a VIDEO rendered with no media at all. That was survivable while
          this card lived only under a profile point; §5 put it on the feed, and §1 removed
          the quote bodies from `content` — so the reader got the argument, no video, and
          no evidence. `StoryMedia` is the same component the other five surfaces use. */}
      {story.videoUrl ? (
        /* P1259 change 1 — lazy-mounted live player; the wrapper is the intersection
           target and the scroll anchor. stopPropagation because this whole card is a
           button that navigates to the story. */
        <div ref={player.containerRef} role="presentation" onClick={(e) => e.stopPropagation()}>
          <StoryMedia
            ref={player.playerRef}
            videoUrl={story.videoUrl}
            durationSeconds={normalizeVideoQuotes(story.videoQuotes).durationSeconds}
            mode={player.mode}
            onBlockedChange={player.onBlockedChange}
            storyHref={`/story/${story.id}`}
            className="mb-2"
            imageProps={story.imageUrl ? {
              src: story.imageUrl,
              authorName: stripAgentPrefix(author?.name) || 'Author',
              className: 'mb-2',
            } : undefined}
          />
        </div>
      ) : story.imageUrl ? (
        <div className="mb-2">
          <StoryImage
            src={story.imageUrl}
            authorName={stripAgentPrefix(author?.name) || 'Author'}
          />
        </div>
      ) : null}
      {/* Story text — strip hashtags (rendered as TagPills) and the quote label.
          P1212 §5: this component was the EIGHTH surface, and the parity census missed it
          because the census lists files and this one is module-private to a POINT card.
          It called `stripHashtags` alone, so the profile point card's story expander
          printed `Supporting quotes from {Name}` with no quote block under it — the exact
          §1 defect, on a surface §5 was about to widen to the feed. */}
      {(() => {
        // The prototype `Story` shape carries no `tags` field, so this is `undefined`
        // for every caller that converts from production — exactly what the previous
        // `stripHashtags(story.text, story.tags ?? [])` resolved to at runtime. Read
        // through a widening cast rather than changing the shape: callers that DO
        // spread a production object still get their hashtags stripped.
        const cleanText = storyTextForDisplay(story.text, (story as { tags?: string[] }).tags);
        /* P1259 change 5 — 3x the old 200. Founder: "i think we can allow in all app more
           chars before we cut of maybe 3x more?" Filed agent story bodies run 545-858
           characters, so 200 cut every one of them before the argument arrived. */
        return !textExpanded && cleanText.length > 600 ? (
          <p className="text-sm text-gray-800 break-words">
            {linkifyText(cleanText.slice(0, 600))}
            <span
              data-testid="more-link"
              role="button"
              tabIndex={0}
              className="text-blue-600 font-medium cursor-pointer"
              onClick={(e) => { e.stopPropagation(); setTextExpanded(true); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setTextExpanded(true); } }}
            > ...more</span>
          </p>
        ) : (
          <p className="text-sm text-gray-800 break-words">{linkifyText(cleanText)}</p>
        );
      })()}
      {/* P1212 §4, on the eighth surface. The text above has had the quote LABEL stripped
          by §1, so without this block the reader gets the claim and none of the evidence —
          and this card is the one §5 newly put on the feed. Same component and same
          no-onSeek contract as the other five surfaces: no player here, so each timecode
          becomes a link that opens the source at that second.
          The wrapper stops click propagation because this whole card is itself a button. */}
      {normalizeVideoQuotes(story.videoQuotes).quotes.length > 0 && story.videoUrl && (
        <div role="presentation" onClick={(e) => e.stopPropagation()}>
          <StoryVideoQuotes
            videoUrl={story.videoUrl}
            quotes={normalizeVideoQuotes(story.videoQuotes).quotes}
            subjectName={stripAgentPrefix(author?.name) || 'Author'}
            onSeek={player.onSeek}
            playerBlocked={player.playerBlocked}
          />
        </div>
      )}
      {(story.tags ?? []).length > 0 && (
        <TagPills tags={story.tags ?? []} context="detail" className="mt-1.5" />
      )}
      </div>
    </div>
  );
}
