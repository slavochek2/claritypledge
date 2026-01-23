import { useState, useCallback, useEffect, useRef } from 'react';
import { X, Plus, CheckCircle2, Sparkles, MessageCircle, Bookmark } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { IdeasStoriesProps, Position, StoryIdea } from './types';
import { hasDivergentPositions } from './types';

// Constants
const SWIPE_THRESHOLD_PX = 50;
const KEYBOARD_NAV_DEBOUNCE_MS = 150;

// Progress bar at top (Instagram-style)
function ProgressBar({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex gap-1 px-2 pt-2">
      {Array.from({ length: total }).map((_, idx) => (
        <div
          key={idx}
          data-testid="progress-segment"
          className={cn(
            'h-0.5 flex-1 rounded-full transition-all duration-300',
            idx <= current ? 'bg-white' : 'bg-white/30'
          )}
        />
      ))}
    </div>
  );
}

// Large, prominent position display
function PartnerPositionDisplay({
  name,
  position,
  avatar,
}: {
  name: string;
  position: Position;
  avatar: string;
}) {
  if (!position) return null;

  const config = {
    agree: {
      bg: 'bg-emerald-500/20',
      border: 'border-emerald-500/40',
      text: 'text-emerald-300',
      label: 'agrees with this',
      emoji: '👍',
    },
    disagree: {
      bg: 'bg-red-500/20',
      border: 'border-red-500/40',
      text: 'text-red-300',
      label: 'disagrees with this',
      emoji: '👎',
    },
    unsure: {
      bg: 'bg-amber-500/20',
      border: 'border-amber-500/40',
      text: 'text-amber-300',
      label: 'is unsure about this',
      emoji: '🤔',
    },
  };

  const { bg, border, text, label, emoji } = config[position];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-2xl border',
        bg,
        border
      )}
    >
      <div className="text-2xl">{avatar}</div>
      <div className="flex-1">
        <p className={cn('font-semibold', text)}>{name}</p>
        <p className="text-white/60 text-sm">{label}</p>
      </div>
      <div className="text-2xl">{emoji}</div>
    </motion.div>
  );
}

// Poll-style position buttons (Instagram poll-inspired)
function PositionPoll({
  currentPosition,
  onChange,
}: {
  currentPosition: Position;
  onChange: (pos: Position) => void;
}) {
  const options: { value: 'agree' | 'disagree' | 'unsure'; label: string; emoji: string }[] = [
    { value: 'agree', label: 'I Agree', emoji: '👍' },
    { value: 'disagree', label: 'I Disagree', emoji: '👎' },
    { value: 'unsure', label: 'Not Sure', emoji: '🤔' },
  ];

  return (
    <div className="space-y-2">
      <p className="text-white/50 text-xs text-center mb-3">What's your take?</p>
      {options.map((option) => {
        const isSelected = currentPosition === option.value;
        return (
          <motion.button
            key={option.value}
            whileTap={{ scale: 0.98 }}
            onClick={() => onChange(option.value)}
            aria-label={option.label}
            className={cn(
              'w-full py-3.5 px-4 rounded-xl font-medium transition-all flex items-center justify-between',
              isSelected
                ? option.value === 'agree'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                  : option.value === 'disagree'
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/25'
                    : 'bg-amber-500 text-white shadow-lg shadow-amber-500/25'
                : 'bg-white/10 text-white hover:bg-white/20 border border-white/20'
            )}
          >
            <span className="text-lg">{option.emoji}</span>
            <span>{option.label}</span>
            <span className="w-6" />
          </motion.button>
        );
      })}
    </div>
  );
}

// Verification request banner (J7)
function VerificationRequestBanner({
  partnerName,
  onRespond,
}: {
  partnerName: string;
  onRespond: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-4 mb-4"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
          <MessageCircle size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="text-white font-semibold">
            {partnerName} wants to verify understanding
          </p>
          <p className="text-white/70 text-sm mt-0.5">
            They'll explain your view - rate their accuracy
          </p>
        </div>
      </div>
      <button
        onClick={onRespond}
        aria-label="Respond to verification"
        className="w-full mt-3 py-3 bg-white text-purple-700 rounded-xl font-semibold hover:bg-white/90 transition-colors"
      >
        Let Them Explain
      </button>
    </motion.div>
  );
}

// Empty state
function EmptyState({
  onAddIdea,
  onInsertFromProfile,
}: {
  onAddIdea: () => void;
  onInsertFromProfile?: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black flex flex-col items-center justify-center p-8 text-center">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-6"
      >
        <Sparkles size={40} className="text-white/60" />
      </motion.div>
      <h2 className="text-xl font-semibold text-white mb-2">No ideas yet</h2>
      <p className="text-white/60 mb-8 max-w-xs">
        Surface ideas from your conversation or bring in prepared talking points
      </p>
      <div className="space-y-3 w-full max-w-xs">
        <button
          onClick={onAddIdea}
          aria-label="Add idea"
          className="w-full px-6 py-3.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          Surface New Idea
        </button>
        {onInsertFromProfile && (
          <button
            onClick={onInsertFromProfile}
            aria-label="Insert from profile"
            className="w-full px-6 py-3.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 border border-white/20"
          >
            <Bookmark size={18} />
            From My Ideas
          </button>
        )}
      </div>
    </div>
  );
}

