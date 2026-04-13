/**
 * @file fixed-bottom-bar.tsx
 * @description P699: Extracted layout wrapper for the fixed bottom navigation bar
 * used in letter flow and story walk. Replaces repeated inline div with identical
 * className across LetterFlowContent and StoryWalk.
 */

import { cn } from '@/lib/utils';

interface FixedBottomBarProps {
  children: React.ReactNode;
  className?: string;
}

export function FixedBottomBar({ children, className }: FixedBottomBarProps) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 flex flex-col items-center rounded-t-[10px] border bg-background p-4',
        className
      )}
    >
      {children}
    </div>
  );
}
