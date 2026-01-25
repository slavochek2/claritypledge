import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MessageCircle, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { MobileTooltip } from './shared/MobileTooltip';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { routes } from '../config';
import { getUserById, formatTimeAgo, getPointsForStory, getStoriesForPoint, getPointPositionCounts, currentUser, getUserCredibilityStats } from '../data/mock-data';
import { PointHeader, PositionBadge, PositionButtons, ShareButton, UserCredibility, VisibilityBadge, type SevenPointCounts } from './shared';
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
  /** Author's position on the Point (shown before name in point-detail context) */
  authorPosition?: PositionType;
}

/**
 * StoryCard - displays a personal experience (Story)
 * Visual: Blue left border, author avatar, linked Points shown below
 * Pattern B: Yellow border line shows linked Points
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
  const [pointsExpanded, setPointsExpanded] = useState(false);
  const isCurrentUserStory = story.authorId === currentUser.id;

  const handleCardClick = () => {
    if (!isDetailView) {
      navigate(routes.story(story.id));
    }
  };

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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {/* Position badge before name (in point-detail context) */}
                    {authorPosition && context === 'point-detail' && (
                      <PositionBadge position={authorPosition} />
                    )}
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
                  {/* Action buttons - appear on hover (always visible on touch devices) */}
                  {!isDetailView && (
                    <div
                      className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(routes.story(story.id));
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-full hover:bg-blue-100 transition-colors"
                      >
                        <ExternalLink size={12} />
                        Open Story
                      </button>
                      <ShareButton
                        type="story"
                        id={story.id}
                        title={`${author.name}'s story`}
                        description={story.text.slice(0, 100)}
                      />
                    </div>
                  )}
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
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  {/* People who understood the story author */}
                  <MobileTooltip content={`${author?.name.split(' ')[0]} confirmed ${story.verificationCount} ${story.verificationCount === 1 ? 'person' : 'people'} understood this story`}>
                    <span className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 rounded-full">
                      <Mic size={14} />
                      {story.verificationCount}
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

      {/* Linked Points Footer - collapsible section */}
      {linkedPoints.length > 0 && context !== 'point-detail' && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPointsExpanded(!pointsExpanded);
            }}
            className="w-full flex items-center gap-2 pl-[52px] pr-4 py-3 border-t border-gray-100 text-sm text-gray-500 hover:text-blue-600 hover:bg-gray-50 transition-colors"
            aria-expanded={pointsExpanded}
            aria-label={`${pointsExpanded ? 'Collapse' : 'Expand'} linked points`}
          >
            {pointsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>
              Supports {author?.name?.split(' ')[0] || 'their'}'s positions on {linkedPoints.length} point{linkedPoints.length !== 1 ? 's' : ''}
            </span>
          </button>

          {/* Expanded linked points */}
          {pointsExpanded && (
            <div className="pl-[52px] pr-4 pb-4">
              <div className="space-y-2">
                {linkedPoints.slice(0, 3).map(point => (
                  <QuotedPoint
                    key={point.id}
                    point={point}
                    authorName={author?.name || ''}
                    authorId={story.authorId}
                    authorEarCount={authorCredibility.ear}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(routes.point(point.id));
                    }}
                  />
                ))}
                {linkedPoints.length > 3 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(routes.story(story.id));
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    +{linkedPoints.length - 3} more points
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Twitter-style quoted Point card - always visible, not expandable
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
  const linkedStories = getStoriesForPoint(point.id);
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

  return (
    <button
      onClick={onClick}
      className="group/quote w-full text-left p-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-colors"
    >
      {/* Author position at top */}
      <div className="flex items-center justify-between mb-1.5">
        <PointHeader
          authorPosition={authorPosition}
          authorName={authorName}
          authorEarCount={authorEarCount}
          compact
          showLabel={false}
        />
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-full hover:bg-blue-100 transition-colors opacity-100 sm:opacity-0 sm:group-hover/quote:opacity-100">
          <ExternalLink size={10} />
          Open Point
        </span>
      </div>
      {/* Point text */}
      <p className="text-sm text-gray-800 line-clamp-2">{point.text}</p>
      {/* Position buttons - compact */}
      <div className="mt-2">
        <PositionButtons
          userPosition={userPosition}
          counts={counts}
          onPositionClick={handlePositionClick}
          compact
        />
      </div>
    </button>
  );
}
