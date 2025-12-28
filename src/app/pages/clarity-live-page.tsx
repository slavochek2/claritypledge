/**
 * @file clarity-live-page.tsx
 * @description P23: Live Clarity Meetings - Two people join, talk naturally,
 * the app acts as a quiet referee enforcing the understanding protocol.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  createClaritySession,
  joinClaritySession,
  getClaritySession,
  subscribeToClaritySession,
  updateClaritySessionLiveState,
  MAX_NAME_LENGTH,
  type ClaritySession,
} from '@/app/data/api';
import { analytics } from '@/lib/mixpanel';
import {
  type LiveSessionState,
  DEFAULT_LIVE_STATE,
} from '@/app/types';
import { LiveModeView } from '@/app/components/partners/live-mode-view';
import { ReviewModeView } from '@/app/components/partners/review-mode-view';

type ViewState = 'start' | 'waiting' | 'live';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Session persistence keys (per-tab using sessionStorage instead of localStorage) */
const STORAGE_KEYS = {
  SESSION_CODE: 'clarity_live_session_code',
  USER_NAME: 'clarity_live_user_name',
  IS_CREATOR: 'clarity_live_is_creator',
} as const;

/** Polling interval for fallback session updates (ms) */
const POLL_INTERVAL_MS = 2000;

/** Use sessionStorage for tab-isolated storage (each tab has its own session data) */
const storage = typeof window !== 'undefined' ? window.sessionStorage : null;

