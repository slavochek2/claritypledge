/**
 * @file room-capture-pause.ts
 * @description The one pause/resume rule applied to a running capture (P1307 D3, P1388), split out of room-capture-context.tsx
 * (its size limit), unchanged.
 */
import { useEffect, type Dispatch } from 'react';
import { decidePauseTransition, type CaptureAction, type CaptureState } from './room-capture-core';

export function usePauseResume(
  state: CaptureState,
  pauseLocation: boolean,
  explainBackHolds: number,
  liveSessionActive: boolean,
  manualPaused: boolean,
  userResumed: boolean,
  setUserResumed: (v: boolean) => void,
  pauseMedia: () => void,
  resumeMedia: (roomId: string) => Promise<void>,
  dispatch: Dispatch<CaptureAction>,
): void {
  useEffect(() => {
    const { phase, roomId } = state;
    if (!roomId) return;
    const transition = decidePauseTransition({ phase, pauseLocation, explainBackHolds, liveSessionActive, manualPaused, userResumed });
    // A Resume answers the pause it was tapped on; a later automatic pause (/live, an
    // explain-back) must not inherit it (adversarial review, HIGH).
    if (userResumed && (pauseLocation || explainBackHolds > 0)) setUserResumed(false);
    if (transition === 'pause') {
      dispatch({ type: 'PAUSE_REQUESTED', reason: manualPaused ? 'manual' : pauseLocation ? 'location' : 'explain-back' });
      pauseMedia();
    } else if (transition === 'resume') {
      dispatch({ type: 'RESUME_REQUESTED' });
      void resumeMedia(roomId);
    }
  }, [state, pauseLocation, explainBackHolds, liveSessionActive, manualPaused, userResumed, setUserResumed, pauseMedia, resumeMedia, dispatch]);

}
