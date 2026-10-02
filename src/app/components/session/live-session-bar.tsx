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
import { SessionGoButton, SessionStopButton } from './capture-controls';
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

  return (
    <SessionBar
      ariaLabel="Active session notification"
      text={hasPartner ? `In session with ${activeSessionPartnerName}` : 'Waiting for partner…'}
      // P1388: the same compact row as the room-capture bar — stop first, navigation apart at
      // the end, equal weight, no full-width primary. Labels unchanged.
      extra={
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <SessionStopButton label={isEnding ? 'Ending…' : 'End Session'} onClick={() => void handleEndSession()} disabled={isEnding} />
          <SessionGoButton label={hasPartner ? 'Rejoin Session' : 'Return to Session'} onClick={() => navigate('/live')} />
        </div>
      }
    />
  );
}
