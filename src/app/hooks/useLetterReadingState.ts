/**
 * @file useLetterReadingState.ts
 * @description P673: State machine for letter reading flow (rewritten from P581).
 * Manages current story index, phase per story, ratings, positions, and predictions.
 * Forward-only: once a rating is submitted, cannot go back.
 * Persists to sessionStorage for resume + anonymous 1-to-many flow.
 *
 * Phase machine per story (Decision 4):
 * - 2+ visible points: point-engage → point-revealed → story-rate → story-revealed → remaining-point-engage/revealed → transition
 * - 1 visible point (D36): story-rate → story-revealed → point-engage → point-revealed → transition
 * - 0 visible points: story-rate → story-revealed → transition
 *
 * P684: Added local-only mode for anonymous one-to-many reading.
 * In local mode: no RPC calls, state mirrored to localStorage, hydrated on mount.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { LetterStorySnapshot } from '@/app/types';
import { snapshotToStoryWithPoints } from '@/app/utils/letter-snapshot-mapper';
import {
  submitRating,
  revealPrediction,
  submitPointResponse,
  updateDeliveryStatus,
  updateDeliveryStatusByToken,
  submitPointResponseByToken,
  submitRatingByToken,
  revealPredictionByToken,
} from '@/app/data/letters-service';

// ============================================================================
// TYPES
// ============================================================================

export type StoryPhase =
  | 'point-engage'          // Show point card, receiver positions
  | 'point-revealed'        // Show sender's position + gap for current point
  | 'story-rate'            // Story card visible + Drawer with rating
  | 'story-revealed'        // JourneyToUnderstanding + GapBanner above story
  | 'remaining-point-engage'  // Next point card (after story)
  | 'remaining-point-revealed' // Sender's position + gap for remaining point
  | 'transition';           // Story complete, Continue/Complete button

export interface StoryState {
  phase: StoryPhase;
  rating: number | null;
  prediction: number | null;
  positions: Record<string, string>; // pointId -> position
  currentPointIndex: number; // which point we're on (for multi-point flows)
}

export interface LetterReadingState {
  currentStoryIndex: number;
  stories: StoryState[];
  isComplete: boolean;
}

export interface UseLetterReadingStateReturn {
  state: LetterReadingState;
  currentPhase: StoryPhase;
  /** Submit position for a point in the current story */
  submitPointPosition: (pointId: string, position: string) => Promise<void>;
  /** Submit rating for current story */
  submitStoryRating: (rating: number) => Promise<void>;
  /** Advance from point-revealed to next phase (story-rate or next point) */
  advanceFromPointReveal: () => void;
  /** Advance from story-revealed to next phase (remaining points or transition) */
  advanceFromStoryReveal: () => void;
  /** Advance from remaining-point-revealed to next remaining point or transition */
  advanceFromRemainingPointReveal: () => void;
  /** Move to next story */
  nextStory: () => void;
  /** Whether we're loading a DB operation */
  isSubmitting: boolean;
  /**
   * P684 local mode only: true when the final point has been positioned and
   * the reading page should render the signup form. Always false in remote mode.
   */
  isLocalCompleted: boolean;
  /**
   * True when submitPointResponseByToken returned false (RPC rejected the point).
   * Parent should render the expired-token view. Only set in remote mode with token.
   */
  tokenExpired: boolean;
}

// ============================================================================
// LOCAL-MODE localStorage (full state, same shape as remote)
// ============================================================================

function localStateKey(letterId: string): string {
  return `p684_letter_state:${letterId}`;
}

export function loadLocalState(letterId: string): LetterReadingState | null {
  try {
    const raw = localStorage.getItem(localStateKey(letterId));
    if (!raw) return null;
    return JSON.parse(raw) as LetterReadingState;
  } catch {
    return null;
  }
}

function saveLocalState(letterId: string, state: LetterReadingState): void {
  try {
    localStorage.setItem(localStateKey(letterId), JSON.stringify(state));
  } catch {
    // Storage full or unavailable — continue without persistence
  }
}

// ============================================================================
// STORAGE (remote-mode sessionStorage)
// ============================================================================

