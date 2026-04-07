/**
 * @file useLetterReadingState.ts
 * @description P581 Task 8: State machine for letter reading flow.
 * Manages current story index, phase per story, ratings, positions, and predictions.
 * Forward-only: once a rating is submitted, cannot go back.
 * Persists to sessionStorage for resume + anonymous 1-to-many flow.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { LetterStorySnapshot } from '@/app/types';
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

/** Phase for stories with multiple points (anti-point lead) */
export type MultiPointPhase =
  | 'anti-point'
  | 'position-revealed'
  | 'story'
  | 'rate'
  | 'gap-reveal'
  | 'remaining-points'
  | 'transition';

/** Phase for 1-point stories (story first, D36) */
export type SinglePointPhase =
  | 'story'
  | 'rate'
  | 'gap-reveal'
  | 'point'
  | 'transition';

export type StoryPhase = MultiPointPhase | SinglePointPhase;

export interface StoryState {
  phase: StoryPhase;
  rating: number | null;
  prediction: number | null;
  positions: Record<string, string>; // pointId -> position
  remainingPointIndex: number; // for multi-point: tracks which remaining point we're on
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
  submitPosition: (pointId: string, position: string) => Promise<void>;
  /** Submit rating for current story */
  submitStoryRating: (rating: number) => Promise<void>;
  /** Advance from position-revealed to story phase */
  advanceToStory: () => void;
  /** Advance from story to rate */
  advanceToRate: () => void;
  /** Advance to next remaining point or transition */
  advanceRemainingPoint: () => void;
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

function getPointCount(snapshot: LetterStorySnapshot): number {
  const config = snapshot.point_config;
  if (config && typeof config === 'object' && 'points' in config && Array.isArray(config.points)) {
    return config.points.length;
  }
  return 0;
}

function initialPhase(snapshot: LetterStorySnapshot): StoryPhase {
  const pointCount = getPointCount(snapshot);
  // D36: 1-point stories show story first
  if (pointCount <= 1) return 'story';
  // Multi-point: anti-point lead
  return 'anti-point';
}

function createInitialStoryState(snapshot: LetterStorySnapshot): StoryState {
  return {
    phase: initialPhase(snapshot),
    rating: null,
    prediction: null,
    positions: {},
    remainingPointIndex: 0,
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

  // Submit position for a point
  const submitPosition = useCallback(
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
          // For multi-point: advance from anti-point to position-revealed
          phase: prev.phase === 'anti-point' ? 'position-revealed' : prev.phase,
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
            phase: 'gap-reveal',
          }));
        } else if (token) {
          await submitRatingByToken(token, currentSnapshot.story_id, rating);
          const prediction = await revealPredictionByToken(token, currentSnapshot.story_id);
          updateCurrentStory((prev) => ({
            ...prev,
            rating,
            prediction: prediction?.prediction ?? null,
            phase: 'gap-reveal',
          }));
        } else {
          await submitRating(deliveryId, currentSnapshot.story_id, rating, senderId, currentSnapshot.version_id);
          const prediction = await revealPrediction(deliveryId, currentSnapshot.story_id);
          updateCurrentStory((prev) => ({
            ...prev,
            rating,
            prediction: prediction?.prediction ?? null,
            phase: 'gap-reveal',
          }));
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [deliveryId, senderId, token, previewMode, currentSnapshot, updateCurrentStory]
  );

  // Advance from position-revealed to story
  const advanceToStory = useCallback(() => {
    updateCurrentStory((prev) => ({ ...prev, phase: 'story' }));
  }, [updateCurrentStory]);

  // Advance from story to rate
  const advanceToRate = useCallback(() => {
    updateCurrentStory((prev) => ({ ...prev, phase: 'rate' }));
  }, [updateCurrentStory]);

  // Advance through remaining points or to transition
  const advanceRemainingPoint = useCallback(() => {
    if (!currentSnapshot) return;
    const pointCount = getPointCount(currentSnapshot);
    const totalRemaining = pointCount - 1; // first point was anti-point

    updateCurrentStory((prev) => {
      // For single-point stories, go straight to transition
      if (pointCount <= 1) {
        return { ...prev, phase: 'transition' };
      }

      // After gap-reveal, go to remaining points if multi-point
      if (prev.phase === 'gap-reveal' && totalRemaining > 0) {
        return { ...prev, phase: 'remaining-points', remainingPointIndex: 0 };
      }

      // Advance through remaining points
      if (prev.phase === 'remaining-points') {
        const nextIdx = prev.remainingPointIndex + 1;
        if (nextIdx >= totalRemaining) {
          return { ...prev, phase: 'transition' };
        }
        return { ...prev, remainingPointIndex: nextIdx };
      }

      // Single-point: after 'point' phase go to transition
      if (prev.phase === 'point') {
        return { ...prev, phase: 'transition' };
      }

      return { ...prev, phase: 'transition' };
    });
  }, [currentSnapshot, updateCurrentStory]);

  // Move to next story — bug #4 fix: use token-based RPC when token is present
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
    currentPhase: currentStory?.phase ?? 'story',
    submitPosition,
    submitStoryRating,
    advanceToStory,
    advanceToRate,
    advanceRemainingPoint,
    nextStory,
    isSubmitting,
  };
}
