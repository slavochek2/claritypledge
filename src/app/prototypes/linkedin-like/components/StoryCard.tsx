import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MessageCircle, ChevronDown, ChevronRight, Radio, ExternalLink, Share2 } from 'lucide-react';
import { MobileTooltip } from './shared/MobileTooltip';
import { OverflowMenu } from './shared/OverflowMenu';
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
  /** Author's position on the Point (used for data context, display removed to reduce redundancy since position sections already group by stance) */
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
                  {/* Action buttons - Share and Open only (Start Session moved to bottom) */}
                  {!isDetailView && (
                    <div onClick={(e) => e.stopPropagation()}>
                      {/* Desktop: Share and Open on hover */}
                      <div className="hidden sm:flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                        <ShareButton
                          type="story"
                          id={story.id}
                          title={`${author.name}'s story`}
                          description={story.text.slice(0, 100)}
                        />
                        <MobileTooltip content="Open story">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(routes.story(story.id));
                            }}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                            aria-label="Open story"
                          >
                            <ExternalLink size={16} />
                          </button>
                        </MobileTooltip>
                      </div>

                      {/* Mobile: overflow menu */}
                      <div className="sm:hidden">
                        <OverflowMenu
                          items={[
                            {
                              icon: <Share2 size={16} />,
                              label: 'Share',
                              onClick: () => {
                                const url = `${window.location.origin}${routes.story(story.id)}`;
                                if (navigator.share) {
                                  navigator.share({
                                    title: `${author.name}'s story`,
                                    text: story.text.slice(0, 100),
                                    url,
                                  });
                                } else {
                                  navigator.clipboard.writeText(url);
                                }
                              },
                            },
                            {
                              icon: <ExternalLink size={16} />,
                              label: 'Open story',
                              onClick: () => navigate(routes.story(story.id)),
                            },
                          ]}
                        />
                      </div>
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

      {/* Primary CTA at bottom - always visible */}
      {!isDetailView && (
        <div className="border-t border-gray-100 px-4 py-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/prototype/live/new?with=${story.authorId}&story=${story.id}`);
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Radio size={16} />
            Start a Clarity Session
          </button>
        </div>
      )}

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
              Supports {linkedPoints.length} point{linkedPoints.length !== 1 ? 's' : ''}
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
        {/* Arrow icon - visual hint that card is clickable (not separately interactive) */}
        <span
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 opacity-100 sm:opacity-0 sm:group-hover/quote:opacity-100 transition-opacity pointer-events-none"
          aria-hidden="true"
        >
          <ExternalLink size={14} />
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
