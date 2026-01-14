/**
 * @file YourIdeasQueue.tsx
 * @description Queue of ideas from the other person that you need to review.
 * Implements LIFO ordering - newest ideas appear first.
 * After agreeing (right swipe), ideas are "locked" and shown in a separate section.
 */
import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lightbulb, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { SwipeableIdeaCard, LockedIdeaCard } from './SwipeableIdeaCard';
import type { IdeaQueueItem, SwipeAction } from '../../data/mock-data';
import { getInitialYourIdeasQueue, getUserById } from '../../data/mock-data';

interface YourIdeasQueueProps {
  onIdeaActioned?: (ideaId: string, action: SwipeAction) => void;
  partnerName?: string;
}

export function YourIdeasQueue({ onIdeaActioned, partnerName = 'Alice' }: YourIdeasQueueProps) {
  // Active queue (not yet actioned)
  const [queue, setQueue] = useState<IdeaQueueItem[]>(() =>
    getInitialYourIdeasQueue().filter(item => !item.actioned)
  );

  // Locked ideas (agreed with)
  const [lockedIdeas, setLockedIdeas] = useState<IdeaQueueItem[]>([]);

  const handleSwipe = useCallback((ideaId: string, action: SwipeAction) => {
    const idea = queue.find(i => i.id === ideaId);
    if (!idea) return;

    // Remove from queue with animation delay
    setTimeout(() => {
      setQueue(prev => prev.filter(i => i.id !== ideaId));
    }, 200);

    // Handle the action
    switch (action) {
      case 'right': // Agree
        setLockedIdeas(prev => [{
          ...idea,
          actioned: true,
          action: 'right',
          locked: true,
        }, ...prev]);
        toast.success('Position staked!', {
          description: `You agreed with ${partnerName}'s idea`,
        });
        break;

      case 'left': // Dismiss
        toast('Dismissed', {
          description: "Idea removed from your queue",
          icon: '✗',
        });
        break;

      case 'down': // Later
        // Move to bottom of queue
        setQueue(prev => {
          const withoutCurrent = prev.filter(i => i.id !== ideaId);
          return [...withoutCurrent, { ...idea, queuePosition: withoutCurrent.length }];
        });
        toast('Saved for later', {
          description: "Idea moved to the bottom of your queue",
          icon: '⏰',
        });
        return; // Don't call onIdeaActioned for "later"
    }

    onIdeaActioned?.(ideaId, action);
  }, [queue, onIdeaActioned, partnerName]);

  // Empty state
  if (queue.length === 0 && lockedIdeas.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <Lightbulb className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No ideas to review</h3>
        <p className="text-sm text-gray-500 max-w-xs">
          When {partnerName} surfaces ideas for you to verify understanding on, they'll appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4 overflow-hidden">
      {/* Active queue - swipeable cards */}
      {queue.length > 0 && (
        <div className="flex-1 relative min-h-[300px]">
          <AnimatePresence>
            {/* Stack of cards - only render top 3 for performance */}
            {queue.slice(0, 3).map((idea, index) => (
              <motion.div
                key={idea.id}
                className="absolute inset-0"
                initial={{ scale: 1 - index * 0.05, y: index * 8 }}
                animate={{ scale: 1 - index * 0.05, y: index * 8 }}
                style={{ zIndex: queue.length - index }}
              >
                <SwipeableIdeaCard
                  idea={idea}
                  onSwipe={handleSwipe}
                  isTopCard={index === 0}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Queue count indicator */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-50">
            <span className="px-3 py-1 rounded-full bg-white/80 text-sm text-gray-600 shadow-sm">
              {queue.length} {queue.length === 1 ? 'idea' : 'ideas'} to review
            </span>
          </div>
        </div>
      )}

      {/* Queue empty but have locked ideas */}
      {queue.length === 0 && lockedIdeas.length > 0 && (
        <div className="flex items-center justify-center py-8 text-center">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-medium">All ideas reviewed!</span>
          </div>
        </div>
      )}

      {/* Locked ideas section */}
      {lockedIdeas.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            Your agreed positions ({lockedIdeas.length})
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {lockedIdeas.map(idea => (
              <LockedIdeaCard key={idea.id} idea={idea} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
