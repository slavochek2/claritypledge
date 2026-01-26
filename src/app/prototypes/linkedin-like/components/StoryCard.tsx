import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, ChevronDown, ChevronRight, ExternalLink, Ear, Pin } from 'lucide-react';
import { MobileTooltip } from './shared/MobileTooltip';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { routes } from '../config';
import { getUserById, formatTimeAgo, getPointsForStory, getPointPositionCounts, currentUser, getUserCredibilityStats } from '../data/mock-data';
import { PositionButtons, PositionBadge, ShareButton, UserCredibility, VisibilityBadge, ThreadLineGroup, ThreadLineItem, type SevenPointCounts } from './shared';
import type { Story, Point, PositionButtonGroup } from '../../shared/types';
import type { PositionType } from '../../shared/types';
import { getPositionGroup } from '../../shared/types';

/** Display context for StoryCard - controls what's shown */
export type StoryCardContext = 'profile' | 'point-detail' | 'story-detail';

interface StoryCardProps {
  story: Story;
  compact?: boolean;
  isDetailView?: boolean;
  /** Display context - 'profile' hides QuotedPoints, 'point-detail' hides QuotedPoints */
  context?: StoryCardContext;
  /** Show "Verify" button in card footer */
  showVerifyButton?: boolean;
  /** Callback for verify button */
  onVerify?: (e: React.MouseEvent) => void;
  /** Show thread line styling (used in point-detail hierarchy) */
  showThreadLine?: boolean;
  /** Author's position on the Point (used for data context, display removed to reduce redundancy since position sections already group by stance) */
  authorPosition?: PositionType;
}

/**
 * StoryCard - displays a personal experience (Story)
 * Visual: Blue left border, author avatar, linked Points shown below
 * Pattern B: Yellow border line shows linked Points
 *
 * Quote Pattern (P103): When context='point-detail' with authorPosition,
 * shows "{Name} {verb}:" outside a quoted box containing the story.
 */
