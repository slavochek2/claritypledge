/**
 * @file SwipeableCard.tsx
 * @description Tinder-style swipeable card for Stories and Points.
 *
 * Swipe gestures (Points):
 * - RIGHT: Agree (+2)
 * - LEFT: Disagree (-2)
 * - DOWN: Skip (no position recorded)
 *
 * Swipe gestures (Stories):
 * - Any direction: Next card (navigation only, no position)
 *
 * Uses framer-motion for smooth gesture animations.
 */
import { useState, useMemo } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { ThumbsUp, ThumbsDown, ArrowDown, Pin, Mic, MessageCircle, ExternalLink } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PositionButtons, UserCredibility, type SevenPointCounts } from '../shared';
import {
  getUserById,
  formatTimeAgo,
  getStoriesForPoint,
  getPointsForStory,
  getPointPositionCounts,
  currentUser,
} from '../../data/mock-data';
import type { Story, Point, PositionType, Position, PositionButtonGroup } from '../../../shared/types';
import { getPositionGroup } from '../../../shared/types';

export type SwipeDirection = 'left' | 'right' | 'down';

export interface SwipeableCardProps {
  item: Story | Point;
  type: 'story' | 'point';
  isTopCard?: boolean;
  onSwipe: (direction: SwipeDirection) => void;
  onStoryTap?: (storyId: string) => void;
  onPointTap?: (pointId: string) => void;
  onLiveButtonClick?: (story: Story) => void;
}

// Thresholds for triggering actions
const SWIPE_THRESHOLD = 100;

export function SwipeableCard({
  item,
  type,
  isTopCard = false,
  onSwipe,
  onStoryTap,
  onPointTap: _onPointTap,
  onLiveButtonClick,
}: SwipeableCardProps) {
  const [exitDirection, setExitDirection] = useState<SwipeDirection | null>(null);

  // Motion values for tracking drag
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Transform drag to rotation
  const rotate = useTransform(x, [-200, 200], [-15, 15]);

  // Opacity indicators based on drag direction (only for Points)
  const agreeOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const disagreeOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);
  const skipOpacity = useTransform(y, [0, SWIPE_THRESHOLD], [0, 1]);

  // Background color based on drag direction
  const backgroundColor = useTransform(
    [x, y],
    ([latestX, latestY]) => {
      const xNum = latestX as number;
      const yNum = latestY as number;
      if (type === 'point') {
        if (xNum > SWIPE_THRESHOLD / 2) return 'rgba(34, 197, 94, 0.1)'; // Green for agree
        if (xNum < -SWIPE_THRESHOLD / 2) return 'rgba(239, 68, 68, 0.1)'; // Red for disagree
        if (yNum > SWIPE_THRESHOLD / 2) return 'rgba(156, 163, 175, 0.1)'; // Gray for skip
      }
      return 'rgba(255, 255, 255, 1)';
    }
  );

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const { offset } = info;

    // Determine action based on drag offset
    if (offset.x > SWIPE_THRESHOLD) {
      setExitDirection('right');
      onSwipe('right');
    } else if (offset.x < -SWIPE_THRESHOLD) {
      setExitDirection('left');
      onSwipe('left');
    } else if (offset.y > SWIPE_THRESHOLD) {
      setExitDirection('down');
      onSwipe('down');
    }
  };

  // Animation variants for exit
  const exitVariants = {
    right: { x: 500, opacity: 0, rotate: 30 },
    left: { x: -500, opacity: 0, rotate: -30 },
    down: { y: 500, opacity: 0 },
  };

  const isStory = type === 'story';
  const isPoint = type === 'point';

  return (
    <motion.div
      className="absolute inset-0 touch-none"
      style={{ x, y, rotate, backgroundColor }}
      drag={isTopCard}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.9}
      onDragEnd={handleDragEnd}
      animate={exitDirection ? exitVariants[exitDirection] : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* Card container - max-width for desktop */}
      <div className={`h-full max-w-lg mx-auto w-full flex flex-col bg-white rounded-xl shadow-lg border overflow-hidden ${
        isStory ? 'border-l-4 border-l-blue-500 border-gray-200' : 'border-l-4 border-l-slate-400 border-gray-200'
      }`}>
        {/* Swipe indicators (Points only) */}
        {isPoint && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-between px-6 z-10">
            {/* Agree indicator (right) */}
            <motion.div
              className="absolute right-6 top-1/2 -translate-y-1/2"
              style={{ opacity: agreeOpacity }}
            >
              <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
                <ThumbsUp className="w-8 h-8 text-white" />
              </div>
            </motion.div>

            {/* Disagree indicator (left) */}
            <motion.div
              className="absolute left-6 top-1/2 -translate-y-1/2"
              style={{ opacity: disagreeOpacity }}
            >
              <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
                <ThumbsDown className="w-8 h-8 text-white" />
              </div>
            </motion.div>

            {/* Skip indicator (down) */}
            <motion.div
              className="absolute bottom-6 left-1/2 -translate-x-1/2"
              style={{ opacity: skipOpacity }}
            >
              <div className="px-4 py-2 rounded-full bg-gray-500 flex items-center gap-2 shadow-lg">
                <ArrowDown className="w-5 h-5 text-white" />
                <span className="text-white font-medium">Skip</span>
              </div>
            </motion.div>
          </div>
        )}

        {/* Card content */}
        <div className="flex-1 flex flex-col justify-center p-6 pl-8 overflow-y-auto">
          {isStory ? (
            <StoryContent
              story={item as Story}
              onTap={onStoryTap}
              onLiveButtonClick={onLiveButtonClick}
            />
          ) : (
            <PointContent
              point={item as Point}
              onStoryTap={onStoryTap}
            />
          )}
        </div>

        {/* Swipe instructions */}
        {isTopCard && (
          <div className="py-4 px-6 border-t border-gray-100 bg-gray-50">
            {isPoint ? (
              <div className="flex items-center justify-center gap-6 text-sm text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="text-red-500">←</span> Disagree
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-gray-500">↓</span> Skip
                </span>
                <span className="flex items-center gap-1">
                  Agree <span className="text-green-500">→</span>
                </span>
              </div>
            ) : (
              <div className="text-center text-sm text-gray-400">
                Swipe any direction for next
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Story content for the swipeable card
 */
function StoryContent({
  story,
  onTap,
  onLiveButtonClick,
}: {
  story: Story;
  onTap?: (storyId: string) => void;
  onLiveButtonClick?: (story: Story) => void;
}) {
  const author = getUserById(story.authorId);
  const linkedPoints = getPointsForStory(story.id);
  const isOwnStory = story.authorId === currentUser.id;

  // Determine /live button text
  const getLiveButtonText = () => {
    if (isOwnStory) {
      // For own stories, we'd show partner name if in context
      return 'Does someone understand you?';
    }
    return author ? `Do you understand ${author.name.split(' ')[0]}?` : 'Do you understand?';
  };

  return (
    <div className="space-y-3">
      {/* Author info - matches feed card layout */}
      {author && (
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTap?.(story.id);
            }}
            className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-lg hover:ring-2 hover:ring-blue-200 transition-all flex-shrink-0"
          >
            {author.avatar}
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-gray-900 text-sm">{isOwnStory ? 'You' : author.name}</span>
              <UserCredibility userId={author.id} userName={author.name} />
            </div>
            <p className="text-xs text-gray-500">
              {author.role} · {formatTimeAgo(story.createdAt)}
            </p>
          </div>
        </div>
      )}

      {/* Story text - no quotes, matches feed */}
      <p className="text-base text-gray-900 leading-relaxed">
        {story.text}
      </p>

      {/* Stats - matches feed card style */}
      <TooltipProvider delayDuration={100}>
        <div className="flex items-center gap-3 px-2.5 py-1 bg-gray-100 rounded-full text-sm text-gray-500 w-fit">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1 cursor-default">
                <Mic size={14} />
                {story.verificationCount}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>People understood this story</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {/* /live button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onLiveButtonClick?.(story);
        }}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
      >
        <MessageCircle size={16} />
        {getLiveButtonText()}
      </button>

      {/* Related Points - compact link */}
      {linkedPoints.length > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTap?.(story.id);
          }}
          className="text-sm text-blue-600 hover:underline"
        >
          {linkedPoints.length} related {linkedPoints.length === 1 ? 'point' : 'points'} →
        </button>
      )}
    </div>
  );
}

