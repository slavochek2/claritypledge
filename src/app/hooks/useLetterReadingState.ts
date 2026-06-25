/**
 * @file useLetterReadingState.ts
 * @description P673: State machine for letter reading flow (rewritten from P581).
 * Manages current story index, phase per story, ratings, positions, and predictions.
 * Forward-only: once a rating is submitted, cannot go back.
 * Persists to sessionStorage for resume + anonymous 1-to-many flow.
 *
 * Phase machine per story (Decision 4, generalized to N leads by P898):
 * - N = effective lead count (point_config.lead_count clamped to [0, visible]; absent → 1)
 * - V >= 2, N >= 1: point-engage/revealed(0..N-1) → story-rate/revealed → remaining-point-engage/revealed(N..V-1) → transition
 * - N = 0 (V >= 1): story-rate → story-revealed → remaining-point-engage/revealed(0..V-1) → transition
 * - 1 visible point with a lead (D36 legacy): story-rate → story-revealed → point-engage → point-revealed → transition
 * - 0 visible points: story-rate → story-revealed → transition
 *
 * P684: Added local-only mode for anonymous one-to-many reading.
 * In local mode: no RPC calls, state mirrored to localStorage, hydrated on mount.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { LetterStorySnapshot } from '@/app/types';
import { snapshotToStoryWithPoints } from '@/app/utils/letter-snapshot-mapper';
import { getEffectiveLeadCount } from '@/app/utils/letter-reading-utils';
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

// P959: a rating submit must never strand the receiver. Without a timeout, a
// hung RPC leaves isSubmitting stuck true forever (the `finally` never runs),
// which permanently disables the comprehension-rating card with no recovery.
const RATING_SUBMIT_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

function getVisiblePoints(snapshot: LetterStorySnapshot) {
  return snapshotToStoryWithPoints(snapshot, '').points;
}

function getVisiblePointCount(snapshot: LetterStorySnapshot): number {
  return getVisiblePoints(snapshot).length;
}

function isPointAnswered(
  snapshot: LetterStorySnapshot,
  idx: number,
  positions: Record<string, string>,
): boolean {
  const point = getVisiblePoints(snapshot)[idx];
  return !!point && !!positions[point.id];
}

// P898: effective lead count for a snapshot — lead_count clamped to [0, visible].
// Absent/malformed → 1 (the historical implicit single lead).
function getLeadCount(snapshot: LetterStorySnapshot): number {
  return getEffectiveLeadCount(snapshot.point_config, getVisiblePointCount(snapshot));
}

function initialPhase(snapshot: LetterStorySnapshot): StoryPhase {
  const visibleCount = getVisiblePointCount(snapshot);
  // D36: 0 visible points → story only; 1 visible point with a lead → story first (legacy walk)
  if (visibleCount <= 1) return 'story-rate';
  // P898: explicit lead_count of 0 → story-first walk
  if (getLeadCount(snapshot) === 0) return 'story-rate';
  // 1+ leads → first lead point before story
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

// P768: Seed a story's positions / currentPointIndex / phase from DB-rehydrated
// prior responses. Invariant 4: only point-position data is rehydrated —
// story-rate / story-revealed inference is out of scope.
// P898: the landing index is clamped into the LEAD group when the initial phase
// is point-engage — if every lead is already answered, land on the last lead in
// point-revealed (its advance goes to story-rate) instead of framing a post-story
// point as a pre-story lead.
function seedStoryWithPriorPositions(
  storyState: StoryState,
  snapshot: LetterStorySnapshot,
  priorPositions: Record<string, string>,
): StoryState {
  const visiblePoints = getVisiblePoints(snapshot);
  if (visiblePoints.length === 0) return storyState;

  const seededPositions: Record<string, string> = { ...storyState.positions };
  let hasAny = false;
  for (const point of visiblePoints) {
    const prior = priorPositions[point.id];
    if (prior !== undefined) {
      seededPositions[point.id] = prior;
      hasAny = true;
    }
  }
  if (!hasAny) return storyState;

  const firstUnansweredIdx = visiblePoints.findIndex((p) => seededPositions[p.id] === undefined);
  let nextIndex = firstUnansweredIdx === -1 ? visiblePoints.length - 1 : firstUnansweredIdx;

  // P898: in the pre-story walk, never land past the lead group. All leads
  // answered → resume at the last lead (answered → point-revealed below).
  if (storyState.phase === 'point-engage') {
    const leadCount = getLeadCount(snapshot);
    if (leadCount >= 1 && nextIndex >= leadCount) {
      nextIndex = leadCount - 1;
    }
  }

  const landedPoint = visiblePoints[nextIndex];
  const landedAnswered = landedPoint && seededPositions[landedPoint.id] !== undefined;

  // Phase: if the landed point is already answered AND we started in point-engage,
  // advance to point-revealed. Any other phase (story-rate, etc.) is left as-is —
  // see Invariant 4.
  const nextPhase: StoryPhase =
    landedAnswered && storyState.phase === 'point-engage'
      ? 'point-revealed'
      : storyState.phase;

  return {
    ...storyState,
    positions: seededPositions,
    currentPointIndex: nextIndex,
    phase: nextPhase,
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
  /**
   * P768: Prior point responses rehydrated from DB on mount (pointId → position).
   * Seeded into the fresh-state branch only — sessionStorage/savedStoryIndex resumes
   * carry forward their own state. Prevents `point-engage` from rendering for points
   * that already have a response (which would 409 on Submit). Never set in preview mode.
   */
  priorPositions?: Record<string, string>;
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

  const priorPositions: Record<string, string> | undefined = isParamsObject
    ? deliveryIdOrParams.priorPositions
    : undefined;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const initRef = useRef(false);

  const resumedRef = useRef(false);
  const hasMarkedInProgress = useRef(false);
  // P959: guard post-await setState in submitStoryRating. A slow RPC/timeout can
  // resolve after the reader navigates away; skip the update if unmounted.
  // Must reset to true on (re)mount, not only false on cleanup — otherwise
  // React.StrictMode's dev mount→unmount→remount leaves it permanently false,
  // silently dropping the success-path phase advance (Continue does nothing).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const [isLocalCompleted, setIsLocalCompleted] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);

  const [state, setState] = useState<LetterReadingState>(() => {
    // P768: Seed positions from DB-rehydrated responses on fresh mount.
    // Preview mode and local mode never use priorPositions (Invariant 4 scope).
    const priorToApply: Record<string, string> | null =
      mode === 'remote' && !previewMode && priorPositions && Object.keys(priorPositions).length > 0
        ? priorPositions
        : null;

    const freshStories: StoryState[] = snapshots.map((snap) => {
      const base = createInitialStoryState(snap, previewPredictions?.get(snap.story_id));
      return priorToApply ? seedStoryWithPriorPositions(base, snap, priorToApply) : base;
    });

    const freshState: LetterReadingState = {
      currentStoryIndex: 0,
      stories: freshStories,
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
        stories: freshStories, // P768: use priorPositions-seeded stories here too
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
          await withTimeout(submitRatingByToken(token, currentSnapshot.story_id, rating), RATING_SUBMIT_TIMEOUT_MS, 'Submit rating');
          const prediction = await withTimeout(revealPredictionByToken(token, currentSnapshot.story_id), RATING_SUBMIT_TIMEOUT_MS, 'Reveal prediction');
          if (!mountedRef.current) return;
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
          await withTimeout(submitRating(deliveryId, currentSnapshot.story_id, rating, senderId, currentSnapshot.version_id), RATING_SUBMIT_TIMEOUT_MS, 'Submit rating');
          const prediction = await withTimeout(revealPrediction(deliveryId, currentSnapshot.story_id), RATING_SUBMIT_TIMEOUT_MS, 'Reveal prediction');
          if (!mountedRef.current) return;
          updateCurrentStory((prev) => ({
            ...prev,
            rating,
            prediction: prediction?.prediction ?? null,
            phase: 'story-revealed',
          }));
        }
      } catch {
        // P959: RPC rejected or timed out. Surface feedback and leave the phase
        // on story-rate; the finally resets isSubmitting so the card re-enables
        // for a retry rather than locking the receiver out silently. Retry is
        // safe: submit_rating(_by_token) inserts ON CONFLICT DO NOTHING, so a
        // timeout-after-server-save followed by a retry is idempotent.
        if (mountedRef.current) {
          toast.error('Could not save your rating. Please check your connection and try again.');
        }
      } finally {
        if (mountedRef.current) setIsSubmitting(false);
      }
    },
    [mode, deliveryId, senderId, token, previewMode, previewPredictions, publicPredictions, currentSnapshot, state.currentStoryIndex, snapshots.length, updateCurrentStory]
  );

  // Advance from point-revealed → next lead (P898), story-rate, or transition (D36: 1 point after story)
  const advanceFromPointReveal = useCallback(() => {
    if (!currentSnapshot) return;
    const visibleCount = getVisiblePointCount(currentSnapshot);
    const leadCount = getLeadCount(currentSnapshot);
    updateCurrentStory((prev) => {
      // D36: 1 visible point, story was already rated → done with this story
      if (visibleCount === 1 && prev.rating !== null) {
        return { ...prev, phase: 'transition' };
      }
      // P898: more lead points before the story → advance to the next lead.
      // Skip to revealed if it is already answered (prevents 409 on duplicate submit).
      if (visibleCount >= 2 && prev.currentPointIndex < leadCount - 1) {
        const nextIdx = prev.currentPointIndex + 1;
        const answered = isPointAnswered(currentSnapshot, nextIdx, prev.positions);
        return {
          ...prev,
          phase: answered ? 'point-revealed' : 'point-engage',
          currentPointIndex: nextIdx,
        };
      }
      // Last lead revealed → advance to story-rate
      return { ...prev, phase: 'story-rate' };
    });
  }, [currentSnapshot, updateCurrentStory]);

  // Advance from story-revealed → remaining points or transition
  const advanceFromStoryReveal = useCallback(() => {
    if (!currentSnapshot) return;
    const visibleCount = getVisiblePointCount(currentSnapshot);
    const leadCount = getLeadCount(currentSnapshot);

    updateCurrentStory((prev) => {
      // 0 visible points: go to transition
      if (visibleCount === 0) {
        return { ...prev, phase: 'transition' };
      }
      // For 1 visible point with a lead (D36 legacy): point comes after story
      if (visibleCount === 1 && leadCount >= 1) {
        return { ...prev, phase: 'point-engage', currentPointIndex: 0 };
      }
      // P898: all points were leads → nothing remains after the story
      if (leadCount >= visibleCount) {
        return { ...prev, phase: 'transition' };
      }
      // Remaining points start where the leads end (index N; N=1 is today's shape).
      // Skip to revealed if that point is already answered (prevents 409 on duplicate submit).
      const nextIdx = leadCount;
      const answered = isPointAnswered(currentSnapshot, nextIdx, prev.positions);
      return {
        ...prev,
        phase: answered ? 'remaining-point-revealed' : 'remaining-point-engage',
        currentPointIndex: nextIdx,
      };
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
      const answered = isPointAnswered(currentSnapshot, nextIdx, prev.positions);
      return {
        ...prev,
        phase: answered ? 'remaining-point-revealed' : 'remaining-point-engage',
        currentPointIndex: nextIdx,
      };
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
