/**
 * @file bottom-back-button.tsx
 * @description The "Go back" pill at the end of a page, so the only way out is not at the top.
 *
 * Design is /stake's bottom back (main, P1296 item 5). Founder: "at the bottom of the page put
 * back button as a CTA. Go back. That's cool because otherwise people feel stuck and the only
 * CTA is at the top." Outline, blue, sized to its label — a way out, not the page's action.
 *
 * Its accessible name differs from the header's "Go back" and contains the visible words, so a
 * screen-reader user can tell the two apart and a voice user can still say what they see.
 */
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomBackButtonProps {
  onBack: () => void;
  testId?: string;
  className?: string;
}

export function BottomBackButton({ onBack, testId, className }: BottomBackButtonProps) {
  return (
    <div className={cn('mt-8 flex justify-center', className)} data-testid={testId}>
      <button
        type="button"
        onClick={onBack}
        aria-label="Go back from the end of the page"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-blue-200 bg-card px-5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-950/40"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Go back
      </button>
    </div>
  );
}
