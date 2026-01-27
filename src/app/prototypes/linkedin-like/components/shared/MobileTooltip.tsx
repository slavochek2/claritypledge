import { useState, useCallback, useRef } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/** Auto-dismiss delay for click-triggered tooltips (ms) */
const AUTO_DISMISS_MS = 2000;

interface MobileTooltipProps {
  children: React.ReactNode;
  content: string;
  /** Delay before showing on hover (ms) */
  delayDuration?: number;
}

/**
 * Tooltip that works on both desktop (hover) and mobile (tap/click).
 * - Desktop: Shows on hover (standard tooltip behavior)
 * - Mobile/Click: Tap toggles tooltip, auto-dismisses after 2s
 *
 * Works in Chrome DevTools mobile emulation too.
 */
export function MobileTooltip({
  children,
  content,
  delayDuration = 100
}: MobileTooltipProps) {
  const [open, setOpen] = useState(false);
  const [clickLocked, setClickLocked] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // On click: always show for 2s (don't toggle - more predictable UX)
    setOpen(true);
    setClickLocked(true);

    timeoutRef.current = setTimeout(() => {
      setOpen(false);
      setClickLocked(false);
    }, AUTO_DISMISS_MS);
  }, []);

  // Handle hover changes, but don't let hover close a click-opened tooltip
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (clickLocked && !newOpen) {
      // Don't close if we're in click-lock period
      return;
    }
    setOpen(newOpen);
  }, [clickLocked]);

  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip open={open} onOpenChange={handleOpenChange}>
        <TooltipTrigger asChild>
          <span
            onClick={handleClick}
            className="cursor-pointer"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick(e as unknown as React.MouseEvent);
              }
            }}
          >
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
