/**
 * @file point-card-with-links.tsx
 * @description Production PointCard component with linked Stories support
 * Refactored from prototype to accept explicit props instead of using mock data
 */

import { useState, useMemo, useEffect } from 'react';
import { getAnonPosition, setAnonPosition as setAnonPositionStorage } from '@/app/hooks/useAnonPosition';
import { useEmbedNavigation } from '@/app/hooks/useEmbedNavigation';
import { AnonPositionCTA } from '@/app/components/shared/anon-position-cta';
import { Pin, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { EarBadge } from '@/components/ui/ear-badge';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import {
  PointHeader,
  PositionButtons,
  PositionBadge,
  ShareButton,
  ThreadLineGroup,
  ThreadLineItem,
  type SevenPointCounts,
} from '@/app/components/shared';
import { LinkedText } from '@/app/components/shared/linked-text';
import type { PositionType } from '@/app/types';
import { getPositionGroup, getPositionCTACopy, adjustPositionCounts } from '@/app/utils/position-helpers';
import type { Point, Position, Story } from '@/app/components/shared/prototype-types';
import { TagPills } from '@/app/components/shared/tag-pills';
import { stripHashtags } from '@/lib/utils';

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
}: PointCardWithLinksProps) {
  const { isEmbed, embedNavigate } = useEmbedNavigation();
  // Embed: keep hashtags inline in text (no TagPills), saves vertical space
  // Also strip markdown links [text](url) → text and raw URLs for clean plain-text display
  const rawText = isEmbed ? point.text : stripHashtags(point.text, tags);
  const fullText = isEmbed
    ? rawText.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/https?:\/\/\S+/g, '').replace(/\s{2,}/g, ' ').trim()
    : rawText;
  // In embed mode, truncate long point text to keep embed compact
  const EMBED_TRUNCATE = 750;
  const displayText = isEmbed && fullText.length > EMBED_TRUNCATE
    ? fullText.slice(0, EMBED_TRUNCATE).trimEnd() + '...'
    : fullText;
  const isTextTruncated = isEmbed && fullText.length > EMBED_TRUNCATE;
  const isOwnProfile = !!(currentUserId && profileOwner?.id && currentUserId === profileOwner.id);
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
  const [storiesExpanded, setStoriesExpanded] = useState(false);

  // In embed mode, clicking "N stories" navigates instead of expanding (iframe can't resize)
  const handleStoriesToggle = () => {
    if (isEmbed) {
      // 1 story → open that story directly; N stories → open point page
      if (linkedStories.length === 1) {
        embedNavigate(`/story/${linkedStories[0].id}`);
      } else {
        embedNavigate(`/point/${point.id}`);
      }
    } else {
      setStoriesExpanded(!storiesExpanded);
    }
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

  const cardClassName = isDetailView
    ? 'bg-white rounded-lg shadow-sm border-l-4 border-l-slate-400 border border-gray-200 overflow-hidden'
    : 'group bg-white rounded-lg shadow-sm border-l-4 border-l-slate-400 border border-gray-200 overflow-hidden cursor-pointer hover:border-slate-300 hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2';

  // Quote pattern: when on profile, show position label outside, Point in quoted box
  const showQuotePattern =
    profileOwner && profileOwner.position;

  return (
    <>
    <div
      role={!isDetailView && !disableNavigation ? 'button' : undefined}
      tabIndex={!isDetailView && !disableNavigation ? 0 : undefined}
      className={cardClassName}
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
            <div className="flex items-center gap-1.5 mb-2 text-sm text-gray-700">
              <GravatarAvatar
                name={profileOwner.name}
                photoUrl={profileOwner.avatarUrl}
                avatarColor={profileOwner.avatarColor}
                size="sm"
                isPledger={profileOwner.hasPledged ?? false}
                className="!w-5 !h-5 !text-[10px]"
              />
              <span className="font-medium">{profileOwner.name}</span>
              <EarBadge count={profileOwner.ear ?? 0} name={profileOwner.name} size={14} />
              <PositionBadge position={profileOwner.position} />
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
                  {/* Point text */}
                  <p className={`text-gray-900 break-words ${compact ? 'text-sm' : 'text-base'}`}>
                    {isEmbed ? displayText : <LinkedText text={displayText} />}
                    {isTextTruncated && (
                      <button
                        onClick={(e) => { e.stopPropagation(); embedNavigate(`/point/${point.id}`); }}
                        className="ml-1 text-blue-600 hover:text-blue-700 text-sm"
                      >
                        show more
                      </button>
                    )}
                  </p>

                  {/* P491: Tag pills — after text, before position buttons (hidden in embed) */}
                  {!isEmbed && tags && tags.length > 0 && (
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
                className="flex items-center justify-between flex-wrap gap-y-1 mt-3 pt-3 border-t border-gray-200 pl-[44px]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Collapsible trigger (if has linked stories) or 0-stories CTA */}
                {(() => {
                  if (isDetailView) return <span />;
                  const effectiveViewerCount = viewerStoryCount ?? filteredStories.filter(s => s.authorId === currentUserId).length;
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
                        {/* Case D: viewer has position but no story yet on another's profile */}
                        {!isEmbed && !liveSessionMode && !isOwnProfile && userPosition && effectiveViewerCount === 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); embedNavigate(`/create?pointId=${point.id}`); }}
                            className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
                            aria-label="Add your story"
                          >
                            · Add your story →
                          </button>
                        )}
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
                      </div>
                    );
                  }

                  if (!isEmbed && !liveSessionMode && userPosition && effectiveViewerCount === 0) {
                    // Case B/F: 0 stories, viewer has position — show 0-stories label + Add CTA
                    return (
                      <div className="flex items-center gap-2">
                        <ChevronRight size={14} className="text-gray-400" />
                        <span className="text-sm text-gray-600">{storyLabel}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); embedNavigate(`/create?pointId=${point.id}`); }}
                          className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
                          aria-label="Add your story"
                        >
                          · Add your story →
                        </button>
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

              {/* Point text - same position as StoryCard text */}
              <p className={`text-gray-900 break-words ${compact ? 'text-sm' : 'text-base'}`}>
                <LinkedText text={displayText} />
                {isTextTruncated && (
                  <button
                    onClick={(e) => { e.stopPropagation(); embedNavigate(`/point/${point.id}`); }}
                    className="ml-1 text-blue-600 hover:text-blue-700 text-sm"
                  >
                    show more
                  </button>
                )}
              </p>

              {/* P491: Tag pills — after text, before position buttons (hidden in embed — hashtags stay inline) */}
              {!isEmbed && tags && tags.length > 0 && (
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
          className="flex items-center justify-between flex-wrap gap-y-1 pl-[52px] pr-4 py-3 border-t border-gray-100"
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
            const effectiveViewerCount = viewerStoryCount ?? filteredStories.filter(s => s.authorId === currentUserId).length;
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
                  {/* Case D: viewer has position but no story yet on another's profile */}
                  {!isEmbed && !liveSessionMode && !isOwnProfile && userPosition && effectiveViewerCount === 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); embedNavigate(`/create?pointId=${point.id}`); }}
                      className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
                      aria-label="Add your story"
                    >
                      · Add your story →
                    </button>
                  )}
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

            return <span />; /* Empty span for flexbox spacing */
          })() : (
            <span /> /* Empty span for flexbox spacing */
          )}

          {/* Action icons - hidden in live session mode; embed: open button only (no share) */}
          {!hideActions && !liveSessionMode && (
            <div className="flex items-center gap-1">
              {!isEmbed && (
                <ShareButton type="point" id={point.id} description={point.text.slice(0, 100)} />
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


        {/* P465: Story CTA footer row for feed view — shown when viewer has taken a position + no story yet (hidden in embed) */}
        {userPosition && !isEmbed && !liveSessionMode && (() => {
          const positionGroup = getPositionGroup(userPosition as PositionType);
          const copy = getPositionCTACopy(positionGroup);
          const effectiveViewerStoryCount = viewerStoryCount ?? filteredStories.filter(s => s.authorId === currentUserId).length;
          if (effectiveViewerStoryCount > 0) return null;
          return (
            <div
              role="presentation"
              className="flex items-center pl-[52px] pr-4 py-2.5 border-t border-gray-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-1 text-sm">
                <button
                  onClick={(e) => { e.stopPropagation(); embedNavigate(`/create?pointId=${point.id}`); }}
                  aria-label={copy.ariaLabel}
                  className="font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  {copy.ctaText}
                </button>
              </div>
            </div>
          );
        })()}
        </>
      )}

      {/* Expanded linked stories - in feed view or live session mode (never in embed — opens new tab instead) */}
      {!isDetailView &&
        !isEmbed &&
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

              if (stories.length === 1) {
                // Single story - no thread lines
                return (
                  <QuotedStory
                    story={stories[0]}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onStoryClick) {
                        onStoryClick(stories[0].id);
                      } else if (!liveSessionMode) {
                        embedNavigate(`/story/${stories[0].id}`);
                      }
                    }}
                    onAuthorClick={(e) => {
                      e.stopPropagation();
                      if (!liveSessionMode) embedNavigate(`/p/${stories[0].authorId}`);
                    }}
                    getStoryAuthor={getStoryAuthor}
                  />
                );
              }

              // 2+ stories - show thread lines
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
    {/* storyCTAOverride: custom node injected by StoryGuideChat when position is taken in /chat */}
    {storyCTAOverride !== undefined && !liveSessionMode && storyCTAOverride}
    </>
  );
}

/**
 * Twitter-style quoted Story card - shows a linked story within a Point.
 */
function QuotedStory({
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
      className="group/quote w-full text-left p-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
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
            {author.name}
          </span>
          {/* Ear indicator - understanding credibility */}
          <EarBadge count={author.ear ?? 0} name={author.name} />
        </div>
      )}
      {/* Story text — strip hashtags that are rendered as TagPills */}
      {(() => {
        const cleanText = stripHashtags(story.text, story.tags ?? []);
        return !textExpanded && cleanText.length > 100 ? (
          <p className="text-sm text-gray-800 break-words">
            <LinkedText text={cleanText.slice(0, 100)} />
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
          <p className="text-sm text-gray-800 break-words"><LinkedText text={cleanText} /></p>
        );
      })()}
      {(story.tags ?? []).length > 0 && (
        <TagPills tags={story.tags ?? []} context="detail" className="mt-1.5" />
      )}
    </div>
  );
}
