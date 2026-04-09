/**
 * @file letter-progress-bar.tsx
 * @description P581 Task 9: Segmented progress bar for letter reading flow.
 * Shows completed stories as filled segments, current story with sub-fill.
 */

interface LetterProgressBarProps {
  currentIndex: number;
  totalStories: number;
  /** 0.0–1.0 progress within the current story's phase sequence */
  storyProgress?: number;
}

export function LetterProgressBar({ currentIndex, totalStories, storyProgress = 0 }: LetterProgressBarProps) {
  return (
    <div
      className="flex gap-1 w-full"
      role="progressbar"
      aria-label={`Story ${currentIndex + 1} of ${totalStories}`}
      aria-valuenow={currentIndex + 1}
      aria-valuemin={1}
      aria-valuemax={totalStories}
    >
      {Array.from({ length: totalStories }, (_, i) => {
        if (i < currentIndex) {
          return <div key={i} className="h-1.5 flex-1 rounded-full bg-[#0044CC]" />;
        }
        if (i === currentIndex && storyProgress > 0) {
          return (
            <div key={i} className="h-1.5 flex-1 rounded-full bg-[#1A1A1A]/10 relative overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-[#0044CC] rounded-full transition-[width] duration-300"
                style={{ width: `${storyProgress * 100}%` }}
              />
            </div>
          );
        }
        return <div key={i} className="h-1.5 flex-1 rounded-full bg-[#1A1A1A]/10" />;
      })}
    </div>
  );
}
