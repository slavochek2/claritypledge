import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveSession } from '@/app/contexts/live-session-context';
import { clearSessionJoiner, getClaritySession } from '@/app/data/api';
import { useTerminateSession } from '@/hooks/use-terminate-session';

/**
 * P511: Global banner shown on all non-/live pages when user has an active session.
 * Allows quick rejoin or ending the session from anywhere in the app.
 */
export function ActiveSessionBanner() {
  const navigate = useNavigate();
  const { activeSessionCode, activeSessionPartnerName, activeSessionRole, clearActiveSession } =
    useLiveSession();
  const terminate = useTerminateSession();
  const [isEnding, setIsEnding] = useState(false);

  if (!activeSessionCode) return null;

  const hasPartner = !!activeSessionPartnerName;
  const displayText = hasPartner
    ? `In session with ${activeSessionPartnerName}`
    : 'Waiting for partner…';

  function handleRejoin() {
    navigate('/live');
  }

  async function handleEndSession() {
    if (isEnding || !activeSessionCode) return;
    setIsEnding(true);
    try {
      const session = await getClaritySession(activeSessionCode);
      if (session) {
        // P1063: mirror the role split that clarity-live-page.tsx:3576 already applies on exit.
        // The creator ENDS the session (complete_clarity_session); a joiner only vacates their
        // own seat (release_joiner_seat) and the creator's session continues — the P769
        // invariant. This banner previously called terminate() for BOTH roles, which meant a
        // joiner could end the creator's session from any page.
        //
        // It also has to change here specifically: complete_clarity_session is no longer
        // executable by `anon`, and a joiner is very often anonymous (guests join with a code
        // and a name, no account). Left as-is, a guest's "End Session" would throw 42501 into
        // the catch below, clear the banner locally, and leave the session untouched on the
        // server — a silent no-op that tells the user the opposite of what happened.
        if (activeSessionRole === 'joiner') {
          await clearSessionJoiner(session.id);
          clearActiveSession();
        } else {
          await terminate(session.id);
        }
      } else {
        clearActiveSession();
      }
    } catch (err) {
      console.error('[ActiveSessionBanner] Failed to end session:', err);
      clearActiveSession();
    } finally {
      setIsEnding(false);
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Active session notification"
      className="relative z-40 bg-blue-50 border-b border-blue-200 px-4 py-2"
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
        {/* Left: pulse dot + session text */}
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full bg-blue-500 motion-safe:animate-pulse motion-reduce:animate-none"
          />
          <span className="text-sm font-medium text-blue-900">
            {displayText}
          </span>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-4 sm:flex-row">
          <button
            type="button"
            onClick={handleRejoin}
            className="w-full sm:w-auto bg-blue-500 text-white text-sm font-medium rounded-md h-8 px-4 hover:bg-blue-600 transition-colors"
          >
            {hasPartner ? 'Rejoin Session' : 'Return to Session'}
          </button>
          <button
            type="button"
            onClick={handleEndSession}
            disabled={isEnding}
            className="text-sm text-destructive hover:underline h-8 px-3 disabled:opacity-50 sm:ml-0 ml-auto"
          >
            {isEnding ? 'Ending…' : 'End Session'}
          </button>
        </div>
      </div>
    </div>
  );
}
