import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/** Auto-dismiss delay for long-press triggered tooltips (ms) */
const AUTO_DISMISS_MS = 2000;
/** Long-press threshold (ms) — triggers tooltip instead of click */
const LONG_PRESS_MS = 500;

interface MobileTooltipProps {
  children: React.ReactNode;
  content: string;
  /** Delay before showing on hover (ms) */
  delayDuration?: number;
}

/**
 * Tooltip that works on both desktop (hover) and mobile (long-press).
 * - Desktop: Shows on hover (standard tooltip behavior)
 * - Mobile: Long-press shows tooltip for 2s; normal taps pass through to children
 *
 * Does NOT wrap children in a <span role="button"> — children remain the
 * interactive element. This avoids nested-interactive and click-swallowing issues.
 *
 * Ported from prototype for production use (P126).
 */
export function MobileTooltip({
  children,
  content,
  delayDuration = 100
}: MobileTooltipProps) {
  const [open, setOpen] = useState(false);
  const [clickLocked, setClickLocked] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (longPressRef.current) clearTimeout(longPressRef.current);
    };
  }, []);

  const showTooltip = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
    setClickLocked(true);
    timeoutRef.current = setTimeout(() => {
      setOpen(false);
      setClickLocked(false);
    }, AUTO_DISMISS_MS);
  }, []);

  // Long-press handlers for mobile tooltip trigger
  const handlePointerDown = useCallback(() => {
    longPressTriggered.current = false;
    longPressRef.current = setTimeout(() => {
      longPressTriggered.current = true;
      showTooltip();
    }, LONG_PRESS_MS);
  }, [showTooltip]);

  const handlePointerUp = useCallback(() => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
  }, []);

  // Handle hover changes, but don't let hover close a long-press-opened tooltip
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (clickLocked && !newOpen) return;
    setOpen(newOpen);
  }, [clickLocked]);

  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip open={open} onOpenChange={handleOpenChange}>
        <TooltipTrigger asChild>
          <span
            className="inline-flex"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
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