export function ClarityLivePage() {
  // Session state
  const [view, setView] = useState<ViewState>('start');
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [session, setSession] = useState<ClaritySession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true); // For session restoration

  // Live session state (synced via session.live_state)
  const [liveState, setLiveState] = useState<LiveSessionState>(DEFAULT_LIVE_STATE);
  const [mode, setMode] = useState<'live' | 'review'>('live');

  // Exit confirmation dialog state
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Derived values
  const partnerName = session
    ? isCreator
      ? session.joinerName
      : session.creatorName
    : undefined;

  // Ref to track if joiner has been detected (for polling comparison)
  const hasJoinerRef = useRef(false);
  // Ref to store session code for polling (avoids stale closure)
  const sessionCodeRef = useRef<string | null>(null);
  // Ref to track the last confirmed live state (for race condition prevention)
  const confirmedLiveStateRef = useRef<LiveSessionState>(DEFAULT_LIVE_STATE);
  // Ref to track if an update is in flight (prevents poll from overwriting pending changes)
  const updateInFlightRef = useRef(false);

  useEffect(() => {
    hasJoinerRef.current = !!session?.joinerName;
    sessionCodeRef.current = session?.code ?? null;
  }, [session?.joinerName, session?.code]);

  // Keep confirmedLiveStateRef in sync with server-confirmed state
  useEffect(() => {
    confirmedLiveStateRef.current = liveState;
  }, [liveState]);


  // HIGH #6: Restore session from sessionStorage on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const savedCode = storage?.getItem(STORAGE_KEYS.SESSION_CODE);
        const savedName = storage?.getItem(STORAGE_KEYS.USER_NAME);
        const savedIsCreator = storage?.getItem(STORAGE_KEYS.IS_CREATOR);

        if (savedCode && savedName) {
          console.log('[Live] Restoring session:', savedCode);
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
            if (restoredSession.joinerName) {
              setView('live');
            } else if (savedIsCreator === 'true') {
              setView('waiting');
            } else {
              // Joiner without session - clear storage
              clearStoredSession();
            }
          } else {
            // Session expired or invalid
            console.log('[Live] Stored session not found, clearing');
            clearStoredSession();
          }
        }
      } catch (err) {
        console.error('[Live] Failed to restore session:', err);
        clearStoredSession();
      } finally {
        setIsRestoring(false);
      }
    };

    restoreSession();
  }, []);

  // Helper to save session to sessionStorage
  const saveSessionToStorage = (code: string, userName: string, creator: boolean) => {
    storage?.setItem(STORAGE_KEYS.SESSION_CODE, code);
    storage?.setItem(STORAGE_KEYS.USER_NAME, userName);
    storage?.setItem(STORAGE_KEYS.IS_CREATOR, creator.toString());
  };

  // Helper to clear stored session
  const clearStoredSession = () => {
    storage?.removeItem(STORAGE_KEYS.SESSION_CODE);
    storage?.removeItem(STORAGE_KEYS.USER_NAME);
    storage?.removeItem(STORAGE_KEYS.IS_CREATOR);
  };

  // Subscribe to session updates
  // Note: We intentionally use session?.id and session?.code as dependencies
  // rather than the full session object to avoid re-subscribing on every state change.
  // The subscription callback uses functional updates to avoid stale closures.
  useEffect(() => {
    if (!session) {
      console.log('[Live] No session yet, skipping subscription');
      return;
    }

    const sessionId = session.id;
    console.log('[Live] Setting up subscription for session:', sessionId);

    const unsubscribe = subscribeToClaritySession(sessionId, (updatedSession) => {
      console.log('[Live] Session updated, joinerName:', updatedSession.joinerName);
      setSession(updatedSession);

      // Sync live state from session (merge with defaults for missing fields)
      // Also update the confirmed ref to prevent drift detection from reverting
      if (updatedSession.liveState) {
        const mergedState = { ...DEFAULT_LIVE_STATE, ...updatedSession.liveState } as LiveSessionState;
        setLiveState(mergedState);
        confirmedLiveStateRef.current = mergedState;
      }

      // When joiner joins, move to live view
      // Use functional update to avoid stale closure
      if (updatedSession.joinerName) {
        console.log('[Live] Joiner detected, transitioning from waiting to live');
        setView((currentView) => {
          console.log('[Live] Current view:', currentView, '-> transitioning to live if waiting');
          return currentView === 'waiting' ? 'live' : currentView;
        });
      }
    });

    console.log('[Live] Subscription set up successfully');

    // Fallback: Poll for updates as a safety net
    // This handles cases where realtime subscription might not fire
    // Also catches liveState drift when signals are lost between phones
    const pollInterval = setInterval(async () => {
      // Use ref to get current session code (avoids stale closure)
      const currentCode = sessionCodeRef.current;
      if (!currentCode) return;

      try {
        const freshSession = await getClaritySession(currentCode);
        if (!freshSession) return;

        // Check 1: Detect joiner (existing logic)
        if (freshSession.joinerName && !hasJoinerRef.current) {
          console.log('[Live] Poll detected joiner, updating session');
          setSession(freshSession);
          if (freshSession.liveState) {
            setLiveState({ ...DEFAULT_LIVE_STATE, ...freshSession.liveState } as LiveSessionState);
            confirmedLiveStateRef.current = { ...DEFAULT_LIVE_STATE, ...freshSession.liveState } as LiveSessionState;
          }
          setView((currentView) => currentView === 'waiting' ? 'live' : currentView);
          return;
        }

        // Check 2: Detect liveState drift (fixes lost signal bug)
        // Compare server state with our last confirmed state
        // Skip if an update is in flight to avoid race conditions
        if (freshSession.liveState && hasJoinerRef.current && !updateInFlightRef.current) {
          const serverState = { ...DEFAULT_LIVE_STATE, ...freshSession.liveState } as LiveSessionState;
          const localState = confirmedLiveStateRef.current;

          // Check key fields that indicate the other person took action
          const serverHasUpdate =
            serverState.ratingPhase !== localState.ratingPhase ||
            serverState.checkerSubmitted !== localState.checkerSubmitted ||
            serverState.responderSubmitted !== localState.responderSubmitted ||
            serverState.explainBackDone !== localState.explainBackDone ||
            serverState.checksCount !== localState.checksCount;

          if (serverHasUpdate) {
            console.log('[Live] Poll detected state drift, syncing from server');

            // Track in Mixpanel (non-blocking - don't let analytics errors break the app)
            try {
              analytics.track('live_state_drift_detected', {
                sessionCode: currentCode,
                ratingPhase: serverState.ratingPhase,
                checkerSubmittedDrift: serverState.checkerSubmitted !== localState.checkerSubmitted,
                responderSubmittedDrift: serverState.responderSubmitted !== localState.responderSubmitted,
              });
            } catch {
              // Analytics failure shouldn't break the app
            }

            const mergedState = { ...DEFAULT_LIVE_STATE, ...serverState };
            setLiveState(mergedState);
            confirmedLiveStateRef.current = mergedState;
            setSession(freshSession);
          }
        }
      } catch (err) {
        console.error('[Live] Poll error:', err);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      console.log('[Live] Cleaning up subscription and poll');
      unsubscribe();
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- We intentionally use only id/code to avoid re-subscribing on every state change
  }, [session?.id, session?.code]);

  // Update live state (syncs to all participants)
  // Uses ref for revert to avoid stale closure issues with rapid updates
  const updateLiveState = useCallback(
    async (updates: Partial<LiveSessionState>) => {
      if (!session) return;

      // Capture the confirmed state BEFORE we make changes (for potential revert)
      const stateBeforeUpdate = confirmedLiveStateRef.current;
      const newState = { ...stateBeforeUpdate, ...updates };

      setLiveState(newState); // Optimistic update
      updateInFlightRef.current = true; // Prevent poll from overwriting

      try {
        await updateClaritySessionLiveState(session.id, newState);
        // Update confirmed state on success
        confirmedLiveStateRef.current = newState;
      } catch (err) {
        console.error('[Live] Failed to update state:', err);
        // Check if it's a migration error
        if (err instanceof Error && err.message.includes('migration')) {
          setError('Unable to save changes. Please refresh the page and try again.');
        } else {
          // Show user-friendly error for other cases
          setError('Failed to sync with partner. Please try again.');
        }
        // Revert to the state before this update (using ref avoids stale closure)
        setLiveState(stateBeforeUpdate);
      } finally {
        updateInFlightRef.current = false;
      }
    },
    [session]
  );

  // ============================================================================
  // V7: Check/Prove model handlers (P23.2)
  // ============================================================================

  // P23.2: Handle "I spoke" button tap
  // Opens rating screen locally - does NOT affect shared state
  // checkerName is only set when someone actually submits their rating
  // This allows both users to tap "I spoke" independently
  const [isLocallyRating, setIsLocallyRating] = useState(false);
  // V12: Track which flow type we're in locally ('check' = "Did you get it?", 'prove' = "Did I get it?")
  const [localFlowType, setLocalFlowType] = useState<'check' | 'prove'>('check');

  const handleStartCheck = useCallback(() => {
    if (!name || !partnerName) return;

    // Guard: if a check is already in progress (someone already submitted), don't start a new local rating
    // This prevents race condition where both users tap "I spoke" and submit simultaneously
    const currentState = confirmedLiveStateRef.current;
    if (currentState.checkerName || currentState.ratingPhase !== 'idle') {
      console.log('[Live] Check already in progress, ignoring tap');
      return;
    }

    console.log('[Live] Did you get it? tapped by:', name);

    // Just show rating screen locally - don't touch shared state
    setLocalFlowType('check');
    setIsLocallyRating(true);
  }, [name, partnerName]);

  // V12: Handle "Did I get it?" button tap - listener-initiated understanding check
  // In this flow, the listener (prover) rates their confidence first
  // The speaker (checker) rates how understood they feel
  // Like handleStartCheck, this only sets LOCAL state - shared state is set on submit
  const handleStartProve = useCallback(() => {
    if (!name || !partnerName) return;

    // Guard: if a check is already in progress, don't start a new one
    const currentState = confirmedLiveStateRef.current;
    if (currentState.checkerName || currentState.ratingPhase !== 'idle') {
      console.log('[Live] Check already in progress, ignoring prove tap');
      return;
    }

    console.log('[Live] Did I get it? tapped by:', name);

    // Just show rating screen locally - don't touch shared state until submit
    // This mirrors handleStartCheck behavior for consistent sealed-bid pattern
    setLocalFlowType('prove');
    setIsLocallyRating(true);
  }, [name, partnerName]);

  // V7: Handle rating submission
  // "Did you get it?" flow: First person to submit becomes the checker
  // "Did I get it?" flow: First person to submit becomes the responder (prover)
  const handleRatingSubmit = useCallback(
    (rating: number) => {
      if (!name || !partnerName) return;
      console.log('[Live] Rating submitted:', rating, 'by:', name, 'flowType:', localFlowType);

      // Clear local rating state
      setIsLocallyRating(false);

      // Use ref to get current confirmed state (avoids stale closure)
      const currentState = confirmedLiveStateRef.current;

      const updates: Partial<LiveSessionState> = {
        ratingPhase: 'waiting',
      };

      // If no checker yet, this is the first submission
      if (!currentState.checkerName) {
        // V12: Handle "Did I get it?" flow differently
        // In "prove" flow, the person who submits first is the RESPONDER (prover/listener)
        // Their partner becomes the CHECKER (speaker)
        if (localFlowType === 'prove') {
          console.log('[Live] Prove flow - first to submit becomes responder:', name);
          updates.proverName = name;           // Track who initiated "Did I get it?"
          updates.checkerName = partnerName;   // Partner (speaker) is the checker
          updates.responderRating = rating;    // Prover's confidence rating
          updates.responderSubmitted = true;
        } else {
          // "Did you get it?" flow - first person becomes checker (speaker)
          console.log('[Live] Check flow - first to submit becomes checker:', name);
          updates.checkerName = name;
          updates.checkerRating = rating;
          updates.checkerSubmitted = true;
        }
      } else {
        // Checker already exists - determine role based on name match
        const isChecker = currentState.checkerName === name;

        if (isChecker) {
          // Checker is submitting (either first time in prove flow, or re-submitting)
          updates.checkerRating = rating;
          updates.checkerSubmitted = true;
        } else {
          // This is the responder submitting
          updates.responderRating = rating;
          updates.responderSubmitted = true;
        }

        // Check if both have submitted
        const bothSubmitted = isChecker
          ? currentState.responderSubmitted
          : currentState.checkerSubmitted;

        if (bothSubmitted) {
          updates.ratingPhase = 'revealed';
          updates.checksCount = currentState.checksCount + 1;
        }
      }

      updateLiveState(updates);
    },
    [name, partnerName, localFlowType, updateLiveState]
  );

  // V7: Handle skip (resets to idle state for next check)
  // V10: Now tracks who skipped so partner can be notified
  const handleSkip = useCallback(() => {
    console.log('[Live] Skip - returning to idle, skipped by:', name);

    // Reset to idle state for a fresh start
    // Set skippedBy so partner sees toast notification
    updateLiveState({
      ratingPhase: 'idle',
      skippedBy: name,
      // Clear checker/responder
      checkerName: undefined,
      checkerRating: undefined,
      responderRating: undefined,
      checkerSubmitted: false,
      responderSubmitted: false,
      // V12: Clear prover (for "Did I get it?" flow)
      proverName: undefined,
      // Clear explain-back state
      explainBackRound: 0,
      explainBackRatings: [],
      explainBackDone: false,
    });
  }, [name, updateLiveState]);

  // Handle celebration complete - user clicked "Continue" on perfect rating celebration
  // Like handleSkip, resets shared state to allow new rounds
  // Unlike handleSkip, does NOT set skippedBy (no notification for partner)
  const handleCelebrationComplete = useCallback(() => {
    console.log('[Live] Celebration complete - returning to idle silently');

    // Reset to idle state for a fresh start (no skippedBy notification)
    updateLiveState({
      ratingPhase: 'idle',
      // Don't set skippedBy - this is a natural completion, not a skip
      // Clear checker/responder
      checkerName: undefined,
      checkerRating: undefined,
      responderRating: undefined,
      checkerSubmitted: false,
      responderSubmitted: false,
      // V12: Clear prover (for "Did I get it?" flow)
      proverName: undefined,
      // Clear explain-back state
      explainBackRound: 0,
      explainBackRatings: [],
      explainBackDone: false,
    });
  }, [updateLiveState]);

  // Handle "Let me explain back" - listener starts explaining
  const handleExplainBackStart = useCallback(() => {
    console.log('[Live] Explain-back started');

    updateLiveState({
      ratingPhase: 'explain-back',
      explainBackDone: false,
    });
  }, [updateLiveState]);

  // V11: Handle listener tapping "Done Explaining" - unlocks speaker's rating UI
  const handleExplainBackDone = useCallback(() => {
    console.log('[Live] Listener tapped Done Explaining');

    updateLiveState({
      explainBackDone: true,
    });
  }, [updateLiveState]);

  // V6: Handle speaker rating after explain-back
  const handleExplainBackRate = useCallback(
    (rating: number) => {
      console.log('[Live] Explain-back rated:', rating);

      const currentState = confirmedLiveStateRef.current;
      const newExplainBackRatings = [...currentState.explainBackRatings, rating];

      updateLiveState({
        ratingPhase: 'results',
        explainBackRound: currentState.explainBackRound + 1,
        explainBackRatings: newExplainBackRatings,
        explainBackDone: false, // Reset for next round
        checksCount: currentState.checksCount + 1,
        checksTotal: currentState.checksTotal + rating,
        ...(rating >= 9 ? { ideasUnderstood: currentState.ideasUnderstood + 1 } : {}),
      });
    },
    [updateLiveState]
  );

  // Toggle mode
  const handleToggleMode = useCallback(() => {
    setMode((prev) => (prev === 'live' ? 'review' : 'live'));
  }, []);

  // Clear the skip notification after toast is shown
  const handleClearSkipNotification = useCallback(() => {
    updateLiveState({
      skippedBy: undefined,
    });
  }, [updateLiveState]);

  // MEDIUM: Name validation helper
  const validateName = (inputName: string): string | null => {
    const trimmed = inputName.trim();
    if (!trimmed) {
      return 'Please enter your name';
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      return `Name must be ${MAX_NAME_LENGTH} characters or less`;
    }
    return null;
  };

  // Create session handler
  const handleCreate = async () => {
    const nameError = validateName(name);
    if (nameError) {
      setError(nameError);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const trimmedName = name.trim();
      const newSession = await createClaritySession(trimmedName);
      setSession(newSession);
      setIsCreator(true);
      setView('waiting');
      // HIGH #6: Save to localStorage for rejoin
      saveSessionToStorage(newSession.code, trimmedName, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setIsLoading(false);
    }
  };

  // Join session handler
  const handleJoin = async () => {
    const nameError = validateName(name);
    if (nameError) {
      setError(nameError);
      return;
    }
    const normalizedCode = roomCode.trim().toUpperCase();
    if (!normalizedCode) {
      setError('Please enter the room code');
      return;
    }
    if (normalizedCode.length !== 6 || !/^[A-Z0-9]+$/.test(normalizedCode)) {
      setError('Room code must be 6 characters (letters and numbers only)');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const trimmedName = name.trim();
      const joinedSession = await joinClaritySession(normalizedCode, trimmedName);
      if (!joinedSession) {
        setError('Session not found or already full');
        return;
      }
      setSession(joinedSession);
      setIsCreator(false);
      setView('live');
      // HIGH #6: Save to localStorage for rejoin
      saveSessionToStorage(joinedSession.code, trimmedName, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join session');
    } finally {
      setIsLoading(false);
    }
  };

  // Cancel waiting and go back to start
  const handleCancelWaiting = () => {
    console.log('[Live] Canceling waiting, returning to start');
    clearStoredSession();
    setSession(null);
    setView('start');
    setRoomCode('');
  };

  // Show exit confirmation dialog
  const handleExitMeeting = useCallback(() => {
    setShowExitConfirm(true);
  }, []);

  // Actually exit meeting after confirmation
  const confirmExitMeeting = useCallback(() => {
    console.log('[Live] Exiting meeting, returning to start');
    clearStoredSession();
    setSession(null);
    setLiveState(DEFAULT_LIVE_STATE);
    setIsLocallyRating(false);
    setMode('live');
    setView('start');
    setRoomCode('');
    setShowExitConfirm(false);
  }, []);

  // Show loading while restoring session
  if (isRestoring) {
    return (
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-md">
        <div className="text-center">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  // START VIEW
  if (view === 'start') {
    const isJoinMode = roomCode.trim().length > 0;

    return (
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif font-bold mb-2">Live Clarity Meeting</h1>
          <p className="text-muted-foreground">
            Practice understanding in real-time conversation.
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Your Name</Label>
            <Input
              id="name"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="space-y-4 pt-4">
            {!isJoinMode && (
              <Button
                onClick={handleCreate}
                disabled={isLoading || !name.trim()}
                className="w-full"
                size="lg"
              >
                {isLoading ? 'Creating...' : 'Start Live Session'}
              </Button>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  {isJoinMode ? 'Join session' : 'Or join existing'}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="code">Room Code</Label>
                <Input
                  id="code"
                  placeholder="Enter 6-letter code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="text-center font-mono text-lg"
                />
              </div>
              <Button
                onClick={handleJoin}
                disabled={isLoading || !name.trim() || !roomCode.trim()}
                variant={isJoinMode ? 'default' : 'outline'}
                className="w-full"
                size="lg"
              >
                {isLoading ? 'Joining...' : 'Join Session'}
              </Button>
            </div>

            {isJoinMode && (
              <Button
                onClick={() => setRoomCode('')}
                variant="ghost"
                className="w-full text-muted-foreground"
                size="sm"
              >
                Or create a new session instead
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // WAITING VIEW
  if (view === 'waiting' && session) {
    return (
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-md">
        <div className="text-center space-y-6">
          <h1 className="text-2xl font-serif font-bold">Waiting for Partner</h1>

          <div className="p-6 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground mb-2">Share this code:</p>
            <p className="text-4xl font-mono font-bold tracking-widest">{session.code}</p>
          </div>

          <p className="text-muted-foreground">
            Have your partner enter this code on their phone.
          </p>

          <div className="animate-pulse text-sm text-muted-foreground">
            Waiting...
          </div>

          <Button
            variant="ghost"
            onClick={handleCancelWaiting}
            className="text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // LIVE/REVIEW VIEW
  if ((view === 'live') && session && partnerName) {
    return (
      <div className="flex flex-col h-[calc(100vh-4rem)] max-w-lg mx-auto">
        {mode === 'live' ? (
          <LiveModeView
            liveState={liveState}
            currentUserName={name}
            partnerName={partnerName}
            // V7 handlers (P23.2 Check/Prove model)
            onStartCheck={handleStartCheck}
            // V12: "Did I get it?" - listener-initiated understanding check
            onStartProve={handleStartProve}
            onRatingSubmit={handleRatingSubmit}
            onSkip={handleSkip}
            onBackToIdle={handleSkip}
            // V8: Explain-back (simplified - listener sees buttons immediately)
            onExplainBackStart={handleExplainBackStart}
            onExplainBackRate={handleExplainBackRate}
            onToggleMode={handleToggleMode}
            onClearSkipNotification={handleClearSkipNotification}
            // V10: Local rating state
            isLocallyRating={isLocallyRating}
            onCancelLocalRating={() => setIsLocallyRating(false)}
            // V10: Exit meeting button
            onExitMeeting={handleExitMeeting}
            // V11: Listener taps "Done Explaining" to unlock speaker's rating
            onExplainBackDone={handleExplainBackDone}
            // Celebration complete - reset shared state for new rounds
            onCelebrationComplete={handleCelebrationComplete}
          />
        ) : (
          <ReviewModeView
            session={session}
            liveState={liveState}
            currentUserName={name}
            partnerName={partnerName}
            onToggleMode={handleToggleMode}
          />
        )}

        {/* Exit confirmation dialog */}
        <Dialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Leave meeting?</DialogTitle>
              <DialogDescription>
                Are you sure you want to leave this meeting? Your session progress will be lost.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={() => setShowExitConfirm(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmExitMeeting}>
                Leave
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return null;
}
