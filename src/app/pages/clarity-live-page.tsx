/**
 * @file clarity-live-page.tsx
 * @description P23: Live Clarity Meetings - Two people join, talk naturally,
 * the app acts as a quiet referee enforcing the understanding protocol.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Share2, Check, Keyboard, Mic } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LiveSessionBanner } from '@/app/components/partners/live-session-banner';
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
  clearSessionJoiner,
  endClaritySession,
  MAX_NAME_LENGTH,
  type ClaritySession,
} from '@/app/data/api';
import { analytics } from '@/lib/mixpanel';
import { useAuth } from '@/auth';
import {
  type LiveSessionState,
  DEFAULT_LIVE_STATE,
} from '@/app/types';
import { LiveModeView, PartnerLeftScreen } from '@/app/components/partners/live-mode-view';

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

/** Polling interval for fallback session updates (ms)
 * Set to 1000ms for more responsive sync when realtime subscription fails
 * (common on mobile networks with unreliable WebSocket connections) */
const POLL_INTERVAL_MS = 1000;

/** Use sessionStorage for tab-isolated storage (each tab has its own session data) */
const storage = typeof window !== 'undefined' ? window.sessionStorage : null;

export function ClarityLivePage() {
  // Get room code from URL if present (for direct join via shared link)
  const { code: urlCode } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const isJoinViaLink = !!urlCode;

  // Get logged-in user's name (if authenticated)
  const { user } = useAuth();

  // Session state
  const [view, setView] = useState<ViewState>('start');
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState(urlCode?.toUpperCase() || '');
  const [session, setSession] = useState<ClaritySession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true); // For session restoration
  const [copied, setCopied] = useState(false); // For copy feedback in waiting room
  const [hostName, setHostName] = useState<string | null>(null); // For join via link - show host's name

  // Live session state (synced via session.live_state)
  const [liveState, setLiveState] = useState<LiveSessionState>(DEFAULT_LIVE_STATE);

  // Exit confirmation dialog state
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Partner departure state
  const [partnerLeft, setPartnerLeft] = useState(false); // Joiner left (creator sees this)
  const [sessionEnded, setSessionEnded] = useState(false); // Creator left (joiner sees this)
  const [departedPartnerName, setDepartedPartnerName] = useState<string | null>(null);

  // Derived values
  const partnerName = session
    ? isCreator
      ? session.joinerName
      : session.creatorName
    : undefined;

  // Ref to track if joiner has been detected (for polling comparison)
  const hasJoinerRef = useRef(false);
  // Ref to store the last known joiner name (for partner left screen)
  const lastJoinerNameRef = useRef<string | null>(null);

  // Helper: Mark joiner as detected (updates refs immediately to avoid race conditions)
  // Called from both subscription and polling to ensure departure detection works
  const markJoinerDetected = useCallback((joinerName: string) => {
    hasJoinerRef.current = true;
    lastJoinerNameRef.current = joinerName;
  }, []);
  // Ref to store session code for polling (avoids stale closure)
  const sessionCodeRef = useRef<string | null>(null);
  // Ref to track the current session ID (guards against stale subscription callbacks)
  const currentSessionIdRef = useRef<string | null>(null);
  // Ref to track the last confirmed live state (for race condition prevention)
  const confirmedLiveStateRef = useRef<LiveSessionState>(DEFAULT_LIVE_STATE);
  // Ref to track if an update is in flight (prevents poll from overwriting pending changes)
  const updateInFlightRef = useRef(false);
  // Refs to track partner departure (for polling to check without stale closure)
  const partnerLeftRef = useRef(false);
  const sessionEndedRef = useRef(false);
  // Ref to track if I am leaving (prevents detecting my own departure as partner leaving)
  const iAmLeavingRef = useRef(false);

  useEffect(() => {
    hasJoinerRef.current = !!session?.joinerName;
    // Store the joiner name while it exists (for partner left screen)
    if (session?.joinerName) {
      lastJoinerNameRef.current = session.joinerName;
    }
    sessionCodeRef.current = session?.code ?? null;
    currentSessionIdRef.current = session?.id ?? null;
  }, [session?.joinerName, session?.code, session?.id]);

  // Keep departure refs in sync with state
  useEffect(() => {
    partnerLeftRef.current = partnerLeft;
    sessionEndedRef.current = sessionEnded;
  }, [partnerLeft, sessionEnded]);

  // Pre-fill name from logged-in user (if authenticated and name is empty)
  useEffect(() => {
    if (user?.name && !name) {
      setName(user.name);
    }
  }, [user?.name, name]);

  // Keep confirmedLiveStateRef in sync with server-confirmed state
  useEffect(() => {
    confirmedLiveStateRef.current = liveState;
  }, [liveState]);

  // P25: Track page view on mount (only for start view, not join-via-link)
  useEffect(() => {
    if (!isJoinViaLink && view === 'start') {
      analytics.track('live_meeting_page_view', {
        is_logged_in: !!user,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only track once on mount
  }, []);

  // HIGH #6: Restore session from sessionStorage on mount
  // IMPORTANT: Skip restoration if user is joining via link (urlCode takes priority)
  useEffect(() => {
    const restoreSession = async () => {
      try {
        // If user clicked a join link (/live/ABCD12), don't restore old session
        // They intend to join the new session from the URL
        if (isJoinViaLink) {
          clearStoredSession(); // Clear old session to avoid confusion
          setIsRestoring(false);
          return;
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
  }, [isJoinViaLink]);

  // Fetch host name when joining via link (for personalized "Join X's Meeting" title)
  useEffect(() => {
    if (!isJoinViaLink || !urlCode) return;

    const fetchHostName = async () => {
      try {
        const sessionInfo = await getClaritySession(urlCode.toUpperCase());
        if (sessionInfo?.creatorName) {
          setHostName(sessionInfo.creatorName);
        }
      } catch (err) {
        console.error('[Live] Failed to fetch host name:', err);
      }
    };

    fetchHostName();
  }, [isJoinViaLink, urlCode]);

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
      return;
    }

    const sessionId = session.id;

    const unsubscribe = subscribeToClaritySession(sessionId, (updatedSession) => {
      // Guard: Ignore updates from stale sessions (prevents race condition when exiting)
      // This can happen if a realtime update arrives after user clicked "Leave" but before cleanup
      if (currentSessionIdRef.current !== updatedSession.id) {
        return;
      }

      // Guard: Skip if I am leaving or session already ended (prevents processing updates after departure)
      if (iAmLeavingRef.current || sessionEndedRef.current || partnerLeftRef.current) {
        return;
      }

      // Check for session end (creator left) - handle via subscription for immediate response
      const sessionEndedInLiveState = (updatedSession.liveState as Record<string, unknown>)?.sessionEnded;
      if (sessionEndedInLiveState) {
        // Update ref immediately to prevent any subsequent updates from processing
        sessionEndedRef.current = true;
        setDepartedPartnerName(updatedSession.creatorName);
        setSessionEnded(true);
        analytics.track('live_session_partner_left', {
          session_code: updatedSession.code,
          left_by: 'creator',
        });
        return; // Don't process further updates after session ends
      }

      // Check for joiner departure (I'm creator, joiner left)
      if (!updatedSession.joinerName && hasJoinerRef.current && !partnerLeftRef.current) {
        // Update ref immediately to prevent any subsequent updates from processing
        partnerLeftRef.current = true;
        setDepartedPartnerName(lastJoinerNameRef.current);
        setPartnerLeft(true);
        hasJoinerRef.current = false;
        analytics.track('live_session_partner_left', {
          session_code: updatedSession.code,
          left_by: 'joiner',
        });
        return; // Don't process further updates after partner leaves
      }

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
        markJoinerDetected(updatedSession.joinerName);
        setView((currentView) => currentView === 'waiting' ? 'live' : currentView);
      }
    });

    // Fallback: Poll for updates as a safety net
    // This handles cases where realtime subscription might not fire
    // Also catches liveState drift when signals are lost between phones
    const pollInterval = setInterval(async () => {
      // Skip polling if partner has already left or I am leaving (avoid further state changes)
      if (partnerLeftRef.current || sessionEndedRef.current || iAmLeavingRef.current) {
        return;
      }

      // Use ref to get current session code (avoids stale closure)
      const currentCode = sessionCodeRef.current;
      if (!currentCode) {
        return;
      }

      try {
        const freshSession = await getClaritySession(currentCode);
        if (!freshSession) {
          return;
        }

        // Guard: Ignore if session ID doesn't match current (user may have exited/rejoined)
        if (currentSessionIdRef.current !== freshSession.id) {
          return;
        }

        // Check 1: Detect joiner (existing logic)
        if (freshSession.joinerName && !hasJoinerRef.current) {
          markJoinerDetected(freshSession.joinerName);
          setSession(freshSession);
          if (freshSession.liveState) {
            setLiveState({ ...DEFAULT_LIVE_STATE, ...freshSession.liveState } as LiveSessionState);
            confirmedLiveStateRef.current = { ...DEFAULT_LIVE_STATE, ...freshSession.liveState } as LiveSessionState;
          }
          setView((currentView) => currentView === 'waiting' ? 'live' : currentView);
          return;
        }

        // Check 1.5: Detect partner departure
        // Case A: Session ended (creator left) - joiner sees this
        // Check live_state.sessionEnded since ended_at column doesn't exist
        const sessionEndedInLiveState = (freshSession.liveState as Record<string, unknown>)?.sessionEnded;
        if (sessionEndedInLiveState) {
          // Update ref immediately to prevent any subsequent updates from processing
          sessionEndedRef.current = true;
          // Store the partner's name before we clear session
          setDepartedPartnerName(freshSession.creatorName);
          setSessionEnded(true);
          analytics.track('live_session_partner_left', {
            session_code: freshSession.code,
            left_by: 'creator',
          });
          return;
        }

        // Case B: Joiner left (creator sees this) - joiner_name went from set to null
        if (!freshSession.joinerName && hasJoinerRef.current) {
          // Update ref immediately to prevent any subsequent updates from processing
          partnerLeftRef.current = true;
          // Use the ref which stored the joiner name before it was cleared
          setDepartedPartnerName(lastJoinerNameRef.current);
          setPartnerLeft(true);
          hasJoinerRef.current = false;
          analytics.track('live_session_partner_left', {
            session_code: freshSession.code,
            left_by: 'joiner',
          });
          return;
        }

        // Check 2: Detect liveState drift (fixes lost signal bug)
        // Compare server state with our last confirmed state
        // Skip if an update is in flight to avoid race conditions
        const hasLiveState = !!freshSession.liveState;
        const hasJoiner = hasJoinerRef.current;
        const updateInFlight = updateInFlightRef.current;

        if (!hasLiveState || !hasJoiner || updateInFlight) {
          return;
        }

        const serverState = { ...DEFAULT_LIVE_STATE, ...freshSession.liveState } as LiveSessionState;
        const localState = confirmedLiveStateRef.current;

        // Check key fields that indicate the other person took action
        const phaseDrift = serverState.ratingPhase !== localState.ratingPhase;
        const checkerNameDrift = serverState.checkerName !== localState.checkerName;
        const checkerDrift = serverState.checkerSubmitted !== localState.checkerSubmitted;
        const checkerRatingDrift = serverState.checkerRating !== localState.checkerRating;
        const responderDrift = serverState.responderSubmitted !== localState.responderSubmitted;
        const responderRatingDrift = serverState.responderRating !== localState.responderRating;
        const explainBackDoneDrift = serverState.explainBackDone !== localState.explainBackDone;
        const checksCountDrift = serverState.checksCount !== localState.checksCount;
        const clarificationPhaseDrift = serverState.clarificationPhase !== localState.clarificationPhase;

        const serverHasUpdate = phaseDrift || checkerNameDrift || checkerDrift || checkerRatingDrift || responderDrift || responderRatingDrift || explainBackDoneDrift || checksCountDrift || clarificationPhaseDrift;

        if (serverHasUpdate) {
          // Track in Mixpanel (non-blocking - don't let analytics errors break the app)
          try {
            analytics.track('live_state_drift_detected', {
              sessionCode: currentCode,
              ratingPhase: serverState.ratingPhase,
              phaseDrift,
              checkerNameDrift,
              checkerDrift,
              responderDrift,
              explainBackDoneDrift,
            });
          } catch (err) {
            // Analytics failure shouldn't break the app, but log for visibility
            console.warn('[Live Poll] Analytics error:', err);
          }

          const mergedState = { ...DEFAULT_LIVE_STATE, ...serverState };
          setLiveState(mergedState);
          confirmedLiveStateRef.current = mergedState;
          setSession(freshSession);
        }
      } catch (err) {
        console.error('[Live Poll] Error:', err);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- We intentionally use only id/code to avoid re-subscribing on every state change
  }, [session?.id, session?.code]);

  // Update live state (syncs to all participants)
  // Uses ref for revert to avoid stale closure issues with rapid updates
  const updateLiveState = useCallback(
    async (updates: Partial<LiveSessionState>) => {
      if (!session) {
        return;
      }

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
        console.error('[Live Update] Failed to update state:', err);
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
  // P23.3: Track which flow type we're in locally ('check' = "Did you get it?", 'prove' = "Did I get it?")
  const [localFlowType, setLocalFlowType] = useState<'check' | 'prove'>('check');

  const handleStartCheck = useCallback(() => {
    if (!name || !partnerName) return;

    // Guard: if a check is already in progress (someone already submitted), don't start a new local rating
    // This prevents race condition where both users tap "I spoke" and submit simultaneously
    const currentState = confirmedLiveStateRef.current;
    if (currentState.checkerName || currentState.ratingPhase !== 'idle') {
      return;
    }

    // Track check initiation
    analytics.track('live_check_started', {
      session_code: session?.code,
      flow_type: 'check',
    });

    // Just show rating screen locally - don't touch shared state
    setLocalFlowType('check');
    setIsLocallyRating(true);
  }, [name, partnerName, session?.code]);

  // P23.3: Handle "Did I get it?" button tap - listener-initiated understanding check
  // In this flow, the listener (prover) rates their confidence first
  // The speaker (checker) rates how understood they feel
  // Like handleStartCheck, this only sets LOCAL state - shared state is set on submit
  const handleStartProve = useCallback(() => {
    if (!name || !partnerName) return;

    // Guard: if a check is already in progress, don't start a new one
    const currentState = confirmedLiveStateRef.current;
    if (currentState.checkerName || currentState.ratingPhase !== 'idle') {
      return;
    }

    // Track prove initiation
    analytics.track('live_prove_started', {
      session_code: session?.code,
      flow_type: 'prove',
    });

    // Just show rating screen locally - don't touch shared state until submit
    // This mirrors handleStartCheck behavior for consistent sealed-bid pattern
    setLocalFlowType('prove');
    setIsLocallyRating(true);
  }, [name, partnerName, session?.code]);

  // V7: Handle rating submission
  // "Did you get it?" flow: First person to submit becomes the checker
  // "Did I get it?" flow: First person to submit becomes the responder (prover)
  const handleRatingSubmit = useCallback(
    (rating: number) => {
      if (!name || !partnerName) return;

      // Clear local rating state
      setIsLocallyRating(false);

      // Use ref to get current confirmed state (avoids stale closure)
      const currentState = confirmedLiveStateRef.current;

      // Determine role for tracking
      const isFirstSubmitter = !currentState.checkerName;
      const role = isFirstSubmitter
        ? (localFlowType === 'prove' ? 'responder' : 'checker')
        : (currentState.checkerName === name ? 'checker' : 'responder');

      // Track rating submission
      analytics.track('live_rating_submitted', {
        session_code: session?.code,
        rating,
        role,
        flow_type: localFlowType,
        round: currentState.explainBackRatings.length,
      });

      const updates: Partial<LiveSessionState> = {
        ratingPhase: 'waiting',
      };

      // If no checker yet, this is the first submission
      if (!currentState.checkerName) {
        // P23.3: Handle "Did I get it?" flow differently
        // In "prove" flow, the person who submits first is the RESPONDER (prover/listener)
        // Their partner becomes the CHECKER (speaker)
        if (localFlowType === 'prove') {
          updates.proverName = name;           // Track who initiated "Did I get it?"
          updates.checkerName = partnerName;   // Partner (speaker) is the checker
          updates.responderRating = rating;    // Prover's confidence rating
          updates.responderSubmitted = true;
        } else {
          // "Did you get it?" flow - first person becomes checker (speaker)
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

          // Track understanding revealed with gap data
          const checkerRatingValue = isChecker ? rating : currentState.checkerRating;
          const responderRatingValue = isChecker ? currentState.responderRating : rating;
          const gap = (responderRatingValue ?? 0) - (checkerRatingValue ?? 0);

          const isPerfect = checkerRatingValue === 10 && responderRatingValue === 10;

          analytics.track('live_understanding_revealed', {
            session_code: session?.code,
            checker_rating: checkerRatingValue,
            responder_rating: responderRatingValue,
            gap,
            gap_type: gap > 0 ? 'overconfidence' : gap < 0 ? 'underconfidence' : 'none',
            is_perfect: isPerfect,
            round: currentState.explainBackRatings.length,
          });

          // Track perfect understanding on first round
          if (isPerfect) {
            analytics.track('live_perfect_understanding', {
              session_code: session?.code,
              rounds_to_achieve: 0,
              initial_checker_rating: checkerRatingValue,
              initial_responder_rating: responderRatingValue,
            });
          }
        }
      }

      updateLiveState(updates);
    },
    [name, partnerName, localFlowType, updateLiveState, session?.code]
  );

  // V7: Handle skip (resets to idle state for next check)
  // V10: Now tracks who skipped so partner can be notified
  const handleSkip = useCallback(() => {

    // Track round skip
    const currentState = confirmedLiveStateRef.current;
    analytics.track('live_round_skipped', {
      session_code: session?.code,
      phase: currentState.ratingPhase,
      round: currentState.explainBackRatings.length,
    });

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
      // P23.3: Clear prover (for "Did I get it?" flow)
      proverName: undefined,
      // Clear explain-back state
      explainBackRound: 0,
      explainBackRatings: [],
      explainBackDone: false,
      // Clear any pending role switch negotiation
      roleSwitchNegotiation: undefined,
      // Clear speaker clarification state
      clarificationPhase: undefined,
    });
  }, [name, updateLiveState, session?.code]);

  // Handle celebration complete - user clicked "Continue" on perfect rating celebration
  // Both users must acknowledge before state resets (prevents forceful exit for partner)
  const handleCelebrationComplete = useCallback(() => {
    const currentState = confirmedLiveStateRef.current;
    const acknowledged = currentState.celebrationAcknowledgedBy || [];

    // If user already acknowledged, ignore duplicate clicks
    if (acknowledged.includes(name)) {
      return;
    }

    const newAcknowledged = [...acknowledged, name];

    // Check if both users have acknowledged
    const bothAcknowledged = partnerName && newAcknowledged.includes(partnerName);

    if (bothAcknowledged) {
      // Both done - reset to idle state for a fresh start
      updateLiveState({
        ratingPhase: 'idle',
        // Don't set skippedBy - this is a natural completion, not a skip
        // Clear checker/responder
        checkerName: undefined,
        checkerRating: undefined,
        responderRating: undefined,
        checkerSubmitted: false,
        responderSubmitted: false,
        // P23.3: Clear prover (for "Did I get it?" flow)
        proverName: undefined,
        // Clear explain-back state
        explainBackRound: 0,
        explainBackRatings: [],
        explainBackDone: false,
        // Clear acknowledgment for next celebration
        celebrationAcknowledgedBy: [],
        // Clear any pending role switch negotiation
        roleSwitchNegotiation: undefined,
        // Clear speaker clarification state
        clarificationPhase: undefined,
      });
    } else {
      // Just add this user to acknowledged list - waiting for partner
      updateLiveState({
        celebrationAcknowledgedBy: newAcknowledged,
      });
    }
  }, [name, partnerName, updateLiveState]);

  // Handle "Let me explain back" - listener starts explaining
  const handleExplainBackStart = useCallback(() => {
    const currentState = confirmedLiveStateRef.current;
    analytics.track('live_explain_back_started', {
      session_code: session?.code,
      round: currentState.explainBackRatings.length + 1,
      checker_rating: currentState.checkerRating,
      responder_rating: currentState.responderRating,
    });

    updateLiveState({
      ratingPhase: 'explain-back',
      explainBackDone: false,
      // Clear any pending role switch negotiation (in case listener clicked "Respond as speaker" then changed mind)
      roleSwitchNegotiation: undefined,
      // Clear clarification state (listener is now acting)
      clarificationPhase: undefined,
    });
  }, [updateLiveState, session?.code]);

  // V11: Handle listener tapping "Done Explaining" - unlocks speaker's rating UI
  const handleExplainBackDone = useCallback(() => {
    updateLiveState({
      explainBackDone: true,
    });
  }, [updateLiveState]);

  // Handle listener wanting to share their perspective instead of explaining back
  // This now starts the negotiation flow instead of immediate role swap
  const handleSharePerspective = useCallback(() => {
    analytics.track('live_share_perspective_requested', {
      session_code: session?.code,
    });

    // Start negotiation flow - speaker will see Accept / Ask to explain back first
    updateLiveState({
      roleSwitchNegotiation: {
        requestedBy: name,
        state: 'pending',
      },
    });
  }, [name, updateLiveState, session?.code]);

  // Handle speaker asking listener to explain back first (negotiation step 1 → 2)
  const handleAskToExplainFirst = useCallback(() => {
    analytics.track('live_role_switch_ask_explain', {
      session_code: session?.code,
    });

    const currentState = confirmedLiveStateRef.current;
    updateLiveState({
      roleSwitchNegotiation: {
        requestedBy: currentState.roleSwitchNegotiation?.requestedBy || '',
        state: 'speaker-asked-to-explain',
      },
    });
  }, [updateLiveState, session?.code]);

  // Handle listener continuing as listener (accepting speaker's request to explain back)
  const handleContinueAsListener = useCallback(() => {
    analytics.track('live_role_switch_continue_listening', {
      session_code: session?.code,
    });

    // Clear negotiation and start explain-back
    updateLiveState({
      roleSwitchNegotiation: undefined,
      ratingPhase: 'explain-back',
      explainBackDone: false,
    });
  }, [updateLiveState, session?.code]);

  // Handle listener insisting they need to speak (negotiation step 2 → 3)
  const handleInsistToSpeak = useCallback(() => {
    analytics.track('live_role_switch_insist', {
      session_code: session?.code,
    });

    const currentState = confirmedLiveStateRef.current;
    updateLiveState({
      roleSwitchNegotiation: {
        requestedBy: currentState.roleSwitchNegotiation?.requestedBy || '',
        state: 'listener-insists',
      },
    });
  }, [updateLiveState, session?.code]);

  // Handle speaker letting listener speak (final step - accept the role switch)
  const handleLetThemSpeak = useCallback(() => {
    analytics.track('live_role_switch_accepted_after_insist', {
      session_code: session?.code,
    });

    // Reset to idle state - the listener can now initiate "Did you get me?"
    updateLiveState({
      ratingPhase: 'idle',
      checkerRating: undefined,
      responderRating: undefined,
      checkerName: undefined,
      proverName: undefined,
      checkerSubmitted: false,
      responderSubmitted: false,
      explainBackRound: 0,
      explainBackRatings: [],
      explainBackDone: false,
      perspectiveRequestedBy: undefined,
      roleSwitchNegotiation: undefined,
      // Clear speaker clarification state
      clarificationPhase: undefined,
    });
  }, [updateLiveState, session?.code]);

  // Handle speaker starting clarification (after rating < 10)
  const handleClarifyStart = useCallback(() => {
    analytics.track('live_clarify_started', {
      session_code: session?.code,
      round: confirmedLiveStateRef.current.explainBackRatings.length,
    });

    updateLiveState({
      clarificationPhase: 'speaker-clarifying',
    });
  }, [updateLiveState, session?.code]);

  // Handle speaker finishing clarification
  // After clarifying, listener gets to act (explain back again), speaker waits
  const handleClarifyDone = useCallback(() => {
    analytics.track('live_clarify_done', {
      session_code: session?.code,
      round: confirmedLiveStateRef.current.explainBackRatings.length,
    });

    updateLiveState({
      clarificationPhase: 'listener-responding',
    });
  }, [updateLiveState, session?.code]);

  // V6: Handle speaker rating after explain-back
  const handleExplainBackRate = useCallback(
    (rating: number) => {
      const currentState = confirmedLiveStateRef.current;
      const newExplainBackRatings = [...currentState.explainBackRatings, rating];
      const round = currentState.explainBackRound + 1;
      const isPerfect = rating === 10;

      // Track explain-back rating
      analytics.track('live_explain_back_rated', {
        session_code: session?.code,
        rating,
        round,
        is_perfect: isPerfect,
        previous_checker_rating: currentState.checkerRating,
      });

      // Track perfect understanding if achieved
      if (isPerfect) {
        analytics.track('live_perfect_understanding', {
          session_code: session?.code,
          rounds_to_achieve: round,
          initial_checker_rating: currentState.checkerRating,
          initial_responder_rating: currentState.responderRating,
        });
      }

      updateLiveState({
        ratingPhase: 'results',
        explainBackRound: round,
        explainBackRatings: newExplainBackRatings,
        explainBackDone: false, // Reset for next round
        checksCount: currentState.checksCount + 1,
        checksTotal: currentState.checksTotal + rating,
        ...(rating >= 9 ? { ideasUnderstood: currentState.ideasUnderstood + 1 } : {}),
        // If rating < 10, speaker enters "deciding to clarify" state
        // Listener will see waiting state until speaker decides (Clarify now / Good enough)
        clarificationPhase: rating < 10 ? 'speaker-deciding' : undefined,
      });
    },
    [updateLiveState, session?.code]
  );

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

    // P25: Track start meeting click
    analytics.track('live_meeting_start_clicked');

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

      // Track session creation
      analytics.track('live_session_created', {
        session_code: newSession.code,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper: Extract room code from URL or return input as-is if it's a code
  // Supports: https://claritypledge.com/live/ABC123, http://..., www..., localhost:5173/live/ABC123
  const extractCodeFromInput = (input: string): string | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // If it looks like a URL (contains / or .), try to extract code
    if (trimmed.includes('/') || trimmed.includes('.')) {
      // Match /live/CODE pattern at end of URL
      const match = trimmed.match(/\/live\/([A-Za-z0-9]{6})(?:[/?#]|$)/);
      if (match) {
        return match[1].toUpperCase();
      }
      // Invalid URL format for our purposes
      return null;
    }

    // Not a URL - treat as direct code input
    const code = trimmed.toUpperCase();
    if (code.length === 6 && /^[A-Z0-9]+$/.test(code)) {
      return code;
    }

    return null;
  };

  // Join session handler
  const handleJoin = async () => {
    const nameError = validateName(name);
    if (nameError) {
      setError(nameError);
      return;
    }

    // Extract code from URL or direct input
    const extractedCode = extractCodeFromInput(roomCode);
    if (!extractedCode) {
      setError('Enter a 6-character code or a meeting link');
      return;
    }
    const normalizedCode = extractedCode;

    // P25: Track join meeting click
    const inputWasLink = roomCode.includes('/') || roomCode.includes('.');
    analytics.track('live_meeting_join_clicked', {
      code_length: normalizedCode.length,
      input_type: inputWasLink ? 'link' : 'code',
    });

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

      // Track session join
      analytics.track('live_session_joined', {
        session_code: joinedSession.code,
        join_method: isJoinViaLink ? 'link' : 'code',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join session');
    } finally {
      setIsLoading(false);
    }
  };

  // Cancel waiting and go back to start
  const handleCancelWaiting = () => {
    clearStoredSession();
    setSession(null);
    setView('start');
    setRoomCode('');
    // Reset refs to ensure clean state for next session
    iAmLeavingRef.current = false;
    partnerLeftRef.current = false;
    sessionEndedRef.current = false;
    hasJoinerRef.current = false;
    lastJoinerNameRef.current = null;
  };

  // Show exit confirmation dialog
  const handleExitMeeting = useCallback(() => {
    setShowExitConfirm(true);
  }, []);

  // Actually exit meeting after confirmation
  const confirmExitMeeting = useCallback(async () => {
    // Mark that I am leaving (prevents polling from detecting my own departure)
    iAmLeavingRef.current = true;

    // Track session exit
    if (session) {
      analytics.track('live_session_exited', {
        session_code: session.code,
        checks_completed: liveState.checksCount,
        is_creator: isCreator,
      });

      // Notify partner by updating the database
      try {
        if (isCreator) {
          // Creator leaving = session ends for everyone
          await endClaritySession(session.id);
        } else {
          // Joiner leaving = clear their name so creator knows
          await clearSessionJoiner(session.id);
        }
      } catch (err) {
        console.error('[Live] Error updating session on exit:', err);
        // Continue with local cleanup even if DB update fails
      }
    }

    clearStoredSession();
    setSession(null);
    setLiveState(DEFAULT_LIVE_STATE);
    setIsLocallyRating(false);
    setView('start');
    setRoomCode('');
    setShowExitConfirm(false);
    // Reset all departure refs so future sessions can work properly
    // Critical: Without this, polling would be permanently disabled for new sessions
    iAmLeavingRef.current = false;
    partnerLeftRef.current = false;
    sessionEndedRef.current = false;
    hasJoinerRef.current = false;
    lastJoinerNameRef.current = null;
    // Navigate to clean URL (replace to avoid back button returning to meeting)
    navigate('/live', { replace: true });
  }, [session, liveState.checksCount, isCreator, navigate]);

  // Handle starting a new session after partner left
  const handleStartNewAfterPartnerLeft = useCallback(() => {
    setPartnerLeft(false);
    setSessionEnded(false);
    setDepartedPartnerName(null);
    clearStoredSession();
    setSession(null);
    setLiveState(DEFAULT_LIVE_STATE);
    setView('start');
    setRoomCode('');
    // Reset all departure refs so future sessions can work properly
    // Critical: Without this, polling would be disabled or incorrectly detect departures
    iAmLeavingRef.current = false;
    partnerLeftRef.current = false;
    sessionEndedRef.current = false;
    hasJoinerRef.current = false;
    lastJoinerNameRef.current = null;
    // Navigate to clean URL (replace to avoid back button returning to meeting)
    navigate('/live', { replace: true });
  }, [navigate]);

  // Show partner left screen if partner departed
  if (sessionEnded || partnerLeft) {
    return (
      <div className="flex flex-col h-screen">
        <LiveSessionBanner title="Meeting Ended" isLiveMeeting={false} />
        <div className="flex-1 flex items-center justify-center">
          <PartnerLeftScreen
            partnerName={departedPartnerName}
            sessionEnded={sessionEnded}
            onStartNew={handleStartNewAfterPartnerLeft}
          />
        </div>
      </div>
    );
  }

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
    // Join via link: simplified UI with just name input + join button
    if (isJoinViaLink) {
      const joinTitle = hostName ? `Join ${hostName}'s Meeting` : 'Join Clarity Meeting';
      return (
        <div className="flex flex-col h-screen">
          <LiveSessionBanner title={joinTitle} isLiveMeeting={false} />
          <div className="flex-1 container mx-auto px-4 py-8 md:py-12 max-w-md">
            <div className="text-center mb-8">
              {!hostName && (
                <div className="inline-flex items-center px-3 py-1.5 bg-muted rounded-full">
                  <span className="text-sm text-muted-foreground">
                    Room: <span className="font-mono font-medium">{roomCode}</span>
                  </span>
                </div>
              )}
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

              <Button
                onClick={handleJoin}
                disabled={isLoading || !name.trim()}
                className="w-full"
                size="lg"
              >
                {isLoading ? 'Joining...' : 'Join Meeting'}
              </Button>

              <Link
                to="/live"
                className="inline-flex items-center justify-center text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                Back
              </Link>
            </div>
          </div>
        </div>
      );
    }

    // P25: Differentiate logged-in vs guest experience
    const isLoggedIn = !!user;
    const firstName = user?.name?.split(' ')[0] || 'there';

    // Handle login click for guests
    const handleLoginClick = () => {
      analytics.track('live_meeting_login_clicked');
      navigate('/sign-pledge');
    };

    return (
      <div className="flex flex-col h-screen">
        <LiveSessionBanner title="Clarity Meeting" isLiveMeeting={false} />
        <div className="flex-1 container mx-auto px-4 py-8 md:py-12 max-w-md md:max-w-2xl">
          <div className="space-y-6">
            {/* P25: Header - personalized greeting for logged-in, value prop for guests */}
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-semibold">
                {isLoggedIn ? `Welcome back, ${firstName}!` : 'Practice Clarity Together'}
              </h1>
              <p className="text-muted-foreground">
                {isLoggedIn ? 'Start or join a clarity meeting' : 'Check understanding in real-time'}
              </p>
            </div>

            {/* Guest: name input - compact to match button row */}
            {!isLoggedIn && (
              <div className="space-y-2">
                <Label htmlFor="name">Your Name</Label>
                <Input
                  id="name"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  className="max-w-[280px] rounded-full h-11"
                />
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            {/* P25: Google Meet style - stacked on mobile, inline on desktop */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-center items-start gap-3">
              {/* New meeting button - compact (not full width) */}
              <Button
                onClick={handleCreate}
                disabled={isLoading || (!isLoggedIn && !name.trim())}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 rounded-full h-11 px-5"
              >
                <Mic className="h-[18px] w-[18px]" />
                <span className="text-sm">{isLoading ? 'Creating...' : 'New meeting'}</span>
              </Button>

              {/* Code input + Join - with real-time validation */}
              {(() => {
                // Real-time validation for code/link input
                const hasInput = roomCode.trim().length > 0;
                const extractedCode = hasInput ? extractCodeFromInput(roomCode) : null;
                const isValidInput = !!extractedCode;
                const hasName = isLoggedIn || name.trim().length > 0;
                const canJoin = hasName && isValidInput;

                // Determine error message for inline display
                let inputError: string | null = null;
                if (hasInput && !isValidInput) {
                  if (roomCode.includes('/') || roomCode.includes('.')) {
                    inputError = 'Invalid meeting link';
                  } else {
                    inputError = 'Code must be 6 characters';
                  }
                } else if (hasInput && isValidInput && !hasName) {
                  inputError = 'Enter your name first';
                }

                return (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className={`flex items-center rounded-full h-11 px-4 gap-2 bg-background transition-colors border-2 ${
                        hasInput && !isValidInput
                          ? 'border-red-400'
                          : 'border-input focus-within:border-blue-500'
                      }`}>
                        <Keyboard className={`h-[18px] w-[18px] flex-shrink-0 transition-colors ${
                          hasInput && !isValidInput
                            ? 'text-red-400'
                            : 'text-muted-foreground'
                        }`} />
                        <input
                          placeholder="Enter a code or link"
                          value={roomCode}
                          onChange={(e) => setRoomCode(e.target.value)}
                          maxLength={500}
                          className="bg-transparent outline-none text-sm placeholder:text-muted-foreground w-[160px] md:w-[180px]"
                        />
                      </div>
                      <button
                        onClick={handleJoin}
                        disabled={isLoading || !canJoin}
                        className={`font-medium text-sm transition-colors px-2 py-2 flex-shrink-0 ${
                          canJoin
                            ? 'text-blue-600 hover:text-blue-700'
                            : 'text-muted-foreground cursor-default'
                        }`}
                      >
                        Join
                      </button>
                    </div>
                    {inputError && (
                      <p className="text-xs text-red-500 pl-1">{inputError}</p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* P25: Login link for guests */}
            {!isLoggedIn && (
              <div className="text-center pt-2">
                <button
                  onClick={handleLoginClick}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Already have an account? <span className="underline">Log in</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // WAITING VIEW
  // Generate shareable link
  const shareLink = session ? `${window.location.origin}/live/${session.code}` : '';

  // Handle share: native share on mobile only, copy on desktop
  const handleShare = async () => {
    if (!session) return;

    // Detect mobile using userAgent - more reliable than touch/screen size
    // This avoids the awkward macOS share sheet on desktop Safari/Chrome
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);

    // Use native share only on mobile
    if (isMobile && navigator.share) {
      try {
        await navigator.share({
          title: 'Join my Clarity Meeting',
          text: `Join my Clarity Meeting`,
          url: shareLink,
        });
        return;
      } catch (err) {
        // User cancelled or share failed, fall through to copy
        if ((err as Error).name === 'AbortError') return;
      }
    }

    // Desktop (or mobile fallback): copy to clipboard
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (view === 'waiting' && session) {
    // Display-friendly link (without https://)
    const displayLink = shareLink.replace('https://', '').replace('http://', '');

    return (
      <div className="flex flex-col h-screen">
        <LiveSessionBanner title="Waiting for Partner" isLiveMeeting={false} />
        <div className="flex-1 container mx-auto px-4 py-8 md:py-12 max-w-md">
          <div className="text-center space-y-6">
            <p className="text-muted-foreground">
              Share this link with your partner:
            </p>

            {/* Link row with copy/share */}
            <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
              <span
                data-testid="share-link"
                className="text-sm font-mono text-muted-foreground truncate flex-1 text-left pl-2"
              >
                {displayLink}
              </span>
              <Button
                onClick={handleShare}
                size="sm"
                className="flex-shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 mr-1" />
                ) : (
                  <Share2 className="h-4 w-4 mr-1" />
                )}
                {copied ? 'Copied!' : 'Share'}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Or show them this QR code:
            </p>

            {/* QR Code */}
            <div className="p-4 bg-white rounded-lg border inline-block">
              <QRCodeSVG
                value={shareLink}
                size={160}
                level="M"
              />
            </div>

            <p className="text-sm text-muted-foreground">
              Waiting for partner to join...
            </p>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelWaiting}
              className="text-muted-foreground w-full"
            >
              Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // LIVE/REVIEW VIEW
  if ((view === 'live') && session && partnerName) {
    return (
      <div className="flex flex-col h-screen">
        <LiveModeView
          liveState={liveState}
          currentUserName={name}
          partnerName={partnerName}
          // P23.2/P23.3: Check/Prove model handlers
          onStartCheck={handleStartCheck}
          // P23.3: "Did I get it?" - listener-initiated understanding check
          onStartProve={handleStartProve}
          onRatingSubmit={handleRatingSubmit}
          onSkip={handleSkip}
          onBackToIdle={handleSkip}
          // V8: Explain-back (simplified - listener sees buttons immediately)
          onExplainBackStart={handleExplainBackStart}
          onExplainBackRate={handleExplainBackRate}
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
          // P23.3: Local flow type for correct rating question before submit
          localFlowType={localFlowType}
          // Listener wants to share perspective instead of explaining back
          onSharePerspective={handleSharePerspective}
          // Negotiation handlers for role switch
          onAskToExplainFirst={handleAskToExplainFirst}
          onContinueAsListener={handleContinueAsListener}
          onInsistToSpeak={handleInsistToSpeak}
          onLetThemSpeak={handleLetThemSpeak}
          onClarifyStart={handleClarifyStart}
          onClarifyDone={handleClarifyDone}
        />

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
