/**
 * @file fixed-bottom-bar.tsx
 * @description P699: Extracted layout wrapper for the fixed bottom navigation bar
 * used in letter flow and story walk. Replaces repeated inline div with identical
 * className across LetterFlowContent and StoryWalk.
 *
 * P852 Round-H rev4.10: forwardRef so consumers can measure the drawer's
 * rendered height (used by story-rate to reserve matching bottom margin on
 * the story card so the last lines aren't hidden behind the drawer).
 */

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface FixedBottomBarProps {
  children: React.ReactNode;
  className?: string;
}

export const FixedBottomBar = forwardRef<HTMLDivElement, FixedBottomBarProps>(
  function FixedBottomBar({ children, className }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          // P852 Phase-3: bottom padding = max(safe-area-inset, 1rem) so the CTA
          // isn't glued to the viewport edge on desktop (where env() resolves to 0)
          // while still respecting iOS home-indicator inset on notch devices.
          'fixed inset-x-0 bottom-0 z-50 flex flex-col items-center rounded-t-[10px] border bg-background p-4 pb-[max(env(safe-area-inset-bottom),1rem)]',
          className
        )}
      >
        {children}
      </div>
    );
  }
);
