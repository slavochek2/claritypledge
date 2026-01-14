/**
 * @file SwipeableIdeaCard.tsx
 * @description Tinder-style swipeable card for reviewing ideas during a live meeting.
 *
 * Swipe gestures:
 * - RIGHT: Agree with the idea (locks in position)
 * - LEFT: Dismiss (disagree/skip)
 * - DOWN: Later (move to bottom of queue)
 *
 * Uses framer-motion for smooth gesture animations.
 */
import { useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Check, X, Clock } from 'lucide-react';
import type { IdeaQueueItem, SwipeAction } from '../../data/mock-data';
import { getUserById } from '../../data/mock-data';

interface SwipeableIdeaCardProps {
  idea: IdeaQueueItem;
  onSwipe: (ideaId: string, action: SwipeAction) => void;
  isTopCard?: boolean;
}

// Thresholds for triggering actions
const SWIPE_THRESHOLD = 100;
const ROTATION_FACTOR = 0.1;

export function SwipeableIdeaCard({ idea, onSwipe, isTopCard = false }: SwipeableIdeaCardProps) {
  const [exitDirection, setExitDirection] = useState<SwipeAction | null>(null);

  // Motion values for tracking drag
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Transform drag to rotation
  const rotate = useTransform(x, [-200, 200], [-15, 15]);

  // Opacity indicators based on drag direction
  const agreeOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const dismissOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);
  const laterOpacity = useTransform(y, [0, SWIPE_THRESHOLD], [0, 1]);

  // Background color based on drag direction
  const backgroundColor = useTransform(
    [x, y],
    ([latestX, latestY]) => {
      const xNum = latestX as number;
      const yNum = latestY as number;
      if (xNum > SWIPE_THRESHOLD / 2) return 'rgba(34, 197, 94, 0.1)'; // Green for agree
      if (xNum < -SWIPE_THRESHOLD / 2) return 'rgba(59, 130, 246, 0.1)'; // Blue for dismiss
      if (yNum > SWIPE_THRESHOLD / 2) return 'rgba(156, 163, 175, 0.1)'; // Gray for later
      return 'rgba(255, 255, 255, 1)';
    }
  );

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const { offset } = info;

    // Determine action based on drag offset
    if (offset.x > SWIPE_THRESHOLD) {
      setExitDirection('right');
      onSwipe(idea.id, 'right');
    } else if (offset.x < -SWIPE_THRESHOLD) {
      setExitDirection('left');
      onSwipe(idea.id, 'left');
    } else if (offset.y > SWIPE_THRESHOLD) {
      setExitDirection('down');
      onSwipe(idea.id, 'down');
    }
  };

  const surfacedByUser = getUserById(idea.surfacedBy);

  // Animation variants for exit
  const exitVariants = {
    right: { x: 500, opacity: 0, rotate: 30 },
    left: { x: -500, opacity: 0, rotate: -30 },
    down: { y: 500, opacity: 0 },
  };

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
      {/* Card container */}
      <div className="h-full flex flex-col bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        {/* Blue left border indicator for "Your Ideas" */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-l-xl" />

        {/* Swipe indicators */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-between px-6">
          {/* Agree indicator (right) */}
          <motion.div
            className="absolute right-6 top-1/2 -translate-y-1/2"
            style={{ opacity: agreeOpacity }}
          >
            <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
              <Check className="w-8 h-8 text-white" />
            </div>
          </motion.div>

          {/* Dismiss indicator (left) */}
          <motion.div
            className="absolute left-6 top-1/2 -translate-y-1/2"
            style={{ opacity: dismissOpacity }}
          >
            <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center shadow-lg">
              <X className="w-8 h-8 text-white" />
            </div>
          </motion.div>

          {/* Later indicator (down) */}
          <motion.div
            className="absolute bottom-6 left-1/2 -translate-x-1/2"
            style={{ opacity: laterOpacity }}
          >
            <div className="px-4 py-2 rounded-full bg-gray-500 flex items-center gap-2 shadow-lg">
              <Clock className="w-5 h-5 text-white" />
              <span className="text-white font-medium">Later</span>
            </div>
          </motion.div>
        </div>

        {/* Card content */}
        <div className="flex-1 flex flex-col justify-center p-6 pl-8">
          {/* Surfaced by label */}
          <div className="mb-3">
            <span className="text-xs text-gray-500">
              {surfacedByUser?.name || 'Someone'} wants to verify:
            </span>
          </div>

          {/* Idea text */}
          <p className="text-lg font-medium text-gray-900 leading-relaxed">
            "{idea.text}"
          </p>

          {/* Swipe instructions */}
          {isTopCard && (
            <div className="mt-6 flex items-center justify-center gap-6 text-sm text-gray-400">
              <span className="flex items-center gap-1">
                <span className="text-blue-500">←</span> Dismiss
              </span>
              <span className="flex items-center gap-1">
                <span className="text-gray-500">↓</span> Later
              </span>
              <span className="flex items-center gap-1">
                Agree <span className="text-green-500">→</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Locked card variant - shown after agreeing
interface LockedIdeaCardProps {
  idea: IdeaQueueItem;
}

export function LockedIdeaCard({ idea }: LockedIdeaCardProps) {
  const surfacedByUser = getUserById(idea.surfacedBy);

  return (
    <div className="bg-green-50 rounded-lg border border-green-200 p-4 relative overflow-hidden">
      {/* Blue left border */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />

      {/* Locked badge */}
      <div className="absolute top-2 right-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <Check className="w-3 h-3" />
          Agreed
        </span>
      </div>

      {/* Content */}
      <div className="pl-3">
        <span className="text-xs text-gray-500">{surfacedByUser?.name || 'Someone'}:</span>
        <p className="text-sm text-gray-800 mt-1">"{idea.text}"</p>
      </div>
    </div>
  );
}
