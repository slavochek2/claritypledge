/**
 * @file ChatContextHeader.tsx
 * @description P467: Slim sticky context header for /chat page.
 * Shows point text (truncated, expandable) + 1st-person position chip + open-in-point link.
 * Replaces PointCardWithLinks in the chat header — no share, no position buttons.
 * (P803, 2026-09-02: StoryGuideChat, the original host, was deleted as dead code.
 *  This component is still live — imported by create-story-page.tsx.)
 *
 * Height: ~48px (sticky top-16, below app nav bar).
 * Expands to auto height when user taps the text region.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Pin, ExternalLink } from 'lucide-react';

type UserPosition = 'agree' | 'disagree' | 'unsure' | null | undefined;

interface ChatContextHeaderProps {
  pointId: string;
  pointText: string;
  userPosition?: UserPosition;
  /** When false, renders static (not sticky). Default true for backward compat with /chat. */
  sticky?: boolean;
  /** Optional visibility indicator rendered below the header content */
  visibilityLine?: React.ReactNode;
}

function getPositionLabel(position: UserPosition): string | null {
  if (!position) return null;
  if (position === 'agree') return 'You agree';
  if (position === 'disagree') return 'You disagree';
  if (position === 'unsure') return "You're unsure";
  return null;
}

export function ChatContextHeader({ pointId, pointText, userPosition, sticky = true, visibilityLine }: ChatContextHeaderProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const textRef = useRef<HTMLElement>(null);

  const positionLabel = getPositionLabel(userPosition);

  // Detect whether text is actually truncated (overflows single line)
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;

    // scrollWidth > clientWidth indicates overflow (truncation)
    const checkTruncation = () => {
      if (!isExpanded) {
        setIsTruncated(el.scrollWidth > el.clientWidth);
      }
    };

    checkTruncation();

    const observer = new ResizeObserver(checkTruncation);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pointText, isExpanded]);

  const handleTextToggle = () => {
    if (isTruncated || isExpanded) {
      setIsExpanded(prev => !prev);
    }
  };

  const handleTextKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleTextToggle();
    }
  };

  return (
    <div
      data-testid="chat-context-header"
      className={`${sticky ? 'sticky top-[calc(4rem+env(safe-area-inset-top))] z-10' : ''} bg-background border-b border-border`}
    >
      <div className="px-4 flex items-center gap-2 py-2 min-h-[48px]">
        {/* Pin icon */}
        <Pin
          size={16}
          className="flex-shrink-0 text-muted-foreground"
          aria-hidden="true"
        />

        {/* Point text — truncated by default, expandable on tap when text overflows */}
        {isTruncated || isExpanded ? (
          <div
            ref={textRef as unknown as React.RefObject<HTMLDivElement>}
            data-testid="point-text-toggle"
            role="button"
            aria-expanded={isExpanded}
            aria-label="Point text — tap to expand"
            tabIndex={0}
            onClick={handleTextToggle}
            onKeyDown={handleTextKeyDown}
            className={`flex-1 min-w-0 text-sm text-foreground leading-snug cursor-pointer select-none${
              isExpanded ? '' : ' truncate'
            }`}
          >
            {pointText}
          </div>
        ) : (
          <p
            ref={textRef as unknown as React.RefObject<HTMLParagraphElement>}
            className="flex-1 min-w-0 text-sm text-foreground leading-snug truncate"
          >
            {pointText}
          </p>
        )}

        {/* 1st-person position chip */}
        {positionLabel && (
          <span
            data-testid="position-chip"
            aria-label={`Your position: ${positionLabel}`}
            className="flex-shrink-0 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground font-medium"
          >
            {positionLabel}
          </span>
        )}

        {/* Open point detail link */}
        <Link
          to={`/point/${pointId}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open point detail"
          className="flex-shrink-0 flex items-center justify-center w-11 h-11 -mr-3 -my-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink size={16} aria-hidden="true" />
        </Link>
      </div>
      {visibilityLine && (
        <div className="px-4 pb-2">
          {visibilityLine}
        </div>
      )}
    </div>
  );
}
