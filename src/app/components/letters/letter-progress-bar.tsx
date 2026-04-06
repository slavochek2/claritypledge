/**
 * @file letter-progress-bar.tsx
 * @description P581 Task 9: Segmented progress bar for letter reading flow.
 * Shows completed stories as filled segments.
 */

interface LetterProgressBarProps {
  currentIndex: number;
  totalStories: number;
}

export function LetterProgressBar({ currentIndex, totalStories }: LetterProgressBarProps) {
  return (
    <div
      className="flex gap-1 w-full"
      role="progressbar"
      aria-label={`Story ${currentIndex + 1} of ${totalStories}`}
      aria-valuenow={currentIndex + 1}
      aria-valuemin={1}
      aria-valuemax={totalStories}
    >
      {Array.from({ length: totalStories }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
            i <= currentIndex ? 'bg-[#0044CC]' : 'bg-[#1A1A1A]/10'
          }`}
        />
      ))}
    </div>
  );
}
