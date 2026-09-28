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
 *
 * P1364 — like FocusHeader, it takes `fallback` and calls `useGoBack(fallback)` itself, so a
 * page that renders both gets one behaviour. `onBack` remains for allowlisted in-flow cases.
 */
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGoBack } from '@/app/hooks/use-go-back';

export const DEFAULT_BOTTOM_BACK_LABEL = 'Go back from the end of the page';

type BottomBackButtonProps = {
  testId?: string;
  className?: string;
  /** Accessible name. Must contain the visible words "Go back". */
  ariaLabel?: string;
} & (
  | { fallback: string; onBack?: never }
  | { onBack: () => void; fallback?: never }
);

export function BottomBackButton({
  fallback,
  onBack,
  testId,
  className,
  ariaLabel = DEFAULT_BOTTOM_BACK_LABEL,
}: BottomBackButtonProps) {
  const goBack = useGoBack(fallback ?? '/');
  return (
    <div className={cn('mt-8 flex justify-center', className)} data-testid={testId}>
      <button
        type="button"
        onClick={onBack ?? goBack}
        aria-label={ariaLabel}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-blue-200 bg-card px-5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-950/40"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Go back
      </button>
    </div>
  );
}

/**
 * Bottom padding for the pill on pages that keep the fixed mobile bottom nav (/story, /point).
 * The layout's `pb-20` (5rem) is less than the nav's 4rem plus the iOS home-indicator inset,
 * so without this the pill can sit under the nav.
 */
export const CLEAR_BOTTOM_NAV = 'pb-[calc(1rem+env(safe-area-inset-bottom))] lg:pb-0';
