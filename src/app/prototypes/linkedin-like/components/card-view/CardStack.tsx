/**
 * @file CardStack.tsx
 * @description Full-screen swipeable card stack for Card View.
 *
 * Displays Stories and Points in a Tinder-like stack.
 * - Points: Swipe right = Agree (+2), left = Disagree (-2), down = Skip
 * - Stories: Swipe any direction = Next card
 *
 * Features:
 * - Undo toast after swiping Points
 * - Progress indicator
 * - Empty state when all cards seen
 */
import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Undo2, CheckCircle } from 'lucide-react';
import { SwipeableCard, type SwipeDirection } from './SwipeableCard';
import type { Story, Point, PositionType } from '../../../shared/types';

type FeedItem =
  | { type: 'story'; item: Story; sortDate: string }
  | { type: 'point'; item: Point; sortDate: string };

interface SwipeRecord {
  item: FeedItem;
  direction: SwipeDirection;
  position: PositionType | null; // For Points only
}

interface CardStackProps {
  items: FeedItem[];
  onStoryTap?: (storyId: string) => void;
  onPointTap?: (pointId: string) => void;
  onLiveButtonClick?: (story: Story) => void;
  onPositionChange?: (pointId: string, position: PositionType | null) => void;
  onBackToList?: () => void;
}

// Map swipe direction to position
function swipeToPosition(direction: SwipeDirection): PositionType | null {
  switch (direction) {
    case 'right': return 'agree'; // +2
    case 'left': return 'disagree'; // -2
    case 'down': return null; // Skip
    default: return null;
  }
}

// Position label for toast
function getPositionLabel(direction: SwipeDirection): string {
  switch (direction) {
    case 'right': return 'Agreed (+2)';
    case 'left': return 'Disagreed (-2)';
    case 'down': return 'Skipped';
    default: return '';
  }
}

export function CardStack({
  items,
  onStoryTap,
  onPointTap,
  onLiveButtonClick,
  onPositionChange,
  onBackToList,
}: CardStackProps) {
  // Track remaining items (not swiped)
  const [remainingItems, setRemainingItems] = useState<FeedItem[]>(items);
  // Track last swipe for undo
  const [lastSwipe, setLastSwipe] = useState<SwipeRecord | null>(null);
  // Toast visibility
  const [showUndoToast, setShowUndoToast] = useState(false);

  // Reset remaining items when items prop changes
  useEffect(() => {
    setRemainingItems(items);
  }, [items]);

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (showUndoToast) {
      const timer = setTimeout(() => {
        setShowUndoToast(false);
        setLastSwipe(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showUndoToast]);

  const handleSwipe = useCallback((direction: SwipeDirection) => {
    if (remainingItems.length === 0) return;

    const topItem = remainingItems[0];

    // Record swipe for undo (Points only)
    if (topItem.type === 'point') {
      const position = swipeToPosition(direction);
      setLastSwipe({
        item: topItem,
        direction,
        position,
      });
      setShowUndoToast(true);

      // Notify parent of position change
      onPositionChange?.(topItem.item.id, position);
    } else {
      // Stories: just dismiss the toast immediately on next swipe
      setShowUndoToast(false);
      setLastSwipe(null);
    }

    // Remove top item
    setRemainingItems(prev => prev.slice(1));
  }, [remainingItems, onPositionChange]);

  const handleUndo = useCallback(() => {
    if (!lastSwipe) return;

    // Add item back to top of stack
    setRemainingItems(prev => [lastSwipe.item, ...prev]);

    // Clear position
    if (lastSwipe.item.type === 'point') {
      onPositionChange?.(lastSwipe.item.item.id, null);
    }

    // Clear undo state
    setShowUndoToast(false);
    setLastSwipe(null);
  }, [lastSwipe, onPositionChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (remainingItems.length === 0) return;

      switch (e.key) {
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          handleSwipe('right');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          handleSwipe('left');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          handleSwipe('down');
          break;
        case 'z':
        case 'Z':
          if ((e.ctrlKey || e.metaKey) && lastSwipe) {
            e.preventDefault();
            handleUndo();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSwipe, handleUndo, remainingItems.length, lastSwipe]);

  const currentIndex = items.length - remainingItems.length;
  const totalCount = items.length;

  // Get content type label for progress
  const getContentTypeLabel = () => {
    const types = items.map(i => i.type);
    const hasStories = types.includes('story');
    const hasPoints = types.includes('point');
    if (hasStories && hasPoints) return 'items';
    if (hasStories) return 'Stories';
    return 'Points';
  };

  // Empty state
  if (remainingItems.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">All caught up!</h2>
        <p className="text-gray-500 mb-6">
          You've seen all {getContentTypeLabel()} from this feed.
        </p>
        {onBackToList && (
          <button
            onClick={onBackToList}
            className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            Back to List View
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col">
      {/* Card stack area */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence>
          {/* Show top 2 cards for stack effect */}
          {remainingItems.slice(0, 2).map((feedItem, index) => (
            <SwipeableCard
              key={feedItem.type === 'story' ? `story-${feedItem.item.id}` : `point-${feedItem.item.id}`}
              item={feedItem.item}
              type={feedItem.type}
              isTopCard={index === 0}
              onSwipe={handleSwipe}
              onStoryTap={onStoryTap}
              onPointTap={onPointTap}
              onLiveButtonClick={onLiveButtonClick}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Progress indicator */}
      <div className="py-3 px-4 text-center text-sm text-gray-500">
        {currentIndex + 1} of {totalCount} {getContentTypeLabel()}
      </div>

      {/* Undo toast */}
      <AnimatePresence>
        {showUndoToast && lastSwipe && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-900 text-white rounded-full shadow-lg">
              <span className="text-sm">{getPositionLabel(lastSwipe.direction)}</span>
              <button
                onClick={handleUndo}
                className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-white/10 rounded-full hover:bg-white/20 transition-colors"
              >
                <Undo2 size={12} />
                Undo
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
