import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveSession } from '@/app/contexts/live-session-context';
import { getClaritySession, endClaritySession, cancelLiveInvite } from '@/app/data/api';

/**
 * P511: Global banner shown on all non-/live pages when user has an active session.
 * Allows quick rejoin or ending the session from anywhere in the app.
 */
export function ActiveSessionBanner() {
  const navigate = useNavigate();
  const { activeSessionCode, activeSessionPartnerName, clearActiveSession } = useLiveSession();
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

    let session: Awaited<ReturnType<typeof getClaritySession>> = null;
    try {
      session = await getClaritySession(activeSessionCode);
      if (session) {
        await endClaritySession(session.id);
      }
    } catch (err) {
      console.error('[ActiveSessionBanner] Failed to end session:', err);
    } finally {
      // Cancel invite regardless of whether endClaritySession succeeded — re-enables Start button
      if (session?.targetListenerId) {
        try { await cancelLiveInvite(session.id); } catch { /* best effort */ }
      }
      clearActiveSession();
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
