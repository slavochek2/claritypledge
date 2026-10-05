/**
 * @file session-bar.tsx
 * @description P1307 D7: the ONE cross-page session bar, presentational. P1369 adds its offline
 * state as a `tone`, not as a second component (the spec: "actions become optional"). Props only — no
 * context, no data fetching — so the /live session and room transcription render the same
 * bar from two thin wrappers (live-session-bar.tsx, room-capture-bar.tsx) instead of two
 * look-alike components drifting apart.
 *
 * Markup and classes are P511's ActiveSessionBanner, moved here unchanged.
 */
import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';

export interface SessionBarAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  /** Read by assistive tech and shown on hover; keeps the bar to one line (P1388). */
  description?: string;
}

export interface SessionBarProps {
  text: ReactNode;
  /** The primary (blue) action — Rejoin / Open. Optional: the offline state may have none. */
  primary?: SessionBarAction;
  /** The secondary (destructive text) action — End session / Stop microphone. Optional. */
  secondary?: SessionBarAction;
  ariaLabel: string;
  testId?: string;
  /** The pulsing dot before the text. Off when the text carries its own "●" (UI Contract). */
  showDot?: boolean;
  /**
   * P1369 (variant C): `offline` is this SAME bar's offline state — grey, a title plus one line
   * (`detail`), and only the actions that still work without a connection. It REPLACES the
   * normal bar while offline (never stacked; P1307 D7 requires one bar).
   */
  /**
   * 'idle' (P1337): nothing is running — the short bar's quiet form, one outlined action (the
   * event room's "Transcribe"). Same single line as 'live' (P1388: no second line), no pulsing dot.
   */
  tone?: 'live' | 'offline' | 'idle';
  /** The offline state's second line, under the text. */
  detail?: ReactNode;
  /** P1388: inline after the text — the room-capture bar's level meter and ⓘ. */
  adornment?: ReactNode;
  /** P1388: an extra control placed before the primary — the room-capture bar's Pause/Resume. */
  extra?: ReactNode;
}

const END_BUTTON_CLASS =
  'flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/5 focus-visible:text-destructive focus-visible:bg-destructive/5 rounded-lg h-9 px-3 transition-colors disabled:opacity-50 sm:ml-0 ml-auto';

export function SessionBar({
  text,
  primary,
  secondary,
  ariaLabel,
  testId,
  showDot = true,
  tone = 'live',
  detail,
  adornment,
  extra,
}: SessionBarProps) {
  const offline = tone === 'offline';
  const idle = tone === 'idle';
  const hasActions = !!primary || !!secondary || !!extra;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      // Offline keeps the ids the offline state has always had, so tests and callers can tell the two apart.
      data-testid={offline ? (testId ? `${testId}-offline` : 'session-bar-offline') : testId}
      className={
        offline
          ? 'relative z-40 bg-slate-100 border-b border-slate-200 px-4 py-2'
          : idle
            ? 'relative z-40 bg-slate-50 border-b border-slate-200 px-4 py-2'
            : 'relative z-40 bg-blue-50 border-b border-blue-200 px-4 py-2'
      }
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
        {offline ? (
          <div>
            <div className="text-sm font-medium text-slate-800">{text}</div>
            {detail && <div className="text-xs text-slate-600">{detail}</div>}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {showDot && !idle && (
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full bg-blue-500 motion-safe:animate-pulse motion-reduce:animate-none"
              />
            )}
            <span className={idle ? 'text-sm font-medium text-slate-700' : 'text-sm font-medium text-blue-900'}>{text}</span>
            {adornment}
          </div>
        )}

        {hasActions && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:flex-row sm:flex-nowrap">
            {/* P1388: wraps rather than overflows — at 320px Pause + Open + Stop transcribing do
                not fit one row, and the stop control was pushed off-screen. */}
            {extra}
            {primary && (
              <button
                type="button"
                onClick={primary.onClick}
                disabled={primary.disabled}
                data-testid={primary.testId}
                title={primary.description}
                aria-description={primary.description}
                className={
                  idle
                    ? 'w-full sm:w-auto border border-blue-300 bg-white text-blue-700 text-sm font-medium rounded-md h-8 px-4 hover:bg-blue-50 transition-colors disabled:opacity-50'
                    : 'w-full sm:w-auto bg-blue-500 text-white text-sm font-medium rounded-md h-8 px-4 hover:bg-blue-700 transition-colors disabled:opacity-50'
                }
              >
                {primary.label}
              </button>
            )}
            {/* P1323 R7: ONE End treatment across all four controls. This was the only one
                red AT REST, and it is the one that persists on every page for the whole
                session, immediately beside a blue primary — which is where destructive-red is
                wrong. Red at the MOMENT OF ACTION is right, so it moves to hover and focus.
                The other three (/live's in-session banner, /transcribe's header) already
                shared exactly this: neutral at rest, destructive on hover, LogOut icon, h-9.
                This reaches BOTH SessionBar consumers on purpose — the room-capture bar and
                ActiveSessionBanner (the cross-page /live bar). Parameterising so only one
                changed would invent the fourth treatment this requirement exists to remove. */}
            {secondary && (
              <button
                type="button"
                onClick={secondary.onClick}
                disabled={secondary.disabled}
                data-testid={secondary.testId}
                className={END_BUTTON_CLASS}
              >
                <LogOut className="h-4 w-4" />
                {secondary.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
