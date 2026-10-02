/**
 * @file live-session-bar.tsx
 * @description P511: the bar shown on non-/live pages while a /live session is active —
 * quick rejoin or end from anywhere in the app. P1307 D7 moved its markup into the shared
 * presentational SessionBar; the behaviour below is ActiveSessionBanner's, unchanged.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveSession } from '@/app/contexts/live-session-context';
import { clearSessionJoiner, getClaritySession } from '@/app/data/api';
import { useTerminateSession } from '@/hooks/use-terminate-session';
import { SessionBar } from './session-bar';
import { ArrowRight, Square } from 'lucide-react';
import { useConnectivity } from '@/app/contexts/offline-status-context';

/** P1369 UI Contract. [FOUNDER DECISION: copy — PROPOSED] */
const OFFLINE_TITLE = 'Session paused while offline';
const OFFLINE_DETAIL = 'Rejoin comes back when you reconnect.';

export function LiveSessionBar() {
  const navigate = useNavigate();
  const { activeSessionCode, activeSessionPartnerName, activeSessionRole, clearActiveSession } =
    useLiveSession();
  const terminate = useTerminateSession();
  const [isEnding, setIsEnding] = useState(false);
  const { offline } = useConnectivity();

  if (!activeSessionCode) return null;

  // P1369: offline, Rejoin / End cannot work — the bar turns into its grey offline state.
  if (offline) {
    return <SessionBar tone="offline" ariaLabel="Active session notification" text={OFFLINE_TITLE} detail={OFFLINE_DETAIL} />;
  }

  const hasPartner = !!activeSessionPartnerName;

  async function handleEndSession() {
    if (isEnding || !activeSessionCode) return;
    setIsEnding(true);
    try {
      const session = await getClaritySession(activeSessionCode);
      if (session) {
        // P1063: mirror the role split that clarity-live-page.tsx already applies on exit.
        // The creator ENDS the session (complete_clarity_session); a joiner only vacates their
        // own seat (release_joiner_seat) and the creator's session continues — the P769
        // invariant. Calling terminate() for BOTH roles let a joiner end the creator's session
        // from any page, and threw 42501 for an anonymous guest (complete_clarity_session is
        // not executable by anon), clearing the banner while leaving the session untouched.
        if (activeSessionRole === 'joiner') {
          await clearSessionJoiner(session.id, activeSessionCode);
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

  // P1388 (founder, 2026-10-02): the same short bar as room capture — one line, the status in
  // a few words, the two controls as icons. Accessible names keep the long labels.
  const rejoin = hasPartner ? 'Rejoin Session' : 'Return to Session';
  return (
    <div role="status" aria-label="Active session notification" data-testid="live-session-bar"
      className="relative z-40 bg-blue-50 border-b border-blue-200 px-4 py-1">
      <div className="max-w-4xl mx-auto flex items-center gap-2">
        <span className="text-sm font-medium text-blue-900 truncate min-w-0">
          {hasPartner ? `● In session with ${activeSessionPartnerName}` : 'Waiting for partner…'}
        </span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => void handleEndSession()} disabled={isEnding}
            aria-label={isEnding ? 'Ending…' : 'End Session'}
            className="inline-flex items-center justify-center h-10 w-10 rounded-md border border-blue-300 bg-white text-blue-900 hover:text-destructive hover:bg-destructive/5 focus-visible:text-destructive active:text-destructive active:bg-destructive/10 disabled:opacity-50">
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => navigate('/live')} aria-label={rejoin}
            className="inline-flex items-center justify-center h-10 w-10 rounded-md border border-blue-300 bg-white text-blue-900 hover:bg-blue-100">
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
