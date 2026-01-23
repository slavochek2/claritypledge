/**
 * @file SwipeHint.tsx
 * @description Visual hint showing swipe directions for Card View.
 * Shows on first card, fades after user starts interacting.
 */
import { ThumbsDown, ThumbsUp, ArrowDown } from 'lucide-react';

interface SwipeHintProps {
  type: 'story' | 'point';
  visible?: boolean;
}

export function SwipeHint({ type, visible = true }: SwipeHintProps) {
  if (!visible) return null;

  if (type === 'story') {
    return (
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
        <div className="text-center p-4 bg-black/50 rounded-lg backdrop-blur-sm">
          <p className="text-white text-sm font-medium mb-2">
            Swipe any direction
          </p>
          <p className="text-white/70 text-xs">
            for next story
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {/* Left hint - Disagree */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 text-red-500/70">
        <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
          <ThumbsDown size={20} />
        </div>
        <span className="text-xs font-medium">← Disagree</span>
      </div>

      {/* Right hint - Agree */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 text-green-500/70">
        <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
          <ThumbsUp size={20} />
        </div>
        <span className="text-xs font-medium">Agree →</span>
      </div>

      {/* Bottom hint - Skip */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-gray-500/70">
        <span className="text-xs font-medium">Skip ↓</span>
        <div className="w-10 h-10 rounded-full bg-gray-500/20 flex items-center justify-center">
          <ArrowDown size={20} />
        </div>
      </div>
    </div>
  );
}
