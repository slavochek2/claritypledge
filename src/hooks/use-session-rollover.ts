import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { DEFAULT_LIVE_STATE, type ClaritySession, type LiveSessionState } from '@/app/types';
import { analytics } from '@/lib/mixpanel';
import type { SessionEventsCollector } from '@/lib/session-events-collector';
import { trackRollover, type RolloverDecision } from '@/lib/session-rollover';

/**
 * P1494: what the live page does once `decideSessionIdChange` says the room code now names another
 * session. Returns a stable function; call it with the decision and the row the code resolves to.
 *
 * 'seat-lost' hands the guest back to the join form. 'follow' starts the page (the creator's, or a
 * guest whose claim opened the new session) on the new conversation from the new row, carrying nothing local from the previous one (the rating screen,
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
  isCreatorRef: MutableRefObject<boolean>,
  stopRecording: () => Promise<unknown>,
  sessionCodeForChunks: MutableRefObject<string | null>,
  userNameForChunks: MutableRefObject<string | null>,
  sessionForChunks: MutableRefObject<ClaritySession | null>,
  userForChunks: MutableRefObject<{ id: string; email?: string } | null>,
  eventsCollectorRef: MutableRefObject<SessionEventsCollector>,
) {
  return useCallback((decision: RolloverDecision, fresh: ClaritySession) => {
    trackRollover(decision, currentSessionIdRef.current, fresh.id, isCreatorRef.current);
    if (decision === 'seat-lost') {
      setGuestSeatLost(true);
      return;
    }
    if (decision !== 'follow') return;
    // The new session is private, so nothing recorded in the previous conversation may be
    // finalized or transcribed for this one: drop the recorder without uploading or enqueuing.
    // The references go first, so the last chunk the recorder emits on stop has no code to upload under.
    sessionCodeForChunks.current = null;
    userNameForChunks.current = null;
    sessionForChunks.current = null;
    userForChunks.current = null;
    analytics.unregisterMLCollector();
    eventsCollectorRef.current.reset();
    void stopRecording();
    // Writes already in flight compare against this id and drop their completion.
    currentSessionIdRef.current = fresh.id;
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
  }, [stopRecording]);
}
