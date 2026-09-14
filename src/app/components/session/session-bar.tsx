/**
 * @file session-bar.tsx
 * @description P1307 D7: the ONE cross-page session bar, presentational. Props only — no
 * context, no data fetching — so the /live session and room transcription render the same
 * bar from two thin wrappers (live-session-bar.tsx, room-capture-bar.tsx) instead of two
 * look-alike components drifting apart.
 *
 * Markup and classes are P511's ActiveSessionBanner, moved here unchanged.
 */
import type { ReactNode } from 'react';

export interface SessionBarAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}

export interface SessionBarProps {
  text: ReactNode;
  /** The primary (blue) action — Rejoin / Open. */
  primary: SessionBarAction;
  /** The secondary (destructive text) action — End session. */
  secondary: SessionBarAction;
  ariaLabel: string;
  testId?: string;
  /** The pulsing dot before the text. Off when the text carries its own "●" (UI Contract). */
  showDot?: boolean;
}

export function SessionBar({ text, primary, secondary, ariaLabel, testId, showDot = true }: SessionBarProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      data-testid={testId}
      className="relative z-40 bg-blue-50 border-b border-blue-200 px-4 py-2"
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2">
          {showDot && (
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full bg-blue-500 motion-safe:animate-pulse motion-reduce:animate-none"
            />
          )}
          <span className="text-sm font-medium text-blue-900">{text}</span>
        </div>

        <div className="flex items-center gap-4 sm:flex-row">
          <button
            type="button"
            onClick={primary.onClick}
            disabled={primary.disabled}
            data-testid={primary.testId}
            className="w-full sm:w-auto bg-blue-500 text-white text-sm font-medium rounded-md h-8 px-4 hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {primary.label}
          </button>
          <button
            type="button"
            onClick={secondary.onClick}
            disabled={secondary.disabled}
            data-testid={secondary.testId}
            className="whitespace-nowrap text-sm text-destructive hover:underline h-8 px-3 disabled:opacity-50 sm:ml-0 ml-auto"
          >
            {secondary.label}
          </button>
        </div>
      </div>
    </div>
  );
}
