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
}

// ============================================================================
// STORAGE
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

function createInitialStoryState(snapshot: LetterStorySnapshot): StoryState {
  return {
    phase: initialPhase(snapshot),
    rating: null,
    prediction: null,
    positions: {},
    currentPointIndex: 0,
  };
}

// ============================================================================
// HOOK
// ============================================================================

export function useLetterReadingState(
  deliveryId: string,
  senderId: string,
  snapshots: LetterStorySnapshot[],
  token?: string,
  previewMode?: boolean
): UseLetterReadingStateReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initRef = useRef(false);

  const resumedRef = useRef(false);

  const [state, setState] = useState<LetterReadingState>(() => {
    // Try to restore from sessionStorage
    const saved = loadState(deliveryId);
    if (saved && saved.stories.length === snapshots.length && saved.currentStoryIndex > 0) {
      resumedRef.current = true;
      return saved;
    }
    return {
      currentStoryIndex: 0,
      stories: snapshots.map(createInitialStoryState),
      isComplete: false,
    };
  });

  // Show resume toast if we restored from sessionStorage
  useEffect(() => {
    if (resumedRef.current) {
      toast.info(`Welcome back. You left off at Story ${state.currentStoryIndex + 1}.`);
      resumedRef.current = false;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist state changes to sessionStorage
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      return;
    }
    saveState(deliveryId, state);
  }, [deliveryId, state]);

  const currentStory = state.stories[state.currentStoryIndex];
  const currentSnapshot = snapshots[state.currentStoryIndex];

  const updateCurrentStory = useCallback(
    (updater: (prev: StoryState) => StoryState) => {
      setState((prev) => {
        const newStories = [...prev.stories];
        newStories[prev.currentStoryIndex] = updater(newStories[prev.currentStoryIndex]);
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
        if (!previewMode) {
          if (token) {
            await submitPointResponseByToken(token, pointId, position);
          } else {
            await submitPointResponse(deliveryId, pointId, position);
          }
        }
        updateCurrentStory((prev) => ({
          ...prev,
          positions: { ...prev.positions, [pointId]: position },
          // Transition to revealed phase after positioning
          phase: prev.phase === 'point-engage' ? 'point-revealed'
            : prev.phase === 'remaining-point-engage' ? 'remaining-point-revealed'
            : prev.phase,
        }));
      } finally {
        setIsSubmitting(false);
      }
    },
    [deliveryId, token, previewMode, updateCurrentStory]
  );

  // Submit rating for current story
  const submitStoryRating = useCallback(
    async (rating: number) => {
      if (!currentSnapshot) return;
      setIsSubmitting(true);
      try {
        if (previewMode) {
          // Preview: local state update only, synthetic prediction
          updateCurrentStory((prev) => ({
            ...prev,
            rating,
            prediction: null,
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
        } else {
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
    [deliveryId, senderId, token, previewMode, currentSnapshot, updateCurrentStory]
  );

  // Advance from point-revealed → story-rate (after first point in anti-point lead)
  const advanceFromPointReveal = useCallback(() => {
    updateCurrentStory((prev) => ({ ...prev, phase: 'story-rate' }));
  }, [updateCurrentStory]);

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
      // For D36 (1 point, point-revealed after story): go to transition
      if (prev.phase === 'point-revealed') {
        return { ...prev, phase: 'transition' };
      }
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
        if (!previewMode) {
          if (token) {
            updateDeliveryStatusByToken(token, 'completed').catch(() => {});
          } else {
            updateDeliveryStatus(deliveryId, 'completed').catch(() => {});
          }
        }
        return { ...prev, isComplete: true };
      }
      // Mark delivery as in_progress if this is the first advance
      if (!previewMode && prev.currentStoryIndex === 0) {
        if (token) {
          updateDeliveryStatusByToken(token, 'in_progress').catch(() => {});
        } else {
          updateDeliveryStatus(deliveryId, 'in_progress').catch(() => {});
        }
      }
      return { ...prev, currentStoryIndex: nextIndex };
    });
  }, [deliveryId, token, previewMode]);

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
  };
}
