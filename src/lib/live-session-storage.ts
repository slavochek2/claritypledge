import type { Dispatch, SetStateAction } from 'react';
import { getClaritySession } from '@/app/data/api';
import { DEFAULT_LIVE_STATE, type ClaritySession, type LiveSessionState } from '@/app/types';

/** Session persistence keys (per-tab using sessionStorage instead of localStorage) */
export const STORAGE_KEYS = {
  SESSION_CODE: 'clarity_live_session_code',
  SESSION_ID: 'clarity_live_session_id',
  USER_NAME: 'clarity_live_user_name',
  IS_CREATOR: 'clarity_live_is_creator',
} as const;

/** Use sessionStorage for tab-isolated storage (each tab has its own session data) */
export const storage = typeof window !== 'undefined' ? window.sessionStorage : null;

export const clearStoredSession = () => {
  storage?.removeItem(STORAGE_KEYS.SESSION_CODE);
  storage?.removeItem(STORAGE_KEYS.SESSION_ID);
  storage?.removeItem(STORAGE_KEYS.USER_NAME);
  storage?.removeItem(STORAGE_KEYS.IS_CREATOR);
};

type RestoreStep = 'transition' | 'waiting' | 'clear';

/** Where a restored session goes: straight to the live view, the waiting room, or nowhere. */
function nextStepAfterRestore(restored: ClaritySession, wasCreator: boolean): RestoreStep {
  const liveState = restored.liveState as Record<string, unknown> | null;
  const ended = liveState?.sessionEnded === true || liveState?.joinerEnded === true;
  if (restored.joinerName) return ended ? 'clear' : 'transition';
  return wasCreator ? 'waiting' : 'clear';
}


/**
 * HIGH #6: restore the session from sessionStorage on mount (moved out of the live page unchanged).
 * Skipped when the user joins via link to a different code (the link takes priority). The code is
 * the key, so a creator whose stored session was replaced under the same code lands on the new row.
 */
export async function restoreLiveSession(
  isJoinViaLink: boolean,
  urlCode: string | undefined,
  setSession: Dispatch<SetStateAction<ClaritySession | null>>,
  setName: Dispatch<SetStateAction<string>>,
  setIsCreator: Dispatch<SetStateAction<boolean>>,
  setLiveState: Dispatch<SetStateAction<LiveSessionState>>,
  setPendingLiveTransition: Dispatch<SetStateAction<boolean>>,
  setView: Dispatch<SetStateAction<'start' | 'waiting' | 'live'>>,
  setIsRestoring: Dispatch<SetStateAction<boolean>>,
): Promise<void> {
  try {
    // If user clicked a join link (/live/ABCD12), check if it matches the stored session.
    // Same code = guest refreshed mid-session → restore. Different code = new session intent → clear.
    if (isJoinViaLink) {
      const savedCode = storage?.getItem(STORAGE_KEYS.SESSION_CODE);
      if (savedCode && savedCode.toUpperCase() === urlCode?.toUpperCase()) {
        // Same session — fall through to restoration below
      } else {
        clearStoredSession(); // Different session — clear old data
        setIsRestoring(false);
        return;
      }
    }

    const savedCode = storage?.getItem(STORAGE_KEYS.SESSION_CODE);
    const savedName = storage?.getItem(STORAGE_KEYS.USER_NAME);
    const savedIsCreator = storage?.getItem(STORAGE_KEYS.IS_CREATOR);

    if (savedCode && savedName) {
      const restoredSession = await getClaritySession(savedCode);

      if (restoredSession) {
        setSession(restoredSession);
        setName(savedName);
        setIsCreator(savedIsCreator === 'true');

        // Sync live state from session
        if (restoredSession.liveState) {
          setLiveState({ ...DEFAULT_LIVE_STATE, ...restoredSession.liveState } as LiveSessionState);
        }

        // Determine view based on session state
        // B48: Use pendingLiveTransition to trigger mic permission gate
        const next = nextStepAfterRestore(restoredSession, savedIsCreator === 'true');
        if (next === 'transition') setPendingLiveTransition(true);
        if (next === 'waiting') setView('waiting');
        // Ended session, or a joiner without a session: don't restore into the live view
        if (next === 'clear') clearStoredSession();
      } else {
        // Session expired or invalid
        clearStoredSession();
      }
    }
  } catch (err) {
    console.error('[Live] Failed to restore session:', err);
    clearStoredSession();
  } finally {
    setIsRestoring(false);
  }
}
