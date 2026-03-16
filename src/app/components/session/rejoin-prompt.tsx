/**
 * @file rejoin-prompt.tsx
 * @description P511 Task 10: Rejoin prompt shown on /live landing when an active
 * session exists in localStorage. Gives the user a clear path to rejoin or end
 * the stale session.
 */
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

interface RejoinPromptProps {
  /** The 6-character session code */
  sessionCode: string;
  /** Display name of the other participant (partner), if known */
  partnerName: string | null;
  /** The guest's own display name (for guests who joined without auth) */
  guestDisplayName: string | null;
  /** Called when user clicks "Rejoin Session" */
  onRejoin: () => void;
  /** Called when user confirms "End Session" */
  onEndSession: () => void;
  /** Whether a rejoin is currently in progress */
  isRejoining: boolean;
}

/**
 * Card component shown on /live landing when localStorage indicates
 * an active session. Offers "Rejoin" (primary) and "End Session" (destructive).
 *
 * "End Session" uses a two-click confirmation pattern:
 * first click reveals "Are you sure?", second click confirms.
 */
export function RejoinPrompt({
  sessionCode,
  partnerName,
  guestDisplayName,
  onRejoin,
  onEndSession,
  isRejoining,
}: RejoinPromptProps) {
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Focus the card on mount for keyboard accessibility
  useEffect(() => {
    cardRef.current?.focus();
  }, []);

  // Reset end-session confirmation after 4s of inactivity
  useEffect(() => {
    if (!confirmingEnd) return;
    const timer = setTimeout(() => setConfirmingEnd(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmingEnd]);

  const handleEndClick = () => {
    if (confirmingEnd) {
      onEndSession();
    } else {
      setConfirmingEnd(true);
    }
  };

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      className="max-w-md mx-auto p-6 rounded-lg border border-border bg-card shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      role="region"
      aria-label="Active session detected"
    >
      <div className="space-y-4 text-center">
        {/* Heading */}
        <h3 className="text-lg font-semibold">
          Your session is still running
        </h3>

        {/* Partner name + session code */}
        <div className="space-y-1">
          {partnerName && (
            <p className="text-sm text-foreground">
              In session with {partnerName}
            </p>
          )}
          <p className="text-sm text-muted-foreground font-mono">
            {sessionCode}
          </p>
        </div>

        {/* Guest variant: show the name they'll rejoin as */}
        {guestDisplayName && (
          <p className="text-sm text-muted-foreground">
            Rejoin as {guestDisplayName}
          </p>
        )}

        {/* Primary action: Rejoin */}
        <Button
          onClick={onRejoin}
          disabled={isRejoining}
          className="w-full bg-blue-500 hover:bg-blue-600 h-12 text-base"
          size="lg"
        >
          {isRejoining ? 'Rejoining...' : 'Rejoin Session'}
        </Button>

        {/* Destructive action: End Session (two-click confirmation) */}
        <button
          onClick={handleEndClick}
          disabled={isRejoining}
          className="text-sm text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
          aria-label={confirmingEnd ? 'Confirm end session' : 'End session'}
        >
          {confirmingEnd ? 'Are you sure? Click to confirm' : 'End Session'}
        </button>
      </div>
    </div>
  );
}
