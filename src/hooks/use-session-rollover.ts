import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { DEFAULT_LIVE_STATE, type ClaritySession, type LiveSessionState } from '@/app/types';
import { trackRollover, type RolloverDecision } from '@/lib/session-rollover';

/**
 * P1494: what the live page does once `decideSessionIdChange` says the room code now names another
 * session. Returns a stable function; call it with the decision and the row the code resolves to.
 *
 * 'seat-lost' hands the guest back to the join form. 'follow' starts the creator's page on the new
 * conversation from the new row, carrying nothing local from the previous one (the rating screen,
 * grace period and phase tracking); the id/code refs, the realtime subscription and the joiner
 * refs re-key themselves from `session`.
 */
export function useSessionRollover(
  currentSessionIdRef: MutableRefObject<string | null>,
  confirmedLiveStateRef: MutableRefObject<LiveSessionState>,
  gracePeriodStartRef: MutableRefObject<Date | null>,
  previousPhaseRef: MutableRefObject<string | undefined>,
  setGuestSeatLost: Dispatch<SetStateAction<boolean>>,
  setGracePeriodStart: Dispatch<SetStateAction<Date | null>>,
  setDepartedPartnerName: Dispatch<SetStateAction<string | null>>,
  setIsLocallyRating: Dispatch<SetStateAction<boolean>>,
  setLocalFlowType: Dispatch<SetStateAction<'check' | 'prove'>>,
  setLiveState: Dispatch<SetStateAction<LiveSessionState>>,
  setSession: Dispatch<SetStateAction<ClaritySession | null>>,
  setView: Dispatch<SetStateAction<'start' | 'waiting' | 'live'>>,
  setPendingLiveTransition: Dispatch<SetStateAction<boolean>>,
) {
  return useCallback((decision: RolloverDecision, fresh: ClaritySession) => {
    trackRollover(decision, currentSessionIdRef.current, fresh.id);
    if (decision === 'seat-lost') {
      setGuestSeatLost(true);
      return;
    }
    if (decision !== 'follow') return;
    const nextState = { ...DEFAULT_LIVE_STATE, ...(fresh.liveState ?? {}) } as LiveSessionState;
    gracePeriodStartRef.current = null;
    setGracePeriodStart(null);
    setDepartedPartnerName(null);
    previousPhaseRef.current = undefined;
    setIsLocallyRating(false);
    setLocalFlowType('check');
    setLiveState(nextState);
    confirmedLiveStateRef.current = nextState;
    setSession(fresh);
    // A creator still on the waiting screen moves on through the same mic gate a first joiner uses.
    setView((currentView) => {
      if (currentView === 'waiting' && fresh.joinerName) setPendingLiveTransition(true);
      return currentView;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs and state setters are stable
  }, []);
}
