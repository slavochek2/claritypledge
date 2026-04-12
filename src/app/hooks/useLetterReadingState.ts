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
}

// ============================================================================
// LOCAL-MODE localStorage CONTRACT (AD5)
// ============================================================================

/** Shape written to localStorage under key `p684_letter_draft:{letterId}` */
interface LocalDraft {
  letterId: string;
  ratings: Array<{ storyId: string; rating: number }>;
  positions: Array<{ pointId: string; position: string }>;
  updatedAt: string;
}

function localDraftKey(letterId: string): string {
  return `p684_letter_draft:${letterId}`;
}

function readLocalDraft(letterId: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(localDraftKey(letterId));
    if (!raw) return null;
    return JSON.parse(raw) as LocalDraft;
  } catch {
    return null;
  }
}

function writeLocalDraft(letterId: string, draft: LocalDraft): void {
  try {
    localStorage.setItem(localDraftKey(letterId), JSON.stringify(draft));
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
  try {
    sessionStorage.setItem(storageKey(deliveryId), JSON.stringify(state));
  } catch {
    // Storage full or unavailable — continue without persistence
  }
}

function loadState(deliveryId: string): LetterReadingState | null {
  try {
    const raw = sessionStorage.getItem(storageKey(deliveryId));
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

/**
 * Derive a LocalDraft from the current reading state for persistence.
 * Collects all ratings and positions across all stories.
 */
function deriveDraft(letterId: string, state: LetterReadingState, snapshots: LetterStorySnapshot[]): LocalDraft {
  const ratings: LocalDraft['ratings'] = [];
  const positions: LocalDraft['positions'] = [];

  state.stories.forEach((story, idx) => {
    const snap = snapshots[idx];
    if (!snap) return;

    if (story.rating !== null) {
      ratings.push({ storyId: snap.story_id, rating: story.rating });
    }
    Object.entries(story.positions).forEach(([pointId, position]) => {
      positions.push({ pointId, position });
    });
  });

  return { letterId, ratings, positions, updatedAt: new Date().toISOString() };
}

/**
 * Reconstruct partial reading state from a local draft.
 * Only restores ratings and positions — phases are re-derived so the reader
 * resumes at the correct phase for each story.
 */
function applyDraftToState(
  state: LetterReadingState,
  draft: LocalDraft,
  snapshots: LetterStorySnapshot[]
): LetterReadingState {
  const stories = state.stories.map((story, idx) => {
    const snap = snapshots[idx];
    if (!snap) return story;

    // Restore positions
    const savedPositions: Record<string, string> = {};
    draft.positions.forEach(({ pointId, position }) => {
      savedPositions[pointId] = position;
    });

    // Restore rating for this story
    const savedRating = draft.ratings.find((r) => r.storyId === snap.story_id);

    const restoredStory: StoryState = {
      ...story,
      positions: savedPositions,
      rating: savedRating?.rating ?? null,
    };

    return restoredStory;
  });

  return { ...state, stories };
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const initRef = useRef(false);

  const resumedRef = useRef(false);

  const [isLocalCompleted, setIsLocalCompleted] = useState(false);

  const [state, setState] = useState<LetterReadingState>(() => {
    const freshState: LetterReadingState = {
      currentStoryIndex: 0,
      stories: snapshots.map((snap) =>
        createInitialStoryState(snap, previewPredictions?.get(snap.story_id))
      ),
      isComplete: false,
    };

    if (mode === 'local') {
      // Hydrate from localStorage draft if present
      if (letterId) {
        const draft = readLocalDraft(letterId);
        if (draft) {
          resumedRef.current = true;
          return applyDraftToState(freshState, draft, snapshots);
        }
      }
      return freshState;
    }

    // Remote mode: try to restore from sessionStorage
    if (deliveryId) {
      const saved = loadState(deliveryId);
      const hasProgress = saved?.stories.some(
        (s, i) => s.rating !== null || s.phase !== initialPhase(snapshots[i]),
      );
      if (saved && saved.stories.length === snapshots.length && (saved.currentStoryIndex > 0 || hasProgress)) {
        resumedRef.current = true;
        return saved;
      }
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

  // Persist state changes
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      return;
    }

    if (mode === 'local') {
      if (letterId) {
        writeLocalDraft(letterId, deriveDraft(letterId, state, snapshots));
      }
    } else {
      if (deliveryId) {
        saveState(deliveryId, state);
      }
    }
  }, [mode, deliveryId, letterId, state]); // eslint-disable-line react-hooks/exhaustive-deps

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
          await submitRatingByToken(token, currentSnapshot.story_id, rating);
          const prediction = await revealPredictionByToken(token, currentSnapshot.story_id);
          updateCurrentStory((prev) => ({
            ...prev,
            rating,
            prediction: prediction?.prediction ?? null,
            phase: 'story-revealed',
          }));
        } else if (deliveryId) {
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
      // Mark delivery as in_progress if this is the first advance
      if (mode !== 'local' && !previewMode && prev.currentStoryIndex === 0) {
        if (token) {
          updateDeliveryStatusByToken(token, 'in_progress').catch(() => {});
        } else if (deliveryId) {
          updateDeliveryStatus(deliveryId, 'in_progress').catch(() => {});
        }
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
  };
}