function storageKey(deliveryId: string): string {
  return `clarity-letter-reading-${deliveryId}`;
}

function saveState(deliveryId: string, state: LetterReadingState): void {
  const json = JSON.stringify(state);
  try {
    sessionStorage.setItem(storageKey(deliveryId), json);
  } catch {
    // Storage full or unavailable — continue without persistence
  }
  try {
    localStorage.setItem(storageKey(deliveryId), json);
  } catch {
    // localStorage full or unavailable — sessionStorage still works for in-tab
  }
}

export function loadState(deliveryId: string): LetterReadingState | null {
  try {
    const raw =
      sessionStorage.getItem(storageKey(deliveryId)) ??
      localStorage.getItem(storageKey(deliveryId));
    if (!raw) return null;
    return JSON.parse(raw) as LetterReadingState;
  } catch {
    return null;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getVisiblePointCount(snapshot: LetterStorySnapshot): number {
  // Use the mapper to get visible points (hidden ones are filtered)
  const mapped = snapshotToStoryWithPoints(snapshot, '');
  return mapped.points.length;
}

function initialPhase(snapshot: LetterStorySnapshot): StoryPhase {
  const visibleCount = getVisiblePointCount(snapshot);
  // D36: 0-1 visible points → story first
  if (visibleCount <= 1) return 'story-rate';
  // 2+ visible points → anti-point lead (first point before story)
  return 'point-engage';
}

function createInitialStoryState(snapshot: LetterStorySnapshot, prediction?: number | null): StoryState {
  return {
    phase: initialPhase(snapshot),
    rating: null,
    prediction: prediction ?? null,
    positions: {},
    currentPointIndex: 0,
  };
}


// ============================================================================
// HOOK PARAMS
// ============================================================================

export interface UseLetterReadingStateParams {
  /**
   * 'remote' (default): writes ratings/positions to Supabase via RPC.
   * 'local': no RPC calls; ratings/positions stored in React state + localStorage only.
   */
  mode?: 'local' | 'remote';
  /**
   * Required in 'remote' mode. Optional in 'local' mode (no DB writes happen).
   */
  deliveryId?: string;
  senderId: string;
  snapshots: LetterStorySnapshot[];
  token?: string;
  previewMode?: boolean;
  previewPredictions?: Map<string, number>;
  /**
   * Required in 'local' mode: the letter's UUID, used as the localStorage draft key.
   */
  letterId?: string;
  /**
   * Shared predictions for one-to-many public reading (local mode).
   * Keyed by story_id. Loaded from getLetterForPublicReading RPC.
   */
  publicPredictions?: Map<string, number>;
  /**
   * P745: DB-persisted story index from delivery.saved_story_index.
   * Used as fallback when sessionStorage has no state (e.g. after returning from /live overlay).
   */
  savedStoryIndex?: number;
}

// ============================================================================
// HOOK
// ============================================================================

export function useLetterReadingState(
  deliveryId: string,
  senderId: string,
  snapshots: LetterStorySnapshot[],
  token?: string,
  previewMode?: boolean,
  previewPredictions?: Map<string, number>
): UseLetterReadingStateReturn;

export function useLetterReadingState(
  params: UseLetterReadingStateParams
): UseLetterReadingStateReturn;

export function useLetterReadingState(
  deliveryIdOrParams: string | UseLetterReadingStateParams,
  senderIdArg?: string,
  snapshotsArg?: LetterStorySnapshot[],
  tokenArg?: string,
  previewModeArg?: boolean,
  previewPredictionsArg?: Map<string, number>
): UseLetterReadingStateReturn {
  // Normalise overloads to a single set of variables
  const isParamsObject = typeof deliveryIdOrParams === 'object';

  const mode: 'local' | 'remote' = isParamsObject
    ? (deliveryIdOrParams.mode ?? 'remote')
    : 'remote';

  const deliveryId: string | undefined = isParamsObject
    ? deliveryIdOrParams.deliveryId
    : deliveryIdOrParams;

  const senderId: string = isParamsObject
    ? deliveryIdOrParams.senderId
    : (senderIdArg as string);

  const snapshots: LetterStorySnapshot[] = isParamsObject
    ? deliveryIdOrParams.snapshots
    : (snapshotsArg as LetterStorySnapshot[]);

  const token: string | undefined = isParamsObject
    ? deliveryIdOrParams.token
    : tokenArg;

  const previewMode: boolean | undefined = isParamsObject
    ? deliveryIdOrParams.previewMode
    : previewModeArg;

  const previewPredictions: Map<string, number> | undefined = isParamsObject
    ? deliveryIdOrParams.previewPredictions
    : previewPredictionsArg;

  const letterId: string | undefined = isParamsObject
    ? deliveryIdOrParams.letterId
    : undefined;

  const publicPredictions: Map<string, number> | undefined = isParamsObject
    ? deliveryIdOrParams.publicPredictions
    : undefined;

  const savedStoryIndex: number | undefined = isParamsObject
    ? deliveryIdOrParams.savedStoryIndex
    : undefined;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const initRef = useRef(false);

  const resumedRef = useRef(false);
  const hasMarkedInProgress = useRef(false);

  const [isLocalCompleted, setIsLocalCompleted] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);

  const [state, setState] = useState<LetterReadingState>(() => {
    const freshState: LetterReadingState = {
      currentStoryIndex: 0,
      stories: snapshots.map((snap) =>
        createInitialStoryState(snap, previewPredictions?.get(snap.story_id))
      ),
      isComplete: false,
    };

    if (mode === 'local') {
      // Hydrate from localStorage (full state, same shape as remote)
      if (letterId) {
        const saved = loadLocalState(letterId);
        const hasProgress = saved?.stories.some(
          (s, i) => s.rating !== null || s.phase !== initialPhase(snapshots[i]),
        );
        if (saved && saved.stories.length === snapshots.length && hasProgress) {
          resumedRef.current = true;
          hasMarkedInProgress.current = true;
          return saved;
        }
      }
      return freshState;
    }

    // Remote mode: try to restore from sessionStorage.
    // Preview mode is ephemeral — never restore prior progress.
    if (deliveryId && !previewMode) {
      const saved = loadState(deliveryId);
      const hasProgress = saved?.stories.some(
        (s, i) => s.rating !== null || s.phase !== initialPhase(snapshots[i]),
      );
      if (saved && saved.stories.length === snapshots.length && (saved.currentStoryIndex > 0 || hasProgress)) {
        resumedRef.current = true;
        hasMarkedInProgress.current = true;
        return saved;
      }
    }
    // P745: fallback to DB-persisted index (set when receiver paused to join /live)
    if (savedStoryIndex !== undefined && savedStoryIndex > 0 && savedStoryIndex < snapshots.length) {
      return {
        currentStoryIndex: savedStoryIndex,
        stories: snapshots.map((snap) => createInitialStoryState(snap, previewPredictions?.get(snap.story_id))),
        isComplete: false,
      };
    }
    return freshState;
  });

  // Show resume toast if we restored from storage
  useEffect(() => {
    if (resumedRef.current) {
      toast.info(`Welcome back. You left off at Story ${state.currentStoryIndex + 1}.`);
      resumedRef.current = false;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Preview mode: remove any legacy persisted entry left by pre-fix code.
  // NOTE: this effect fires after useState() initialisation, so it cannot prevent
  // a stale entry from being loaded. The actual protection is the `!previewMode`
  // guard in the useState initialiser above. This effect only cleans up the orphaned
  // entry so it does not linger in storage after a preview walk.
  useEffect(() => {
    if (previewMode && deliveryId) {
      try {
        sessionStorage.removeItem(`clarity-letter-reading-${deliveryId}`);
        localStorage.removeItem(`clarity-letter-reading-${deliveryId}`);
      } catch { /* storage unavailable */ }
    }
  }, [previewMode, deliveryId]);

  // Persist state changes
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      return;
    }

    if (mode === 'local') {
      if (letterId) {
        saveLocalState(letterId, state);
      }
    } else {
      if (deliveryId && !previewMode) {
        saveState(deliveryId, state);
      }
    }
  }, [mode, deliveryId, letterId, state, previewMode]);

  const currentStory = state.stories[state.currentStoryIndex];
  const currentSnapshot = snapshots[state.currentStoryIndex];

  const updateCurrentStory = useCallback(
    (updater: (prev: StoryState) => StoryState) => {
      setState((prev) => {
        const newStories = [...prev.stories];
        const current = newStories[prev.currentStoryIndex];
        if (!current) return prev;
        newStories[prev.currentStoryIndex] = updater(current);
        return { ...prev, stories: newStories };
      });
    },
    []
  );

  // Submit position for a point (handles DB write + phase transition)
  const submitPointPosition = useCallback(
    async (pointId: string, position: string) => {
      setIsSubmitting(true);
      try {
        if (mode !== 'local' && !previewMode) {
          if (!hasMarkedInProgress.current) {
            if (token) {
              updateDeliveryStatusByToken(token, 'in_progress')
                .then(() => { hasMarkedInProgress.current = true; })
                .catch(() => {});
            } else if (deliveryId) {
              updateDeliveryStatus(deliveryId, 'in_progress')
                .then(() => { hasMarkedInProgress.current = true; })
                .catch(() => {});
            }
          }
          if (token) {
            await submitPointResponseByToken(token, pointId, position);
          } else if (deliveryId) {
            await submitPointResponse(deliveryId, pointId, position);
          }
        }

        let willComplete = false;

        updateCurrentStory((prev) => {
          const newPhase: StoryPhase =
            prev.phase === 'point-engage' ? 'point-revealed'
            : prev.phase === 'remaining-point-engage' ? 'remaining-point-revealed'
            : prev.phase;
          return {
            ...prev,
            positions: { ...prev.positions, [pointId]: position },
            phase: newPhase,
          };
        });

        // In local mode: check if this is the final point of the final story
        if (mode === 'local') {
          setState((prev) => {
            const isLastStory = prev.currentStoryIndex === prev.stories.length - 1;
            if (!isLastStory) return prev;

            const lastSnap = snapshots[prev.currentStoryIndex];
            if (!lastSnap) return prev;

            const visibleCount = getVisiblePointCount(lastSnap);
            const lastStory = prev.stories[prev.currentStoryIndex];
            if (!lastStory) return prev;

            // Count positions including this new one
            const positionedCount = Object.keys(lastStory.positions).length + 1;

            // Determine if all points for the last story are now positioned and rated
            const allPositioned = positionedCount >= visibleCount;
            const hasRated = lastStory.rating !== null;

            if (allPositioned && hasRated) {
              willComplete = true;
            }
            return prev;
          });

          if (willComplete) {
            setIsLocalCompleted(true);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'Invalid or expired token') {
          setTokenExpired(true);
        } else {
          throw err;
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [mode, deliveryId, token, previewMode, snapshots, updateCurrentStory]
  );

  // Submit rating for current story
  const submitStoryRating = useCallback(
    async (rating: number) => {
      if (!currentSnapshot) return;
      setIsSubmitting(true);
      try {
        if (mode === 'local') {
          // Local mode: update state only, no RPC
          updateCurrentStory((prev) => ({
            ...prev,
            rating,
            prediction: publicPredictions?.get(currentSnapshot.story_id) ?? null,
            phase: 'story-revealed',
          }));

          // Check if this rating completes the last story (0 visible points case)
          if (state.currentStoryIndex === snapshots.length - 1) {
            const visibleCount = getVisiblePointCount(currentSnapshot);
            if (visibleCount === 0) {
              setIsLocalCompleted(true);
            }
          }
        } else if (previewMode) {
          // Preview: local state update only; use prediction from sessionStorage if available
          updateCurrentStory((prev) => ({
            ...prev,
            rating,
            prediction: previewPredictions?.get(currentSnapshot.story_id) ?? null,
            phase: 'story-revealed',
          }));
        } else if (token) {
          if (!hasMarkedInProgress.current) {
            updateDeliveryStatusByToken(token, 'in_progress')
              .then(() => { hasMarkedInProgress.current = true; })
              .catch(() => {});
          }
          await submitRatingByToken(token, currentSnapshot.story_id, rating);
          const prediction = await revealPredictionByToken(token, currentSnapshot.story_id);
          updateCurrentStory((prev) => ({
            ...prev,
            rating,
            prediction: prediction?.prediction ?? null,
            phase: 'story-revealed',
          }));
        } else if (deliveryId) {
          if (!hasMarkedInProgress.current) {
            updateDeliveryStatus(deliveryId, 'in_progress')
              .then(() => { hasMarkedInProgress.current = true; })
              .catch(() => {});
          }
          await submitRating(deliveryId, currentSnapshot.story_id, rating, senderId, currentSnapshot.version_id);
          const prediction = await revealPrediction(deliveryId, currentSnapshot.story_id);
          updateCurrentStory((prev) => ({
            ...prev,
            rating,
            prediction: prediction?.prediction ?? null,
            phase: 'story-revealed',
          }));
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [mode, deliveryId, senderId, token, previewMode, previewPredictions, publicPredictions, currentSnapshot, state.currentStoryIndex, snapshots.length, updateCurrentStory]
  );

  // Advance from point-revealed → story-rate (2+ points) or transition (D36: 1 point after story)
  const advanceFromPointReveal = useCallback(() => {
    if (!currentSnapshot) return;
    const visibleCount = getVisiblePointCount(currentSnapshot);
    updateCurrentStory((prev) => {
      // D36: 1 visible point, story was already rated → done with this story
      if (visibleCount === 1 && prev.rating !== null) {
        return { ...prev, phase: 'transition' };
      }
      // 2+ points: first point was before story, advance to story-rate
      return { ...prev, phase: 'story-rate' };
    });
  }, [currentSnapshot, updateCurrentStory]);

  // Advance from story-revealed → remaining points or transition
  const advanceFromStoryReveal = useCallback(() => {
    if (!currentSnapshot) return;
    const visibleCount = getVisiblePointCount(currentSnapshot);

    updateCurrentStory((prev) => {
      // For 2+ visible points: first point was before story, remaining start at index 1
      if (visibleCount >= 2) {
        return { ...prev, phase: 'remaining-point-engage', currentPointIndex: 1 };
      }
      // For 1 visible point (D36): point comes after story
      if (visibleCount === 1) {
        return { ...prev, phase: 'point-engage', currentPointIndex: 0 };
      }
      // 0 visible points: go to transition
      return { ...prev, phase: 'transition' };
    });
  }, [currentSnapshot, updateCurrentStory]);

  // Advance from remaining-point-revealed → next remaining point or transition
  const advanceFromRemainingPointReveal = useCallback(() => {
    if (!currentSnapshot) return;
    const visibleCount = getVisiblePointCount(currentSnapshot);

    updateCurrentStory((prev) => {
      const nextIdx = prev.currentPointIndex + 1;
      if (nextIdx >= visibleCount) {
        return { ...prev, phase: 'transition' };
      }
      return { ...prev, phase: 'remaining-point-engage', currentPointIndex: nextIdx };
    });
  }, [currentSnapshot, updateCurrentStory]);

  // Move to next story
  const nextStory = useCallback(() => {
    setState((prev) => {
      const nextIndex = prev.currentStoryIndex + 1;
      if (nextIndex >= prev.stories.length) {
        // All stories read — mark complete
        if (mode !== 'local' && !previewMode) {
          if (token) {
            updateDeliveryStatusByToken(token, 'completed').catch(() => {});
          } else if (deliveryId) {
            updateDeliveryStatus(deliveryId, 'completed').catch(() => {});
          }
        }
        // In local mode: signal completion when nextStory is called on the last story
        if (mode === 'local') {
          setIsLocalCompleted(true);
        }
        return { ...prev, isComplete: true };
      }
      return { ...prev, currentStoryIndex: nextIndex };
    });
  }, [mode, deliveryId, token, previewMode]);

  return {
    state,
    currentPhase: currentStory?.phase ?? 'story-rate',
    submitPointPosition,
    submitStoryRating,
    advanceFromPointReveal,
    advanceFromStoryReveal,
    advanceFromRemainingPointReveal,
    nextStory,
    isSubmitting,
    isLocalCompleted,
    tokenExpired,
  };
}