export function StoryCard({
  story,
  compact = false,
  isDetailView = false,
  context,
  showVerifyButton = false,
  onVerify,
  showThreadLine = true,
  authorPosition,
}: StoryCardProps) {
  const navigate = useNavigate();
  const author = getUserById(story.authorId);
  const authorCredibility = getUserCredibilityStats(story.authorId);
  const linkedPoints = getPointsForStory(story.id);
  const [pointsExpanded, setPointsExpanded] = useState(isDetailView);
  const isCurrentUserStory = story.authorId === currentUser.id;

  const handleCardClick = () => {
    if (!isDetailView) {
      navigate(routes.story(story.id));
    }
  };

  // Quote pattern: show position label outside when in point-detail context with authorPosition
  const showQuotePattern = context === 'point-detail' && authorPosition && author;

  // Quote pattern rendering - when viewing Stories in a Point's position sections
  if (showQuotePattern) {
    return (
      <div className="bg-white rounded-lg overflow-hidden">
        {/* Position label OUTSIDE the quoted box - Avatar → Name → Ear → Badge */}
        <div className="flex items-center gap-1.5 mb-2 text-sm text-gray-700">
          <GravatarAvatar
            name={author.name}
            size="sm"
            isPledger={author.hasPledged}
            className="!w-5 !h-5 !text-[10px]"
          />
          <span className="font-medium">{author.name}</span>
          {authorCredibility.ear > 0 && (
            <MobileTooltip content={`${author.name.split(' ')[0]} understood ${authorCredibility.ear} ${authorCredibility.ear === 1 ? 'story' : 'stories'} as confirmed by their owners`}>
              <span className="inline-flex items-center gap-0.5 text-gray-600">
                <Ear size={12} />
                {authorCredibility.ear}
              </span>
            </MobileTooltip>
          )}
          <PositionBadge position={authorPosition} />
        </div>

        {/* Quoted Story box */}
        <div
          className="bg-gray-50 border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-100 hover:border-gray-300 transition-colors"
          onClick={handleCardClick}
        >
          {/* Role + date (name/avatar already shown outside) */}
          <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
            <span>{author.role} · {formatTimeAgo(story.createdAt)}</span>
            <VisibilityBadge visibility={story.visibility} />
          </p>

          {/* Story text */}
          <p className={`text-gray-900 ${compact ? 'text-sm line-clamp-3' : 'text-base'}`}>
            {story.text}
          </p>
        </div>
      </div>
    );
  }

  // Standard rendering (non-quote pattern)
  const cardClassName = isDetailView
    ? "bg-white rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-gray-200 overflow-hidden"
    : "group bg-white rounded-lg shadow-sm border-l-4 border-l-blue-500 border border-gray-200 overflow-hidden cursor-pointer hover:border-blue-300 hover:shadow-md transition-all";

  return (
    <div className={cardClassName} onClick={handleCardClick}>
      {/* Main content */}
      <div className="p-4">
        {/* Author row with avatar */}
        {author && (
          <div className="flex items-start gap-3">
            {/* Avatar column */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(routes.profileById(author.id));
              }}
              className="flex-shrink-0 hover:opacity-80 transition-opacity self-start"
            >
              <GravatarAvatar
                name={author.name}
                size="sm"
                isPledger={author.hasPledged}
              />
            </button>

            {/* Content column - aligned under avatar */}
            <div className="flex-1 min-w-0">
              {/* Author info row */}
              <div className="mb-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(routes.profileById(author.id));
                    }}
                    className="font-semibold text-gray-900 hover:underline text-sm"
                  >
                    {author.name}
                  </button>
                  <UserCredibility userId={author.id} userName={author.name} />
                </div>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <span>{author.role} · {formatTimeAgo(story.createdAt)}</span>
                  <VisibilityBadge visibility={story.visibility} />
                </p>
              </div>

              {/* Story text - indented under author */}
              <p className={`text-gray-900 ${compact ? 'text-sm line-clamp-3' : 'text-base'}`}>
                {story.text}
              </p>

              {/* Stats row - icon-only style */}
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  {/* People who understood the story author */}
                  <MobileTooltip content={`${author?.name.split(' ')[0]} confirmed ${story.verificationCount} ${story.verificationCount === 1 ? 'person' : 'people'} understood this story`}>
                    <span className="px-2.5 py-1 bg-gray-100 rounded-full text-sm text-gray-600">
                      {story.verificationCount} understood
                    </span>
                  </MobileTooltip>
                </div>
                {showVerifyButton && (
                  <button
                    onClick={onVerify}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors"
                  >
                    <MessageCircle size={12} />
                    Verify
                  </button>
                )}
              </div>

              {/* point-detail context: Hide QuotedPoints entirely - Stories are already in Point context */}
            </div>
          </div>
        )}
      </div>

      {/* Footer row with linked points and action icons - hide in point-detail context */}
      {context !== 'point-detail' && (
        <>
          {/* Footer header row */}
          <div
            className="flex items-center justify-between pl-[52px] pr-4 py-3 border-t border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Collapsible trigger (if has linked points) */}
            {linkedPoints.length > 0 ? (
              <button
                onClick={() => setPointsExpanded(!pointsExpanded)}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
                aria-expanded={pointsExpanded}
                aria-label={`${pointsExpanded ? 'Collapse' : 'Expand'} linked points`}
              >
                {pointsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>
                  {linkedPoints.length} {linkedPoints.length === 1 ? 'point' : 'points'} by {author?.name}
                </span>
              </button>
            ) : (
              <span /> /* Empty span for flexbox spacing */
            )}

            {/* Action icons */}
            <div className="flex items-center gap-1">
              <ShareButton
                type="story"
                id={story.id}
                title={`${author?.name}'s story`}
                description={story.text.slice(0, 100)}
              />
              {/* External link - only in feed (redundant in detail view) */}
              {!isDetailView && (
                <MobileTooltip content="Open story">
                  <button
                    onClick={() => navigate(routes.story(story.id))}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    aria-label="Open story"
                  >
                    <ExternalLink size={16} />
                  </button>
                </MobileTooltip>
              )}
            </div>
          </div>

          {/* Linked points - expanded content */}
          {pointsExpanded && linkedPoints.length > 0 && (() => {
            const pointsToShow = linkedPoints.slice(0, isDetailView ? undefined : 3);
            const hasMorePoints = !isDetailView && linkedPoints.length > 3;

            return (
              <div className="pl-[68px] pr-4 pb-4">
                {pointsToShow.length === 1 ? (
                  // Single point - no thread lines
                  <QuotedPoint
                    point={pointsToShow[0]}
                    authorName={author?.name || ''}
                    authorId={story.authorId}
                    authorEarCount={authorCredibility.ear}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(routes.point(pointsToShow[0].id));
                    }}
                  />
                ) : (
                  // 2+ points - show thread lines
                  <ThreadLineGroup>
                    {pointsToShow.map((point, index) => (
                      <ThreadLineItem key={point.id} isLast={index === pointsToShow.length - 1 && !hasMorePoints}>
                        <QuotedPoint
                          point={point}
                          authorName={author?.name || ''}
                          authorId={story.authorId}
                          authorEarCount={authorCredibility.ear}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(routes.point(point.id));
                          }}
                        />
                      </ThreadLineItem>
                    ))}
                    {hasMorePoints && (
                      <ThreadLineItem isLast>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(routes.story(story.id));
                          }}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          +{linkedPoints.length - 3} more points
                        </button>
                      </ThreadLineItem>
                    )}
                  </ThreadLineGroup>
                )}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

/**
 * Twitter-style quoted Point card - Quote pattern per P103
 * Shows "{Name} {verb}:" outside the Point box, Point content inside quoted box
 * Position buttons are interactive using same style as main PointCard
 */
function QuotedPoint({
  point,
  authorName,
  authorId,
  authorEarCount,
  onClick
}: {
  point: Point;
  authorName: string;
  authorId: string;
  authorEarCount?: number;
  onClick: (e: React.MouseEvent) => void;
}) {
  const [userPosition, setUserPosition] = useState<PositionType | null>(
    point.positions['current']?.position || null
  );
  const authorPosition = point.positions[authorId]?.position;
  const baseCounts = getPointPositionCounts(point);

  // Track initial position from mock data
  const initialPosition = point.positions['current']?.position || null;

  // Compute adjusted counts based on user's current position vs initial
  const counts = useMemo((): SevenPointCounts => {
    const adjusted: SevenPointCounts = {
      strongly_agree: 0,
      agree: baseCounts.agree,
      somewhat_agree: 0,
      unsure: baseCounts.unsure,
      somewhat_disagree: 0,
      disagree: baseCounts.disagree,
      strongly_disagree: 0,
    };

    const getGroup = (pos: PositionType | null): PositionButtonGroup | null => {
      if (!pos) return null;
      return getPositionGroup(pos);
    };

    const initialGroup = getGroup(initialPosition);
    const currentGroup = getGroup(userPosition);

    if (initialGroup !== currentGroup) {
      if (initialGroup === 'agree') adjusted.agree = Math.max(0, adjusted.agree - 1);
      else if (initialGroup === 'disagree') adjusted.disagree = Math.max(0, adjusted.disagree - 1);
      else if (initialGroup === 'unsure') adjusted.unsure = Math.max(0, adjusted.unsure - 1);

      if (currentGroup === 'agree') adjusted.agree++;
      else if (currentGroup === 'disagree') adjusted.disagree++;
      else if (currentGroup === 'unsure') adjusted.unsure++;
    }

    return adjusted;
  }, [baseCounts, initialPosition, userPosition]);
  const handlePositionClick = (position: PositionType) => {
    setUserPosition(userPosition === position ? null : position);
  };

  const navigate = useNavigate();

  const author = getUserById(authorId);

  return (
    <div className="w-full text-left">
      {/* Position label OUTSIDE the quoted box - Avatar → Name → Ear → Badge */}
      {authorPosition && (
        <div className="flex items-center gap-1.5 mb-1.5 text-sm text-gray-700">
          {author && (
            <GravatarAvatar
              name={author.name}
              size="sm"
              isPledger={author.hasPledged}
              className="!w-5 !h-5 !text-[10px]"
            />
          )}
          <span className="font-medium">{authorName}</span>
          {authorEarCount && authorEarCount > 0 && (
            <MobileTooltip content={`${authorName.split(' ')[0]} understood ${authorEarCount} ${authorEarCount === 1 ? 'story' : 'stories'} as confirmed by their owners`}>
              <span className="inline-flex items-center gap-0.5 text-gray-600">
                <Ear size={14} />
                {authorEarCount}
              </span>
            </MobileTooltip>
          )}
          <PositionBadge position={authorPosition} />
        </div>
      )}

      {/* Quoted Point box */}
      <button
        onClick={onClick}
        className="group/quote w-full text-left p-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-colors"
      >
        {/* Two-column layout matching PointCard structure */}
        <div className="flex items-start gap-3">
          {/* Pin icon column */}
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600">
            <Pin size={16} className="rotate-45" />
          </div>

          {/* Content column */}
          <div className="flex-1 min-w-0">
            {/* Point text */}
            <p className="text-sm text-gray-800 line-clamp-2">
              {point.text}
            </p>

            {/* Position buttons - compact */}
            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
              <PositionButtons
                userPosition={userPosition}
                counts={counts}
                onPositionClick={handlePositionClick}
                compact
              />
            </div>
          </div>
        </div>

      </button>
    </div>
  );
}
