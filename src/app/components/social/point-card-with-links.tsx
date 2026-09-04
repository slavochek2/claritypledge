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
    ? `relative ${bgTint} rounded-lg shadow-sm border-l-4 ${borderColor} border border-gray-200 overflow-hidden`
    : `relative group ${bgTint} rounded-lg shadow-sm border-l-4 ${borderColor} border border-gray-200 overflow-hidden cursor-pointer hover:border-slate-300 hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2`;

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
              <span className={`inline-flex items-center gap-1.5${isOwnerAgent ? ' agent-drained-chrome' : ''}`}>
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
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              {/* Two-column layout matching StoryCard structure */}
              <div className="flex items-start gap-3">
                {/* Pin icon column - matches StoryCard avatar width */}
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600">
                  <Pin size={16} className="rotate-45" />
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
                className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 pl-4 sm:pl-[44px]"
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
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                          aria-label="Open point"
                        >
                          <ExternalLink size={16} />
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
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    aria-label="Open point"
                  >
                    <ExternalLink size={16} />
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
}: {
  story: Story;
  onClick: (e: React.MouseEvent) => void;
  /** Callback when author name/avatar is clicked */
  onAuthorClick?: (e: React.MouseEvent) => void;
  /** Get author info for the story */
  getStoryAuthor?: (authorId: string) => StoryAuthor | undefined;
}) {
  const author = getStoryAuthor?.(story.authorId);
  const { isAgentAccountId, isLoading: identityPending } = useAgentAccountIds();
  const isAgent = isAgentAccountId(story.authorId);
  const [textExpanded, setTextExpanded] = useState(false);
  useEffect(() => { setTextExpanded(false); }, [story.id]);

  return (
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
      className={`group/quote w-full text-left p-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2${isAgent ? ' agent-card-drained' : ''}`}
      {...(isAgent ? { 'data-agent-row': 'true' } : {})}
    >
      {/* Author info at top */}
      {author && (
        <div className="flex items-center gap-2 mb-1.5">
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
            <GravatarAvatar
              name={author.name}
              photoUrl={author.avatarUrl}
              avatarColor={author.avatarColor}
              size="sm"
              isPledger={author.hasPledged ?? false}
              isAgent={isAgent}
              identityPending={identityPending}
              className="!w-6 !h-6 !text-[11px]"
            />
          </span>
          {/* Author name - clickable */}
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
            {/* P1212 §5 — the §4d defect, in the component §4d did not reach.
                `author.name` is the STORED profile name, which on an agent account carries
                the reserved `Agent · ` prefix the database enforces and `stripAgentPrefix`
                exists to keep off screen. Verified leaking 4× on the feed before this fix.

                The spec's own risk table states the hazard for the sibling case: "§5 makes
                this card MORE reachable, so §5 must not ship before §4d." §5 puts THIS
                component on the feed, so the same sentence binds here. AgentByline is the
                one place an agent account is named, and it carries the machine chip with
                it — the same composition §4d used for LinkedStoryCard. */}
            {isAgent ? <AgentByline name={author.name} /> : author.name}
          </span>
          {/* Ear indicator - understanding credibility */}
          {!isAgent && !identityPending && <EarBadge count={author.ear ?? 0} name={author.name} />}
        </div>
      )}
      {/* Story media — compact in quoted context.
          P1212 §4, second pass: this surface rendered `StoryImage` alone, so a story whose
          only media is a VIDEO rendered with no media at all. That was survivable while
          this card lived only under a profile point; §5 put it on the feed, and §1 removed
          the quote bodies from `content` — so the reader got the argument, no video, and
          no evidence. `StoryMedia` is the same component the other five surfaces use. */}
      {story.videoUrl ? (
        <StoryMedia
          videoUrl={story.videoUrl}
          durationSeconds={normalizeVideoQuotes(story.videoQuotes).durationSeconds}
          mode="thumbnail"
          storyHref={`/story/${story.id}`}
          className="mb-2"
          imageProps={story.imageUrl ? {
            src: story.imageUrl,
            authorName: stripAgentPrefix(author?.name) || 'Author',
            className: 'mb-2',
          } : undefined}
        />
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
        return !textExpanded && cleanText.length > 200 ? (
          <p className="text-sm text-gray-800 break-words">
            {linkifyText(cleanText.slice(0, 200))}
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
          />
        </div>
      )}
      {(story.tags ?? []).length > 0 && (
        <TagPills tags={story.tags ?? []} context="detail" className="mt-1.5" />
      )}
    </div>
  );
}