// Main story card
function StoryCard({
  idea,
  hasPendingVerification,
  onPositionChange,
  onVerify,
  onRespondToVerification,
}: {
  idea: StoryIdea;
  hasPendingVerification: boolean;
  onPositionChange: (pos: Position) => void;
  onVerify: () => void;
  onRespondToVerification?: () => void;
}) {
  const showVerifyButton = hasDivergentPositions(idea) && !idea.isVerified && !hasPendingVerification;

  return (
    <div className="flex flex-col h-full px-4 py-4">
      {/* Verification request banner (J7) */}
      {hasPendingVerification && onRespondToVerification && (
        <VerificationRequestBanner
          partnerName={idea.author.name}
          onRespond={onRespondToVerification}
        />
      )}

      {/* Partner position - large and prominent */}
      <div className="mb-6">
        <PartnerPositionDisplay
          name={idea.author.name}
          position={idea.partnerPosition}
          avatar={idea.author.avatar}
        />
      </div>

      {/* Idea text - full screen emphasis */}
      <div className="flex-1 flex items-center">
        <p className="text-2xl font-medium text-white leading-relaxed">
          "{idea.text}"
        </p>
      </div>

      {/* Verified badge */}
      {idea.isVerified && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-4 flex items-center justify-center gap-2 py-3 bg-purple-500/20 rounded-xl border border-purple-500/30"
        >
          <CheckCircle2 className="text-purple-400" size={20} />
          <span className="text-purple-300 font-semibold">Understanding Verified</span>
        </motion.div>
      )}

      {/* Actions */}
      <div className="mt-auto space-y-4">
        {showVerifyButton && (
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={onVerify}
            aria-label="Verify understanding"
            className="w-full py-4 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25"
          >
            <MessageCircle size={20} />
            Check Understanding
          </motion.button>
        )}

        {!idea.isVerified && !hasPendingVerification && (
          <PositionPoll
            currentPosition={idea.myPosition}
            onChange={onPositionChange}
          />
        )}
      </div>
    </div>
  );
}

export function IdeasStories({
  ideas,
  startIndex = 0,
  pendingVerificationRequest,
  onPositionChange,
  onVerify,
  onRespondToVerification,
  onAddIdea,
  onInsertFromProfile,
  onClose,
}: IdeasStoriesProps) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus management: focus close button when modal opens (M1)
  useEffect(() => {
    if (ideas.length > 0) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [ideas.length]);

  // Empty state
  if (ideas.length === 0) {
    return (
      <EmptyState
        onAddIdea={onAddIdea}
        onInsertFromProfile={onInsertFromProfile}
      />
    );
  }

  const currentIdea = ideas[currentIndex];
  const hasPendingVerification = pendingVerificationRequest === currentIdea.id;

  const handleNext = useCallback(() => {
    if (isNavigating) return; // Debounce guard (M3)
    setIsNavigating(true);

    if (currentIndex < ideas.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Auto-close after last story
      onClose();
    }

    // Reset debounce after animation completes
    setTimeout(() => setIsNavigating(false), KEYBOARD_NAV_DEBOUNCE_MS);
  }, [currentIndex, ideas.length, onClose, isNavigating]);

  const handlePrev = useCallback(() => {
    if (isNavigating) return; // Debounce guard (M3)
    setIsNavigating(true);

    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }

    // Reset debounce after animation completes
    setTimeout(() => setIsNavigating(false), KEYBOARD_NAV_DEBOUNCE_MS);
  }, [currentIndex, isNavigating]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;

    if (Math.abs(diff) > SWIPE_THRESHOLD_PX) {
      if (diff > 0) {
        handleNext(); // Swipe left = next
      } else {
        handlePrev(); // Swipe right = prev
      }
    }
    setTouchStart(null);
  };

  const handleTap = (e: React.MouseEvent) => {
    // Only advance if tap is on the background, not on buttons
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    handleNext();
  };

  // Keyboard navigation with debouncing (M3)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, onClose]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black z-50 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Ideas stories viewer"
    >
      {/* Progress bar */}
      <ProgressBar total={ideas.length} current={currentIndex} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-lg">
            {currentIdea.author.avatar}
          </div>
          <div>
            <span className="text-white font-medium text-sm block">
              {currentIdea.author.name === 'You' ? 'Your idea' : `${currentIdea.author.name}'s idea`}
            </span>
            <span className="text-white/50 text-xs">
              {currentIndex + 1} of {ideas.length}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onInsertFromProfile && (
            <button
              onClick={onInsertFromProfile}
              aria-label="Insert from profile"
              className="w-9 h-9 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-colors"
            >
              <Bookmark size={20} />
            </button>
          )}
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Story content with tap/swipe navigation (M2: touch-action prevents scroll bounce) */}
      <div
        data-testid="story-tap-area"
        className="flex-1 overflow-hidden touch-pan-y"
        onClick={handleTap}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIdea.id}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            <StoryCard
              idea={currentIdea}
              hasPendingVerification={hasPendingVerification}
              onPositionChange={(pos) => onPositionChange(currentIdea.id, pos)}
              onVerify={() => onVerify(currentIdea.id)}
              onRespondToVerification={
                onRespondToVerification
                  ? () => onRespondToVerification(currentIdea.id)
                  : undefined
              }
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom hint */}
      <div className="pb-6 text-center">
        <p className="text-white/40 text-xs">Tap to advance · Swipe to navigate</p>
      </div>
    </div>
  );
}