/**
 * Point content for the swipeable card
 */
function PointContent({
  point,
  onStoryTap,
}: {
  point: Point;
  onStoryTap?: (storyId: string) => void;
}) {
  const [userPosition, setUserPosition] = useState<Position>(
    point.positions['current']?.position || null
  );
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

    const initialGroup = getGroup(initialPosition as PositionType | null);
    const currentGroup = getGroup(userPosition as PositionType | null);

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

  const handlePositionClick = (position: Position) => {
    setUserPosition(userPosition === position ? null : position);
  };

  // Get first linked story for "From" preview
  const firstLinkedStory = linkedStories[0];
  const storyAuthor = firstLinkedStory ? getUserById(firstLinkedStory.authorId) : null;

  return (
    <div className="space-y-3">
      {/* Header - matches feed card layout with Pin icon */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-500">
          <Pin size={20} />
        </div>
        <div className="min-w-0">
          <span className="text-sm font-medium text-gray-700">
            {counts.agree + counts.disagree + counts.unsure} positions
          </span>
        </div>
      </div>

      {/* Point text - no quotes, matches feed */}
      <p className="text-base text-gray-900 leading-relaxed">
        {point.text}
      </p>

      {/* Position buttons */}
      <div onClick={(e) => e.stopPropagation()}>
        <PositionButtons
          userPosition={userPosition}
          counts={counts}
          onPositionClick={handlePositionClick}
        />
      </div>

      {/* Linked Story - matches QuotedStory style from feed */}
      {firstLinkedStory && storyAuthor && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStoryTap?.(firstLinkedStory.id);
          }}
          className="w-full text-left p-3 rounded-lg border border-gray-200 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-200 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-xs">
              {storyAuthor.avatar}
            </span>
            <span className="text-xs font-medium text-gray-700">{storyAuthor.name}</span>
          </div>
          <p className="text-sm text-gray-700 line-clamp-2">{firstLinkedStory.text}</p>
        </button>
      )}
    </div>
  );
}
