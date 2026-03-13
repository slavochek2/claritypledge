/**
 * @file RatingDots.tsx
 * @description Reusable component to display a rating as filled/empty dots (1-10 scale).
 * Used in Live sessions and verification status panels.
 */

interface RatingDotsProps {
  rating: number;
  size?: 'sm' | 'md';
  showNumber?: boolean;
}

export function RatingDots({ rating, size = 'sm', showNumber = true }: RatingDotsProps) {
  const filledDots = Math.min(10, Math.max(0, Math.round(rating)));
  const emptyDots = 10 - filledDots;

  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  const gap = size === 'sm' ? 'gap-0.5' : 'gap-0.5';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div className="flex items-center gap-1.5">
      <div className={`flex ${gap}`}>
        {Array.from({ length: filledDots }).map((_, i) => (
          <span key={`filled-${i}`} className={`${dotSize} rounded-full bg-foreground`} />
        ))}
        {Array.from({ length: emptyDots }).map((_, i) => (
          <span key={`empty-${i}`} className={`${dotSize} rounded-full bg-muted-foreground/30`} />
        ))}
      </div>
      {showNumber && (
        <span className={`${textSize} font-medium tabular-nums text-muted-foreground`}>{rating}</span>
      )}
    </div>
  );
}

// Pending state - when someone hasn't rated yet
export function RatingDotsPending({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div className="flex items-center gap-1.5">
      <span className={`${dotSize} bg-blue-500 rounded-full animate-pulse`} />
      <span className={`${textSize} text-muted-foreground italic`}>Pending</span>
    </div>
  );
}
