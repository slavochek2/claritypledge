/**
 * @file clarity-live-page.tsx
 * @description P23: Live Clarity Sessions - Two people join, talk naturally,
 * the app acts as a quiet referee enforcing the understanding protocol.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Share2, Check, Keyboard, Mic, ShieldOff, Sparkles, Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// P50: ConsentNotice import removed - replaced with inline consent checkbox
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
  patchClaritySessionLiveState,
  clearSessionJoiner,
  endClaritySession,
  uploadSessionRecording,
  uploadAudioChunk,
  uploadEventsSnapshot,
  MAX_NAME_LENGTH,
  type ClaritySession,
  recordTermsAcceptance,
  recordSessionConsent,
  needsTermsAcceptance,
} from '@/app/data/api';
import { TermsUpdateDialog } from '@/app/components/live-meeting/terms-update-dialog';
import { analytics } from '@/lib/mixpanel';
import { useAuth } from '@/auth';
import {
  type LiveSessionState,
  type PositionType,
  type StoryWithPoints,
  DEFAULT_LIVE_STATE,
} from '@/app/types';
import { pointsService } from '@/app/data/points-service';
import { eventsService } from '@/app/data/events-service';
import { calibrationService } from '@/app/data/calibration-service';
import { supabase } from '@/lib/supabase';
import { LiveModeView, PartnerLeftScreen } from '@/app/components/partners/live-mode-view';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { useMicrophonePermission } from '@/hooks/useMicrophonePermission';
import { MicrophonePermissionDialog } from '@/app/components/live-meeting/microphone-permission-dialog';
import { SessionEventsCollector } from '@/lib/session-events-collector';
import { GoogleAuthButton } from '@/app/components/auth/google-auth-button';
import { toast } from 'sonner';
import { RemovePositionDialog, useRemovePositionGuard } from '@/app/components/shared/remove-position-dialog';
import { useLiveSession } from '@/app/contexts/live-session-context';

type ViewState = 'start' | 'waiting' | 'live';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Session persistence keys (per-tab using sessionStorage instead of localStorage) */
const STORAGE_KEYS = {
  SESSION_CODE: 'clarity_live_session_code',
  SESSION_ID: 'clarity_live_session_id',
  USER_NAME: 'clarity_live_user_name',
  IS_CREATOR: 'clarity_live_is_creator',
} as const;

/** Polling interval for fallback session updates (ms)
 * Set to 1000ms for more responsive sync when realtime subscription fails
 * (common on mobile networks with unreliable WebSocket connections) */
const POLL_INTERVAL_MS = 1000;

/** Use sessionStorage for tab-isolated storage (each tab has its own session data) */
const storage = typeof window !== 'undefined' ? window.sessionStorage : null;

// ============================================================================
// STATE SYNCHRONIZATION ARCHITECTURE
// ============================================================================
// This component uses a ref-based state machine to handle real-time sync
// between two users. The complexity is intentional to handle edge cases:
//
// REFS (immediate updates, no re-render delay):
// - hasJoinerRef: Tracks if joiner has been detected (for departure detection)
// - lastJoinerNameRef: Stores joiner name before it's cleared (for partner left screen)
// - sessionCodeRef: Current session code for polling (avoids stale closures)
// - currentSessionIdRef: Guards against stale subscription callbacks
// - confirmedLiveStateRef: Last confirmed state from server (prevents drift)
// - updateInFlightRef: Prevents polling from overwriting optimistic updates
// - partnerLeftRef/sessionEndedRef: Track departure state immediately
// - iAmLeavingRef: Prevents detecting own departure as partner leaving
//
// SYNC STRATEGY:
// 1. Supabase Realtime subscription for immediate updates
// 2. Polling fallback (POLL_INTERVAL_MS) for unreliable mobile connections
// 3. Drift detection compares server state vs confirmedLiveStateRef
// 4. Optimistic updates blocked during updateInFlightRef=true
//
// See: B48 (mic permission gating), P28.1 (audio recording)
// ============================================================================

export function ClarityLivePage() {
  // Get room code from URL if present (for direct join via shared link)
  const { code: urlCode } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isJoinViaLink = !!urlCode;
  const { setIsLive, pendingNavTo, setPendingNavTo } = useLiveSession();

  // P124: Get event context from URL params
  const returnTo = searchParams.get('returnTo');
  const partnerNameFromUrl = searchParams.get('partner');
  const isFromEvent = returnTo?.startsWith('/events/');

  // Get logged-in user's name (if authenticated)
  const { user, isLoading: isAuthLoading } = useAuth();

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

  // P144: Partner's ear count for credibility badge in host view
  const [partnerEarsCount, setPartnerEarsCount] = useState(0);

  // Exit confirmation dialog state
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Partner departure state
  const [partnerLeft, setPartnerLeft] = useState(false); // Joiner left (creator sees this)
  const [sessionEnded, setSessionEnded] = useState(false); // Creator left (joiner sees this)

  // Sync live state to context so BottomNav can intercept nav during live sessions
  // Not live if: still on start screen, or session has ended (partner left / creator left)
  useEffect(() => {
    const isInLive = view === 'live' && !sessionEnded && !partnerLeft;
    setIsLive(isInLive);
    return () => { setIsLive(false); };
  }, [view, sessionEnded, partnerLeft, setIsLive]);

  // When BottomNav sets a pending destination, show exit confirmation
  useEffect(() => {
    if (pendingNavTo) {
      setShowExitConfirm(true);
    }
  }, [pendingNavTo]);

  // P37.2a: Consent flow state
  const [showTermsUpdateDialog, setShowTermsUpdateDialog] = useState(false);
  const [consentLoading, setConsentLoading] = useState(false);
  // Store pending join info for after consent or mic retry
  const pendingJoinRef = useRef<{ code: string; userId?: string; joinName?: string } | null>(null);

  // P396: Prevents auto-join effect from firing more than once
  const autoJoinFiredRef = useRef(false);

  // P160: Private session mode (recording toggle — creator only, locked after session created)
  // P406: Default to private (AI Insights off) when arriving from a practice room (?insights=off)
  const [isPrivate, setIsPrivate] = useState(() => searchParams.get('insights') === 'off');
  // P160: Recording state for join-via-link flow (fetched from session data)
  const [joinSessionIsPrivate, setJoinSessionIsPrivate] = useState(false);

  const [departedPartnerName, setDepartedPartnerName] = useState<string | null>(null);

  // B48: Pending live transition state (for gated mic permission check)
  // When true, triggers gateMicAndGoLive effect instead of direct setView('live')
  const [pendingLiveTransition, setPendingLiveTransition] = useState(false);

  // Derived values
  const partnerName = session
    ? isCreator
      ? session.joinerName
      : session.creatorName
    : undefined;

  // P144: Fetch partner's ear count for credibility badge in host view.
  // Partner's profile ID is the one that belongs to the OTHER participant.
  useEffect(() => {
    const partnerProfileId = session
      ? isCreator
        ? session.joinerProfileId
        : session.creatorProfileId
      : null;
    if (!partnerProfileId) return;
    calibrationService.getEarsCount(partnerProfileId).then(setPartnerEarsCount);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- calibrationService is a module singleton; setPartnerEarsCount is a stable state setter; both are referentially stable
  }, [session?.joinerProfileId, session?.creatorProfileId, isCreator]);

  // P28.1: Audio recording and events collection for ML training
  // Uses chunked mode (30s uploads) for reliability - data is saved even if user closes browser
  const sessionCodeForChunks = useRef<string | null>(null);
  const userNameForChunks = useRef<string | null>(null);
  const sessionForChunks = useRef<ClaritySession | null>(null);
  const userForChunks = useRef<{ id: string; email?: string } | null>(null); // For Mixpanel correlation
  const eventsCollectorRef = useRef(new SessionEventsCollector());

  const handleChunkReady = useCallback(async (
    chunkBlob: Blob,
    chunkNumber: number,
    isLastChunk: boolean
  ) => {
    const code = sessionCodeForChunks.current;
    const userName = userNameForChunks.current;
    const currentSession = sessionForChunks.current;
    const currentUser = userForChunks.current;
    if (!code || !userName) {
      console.warn('[P28.1] Cannot upload chunk - missing session code or user name');
      return;
    }

    // Upload audio chunk
    await uploadAudioChunk(code, userName, chunkBlob, chunkNumber, isLastChunk);

    // P28.2: Upload events snapshot with each chunk
    // This ensures events are saved even if user closes browser
    // Each user uploads their own events file (prefixed with username) to avoid overwrites
    if (currentSession && eventsCollectorRef.current.isStarted()) {
      const participants: { name: string; role: 'creator' | 'joiner' }[] = [
        { name: currentSession.creatorName, role: 'creator' },
        ...(currentSession.joinerName ? [{ name: currentSession.joinerName, role: 'joiner' as const }] : []),
      ];
      // Include uploader info for Mixpanel correlation (if logged in)
      const uploader = currentUser
        ? { supabaseUserId: currentUser.id, email: currentUser.email, name: userName }
        : { name: userName };
      await uploadEventsSnapshot(code, userName, chunkNumber, eventsCollectorRef.current, participants, uploader);
    }
  }, []);

  const { isRecording, startRecording, stopRecording } = useAudioRecorder({
    onChunkReady: handleChunkReady,
    chunkIntervalMs: 30000, // 30 seconds
  });

  // P40: Microphone permission handling
  const {
    status: micStatus,
    error: micError,
    attemptCount: micAttemptCount,
    requestPermission: requestMicPermission,
    reset: resetMic,
  } = useMicrophonePermission();
  const [showMicDialog, setShowMicDialog] = useState(false);

  // P28.2: trackLiveEvent is now just analytics.track - ML collection happens automatically
  // via registerMLCollector() when recording starts. Keeping alias for grep-ability.
  const trackLiveEvent = analytics.track;

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
  // P272: Guard against duplicate story verification inserts on re-renders
  const verificationFiredRef = useRef<Set<string>>(new Set());
  // P516: Track last user action timestamp for exit telemetry
  const lastActionTimestampRef = useRef<number>(Date.now());

  useEffect(() => {
    hasJoinerRef.current = !!session?.joinerName;
    // Store the joiner name while it exists (for partner left screen)
    if (session?.joinerName) {
      lastJoinerNameRef.current = session.joinerName;
    }
    sessionCodeRef.current = session?.code ?? null;
    currentSessionIdRef.current = session?.id ?? null;
    // Keep sessionStorage in sync so AuthContext can access it during logout
    if (session?.id) {
      storage?.setItem(STORAGE_KEYS.SESSION_ID, session.id);
    } else {
      storage?.removeItem(STORAGE_KEYS.SESSION_ID);
    }
  }, [session?.joinerName, session?.code, session?.id]);

  // Keep departure refs in sync with state
  useEffect(() => {
    partnerLeftRef.current = partnerLeft;
    sessionEndedRef.current = sessionEnded;
  }, [partnerLeft, sessionEnded]);

  // Refs to track isCreator and view for use in pagehide handler (avoids stale closure)
  const isCreatorRef = useRef(isCreator);
  useEffect(() => {
    isCreatorRef.current = isCreator;
  }, [isCreator]);

  // P126: Keep a current JWT ref so pagehide handler can use it for authenticated REST calls.
  // The anon key alone is blocked by RLS on clarity_sessions for the joiner PATCH path.
  const jwtRef = useRef<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      jwtRef.current = data.session?.access_token ?? null;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      jwtRef.current = session?.access_token ?? null;
    });
    return () => subscription.unsubscribe();
  }, []);
  const viewRef = useRef<ViewState>(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Fix A: Cleanup session on tab close / browser unload (pagehide is more reliable than beforeunload)
  // Only fires when actually leaving (not on bfcache suspend) and only from live view.
  //
  // P126: Use fetch({ keepalive: true }) instead of normal async fetch calls.
  // keepalive: true tells the browser to keep the request alive even after the page is
  // torn down — equivalent to sendBeacon but supports custom headers (required for
  // Supabase apikey/Authorization). Without keepalive, the browser kills in-flight
  // fetch calls during pagehide, making departure detection unreliable.
  useEffect(() => {
    const handlePageHide = (e: PageTransitionEvent) => {
      if (e.persisted) return; // bfcache — page will be restored, skip cleanup
      const sessionId = currentSessionIdRef.current;
      if (!sessionId || iAmLeavingRef.current) return;
      if (viewRef.current !== 'live') return; // waiting room close doesn't signal sessionEnded
      iAmLeavingRef.current = true;

      // P516: Track session exit via pagehide (tab close / navigation away)
      analytics.track('live_session_exited', {
        session_code: sessionCodeRef.current,
        exit_reason: 'pagehide',
        time_since_last_action_ms: Date.now() - lastActionTimestampRef.current,
        had_focus_when_exited: !document.hidden,
        is_creator: isCreatorRef.current,
      });

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      // Use the user's JWT when available so RLS-protected tables (joiner PATCH) are
      // authorised. Fall back to anon key — creator path uses SECURITY DEFINER RPC which
      // bypasses RLS regardless.
      const authToken = jwtRef.current ?? supabaseAnonKey;
      const headers = {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${authToken}`,
        'Prefer': 'return=minimal',
      };

      if (isCreatorRef.current) {
        // Creator leaving: patch live_state to set sessionEnded=true so joiner sees "partner left"
        // Fire-and-forget with keepalive so the browser completes this even after page teardown.
        fetch(
          `${supabaseUrl}/rest/v1/rpc/patch_live_state`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              p_session_id: sessionId,
              p_patch: { sessionEnded: true, sessionEndedAt: new Date().toISOString() },
            }),
            keepalive: true,
          }
        ).catch(() => {});
      } else {
        // Joiner leaving: clear joiner_name so creator sees "partner left"
        fetch(
          `${supabaseUrl}/rest/v1/clarity_sessions?id=eq.${sessionId}`,
          {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ joiner_name: null }),
            keepalive: true,
          }
        ).catch(() => {});
      }
    };
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        // Restored from bfcache — reset leaving flag so session resumes normally
        iAmLeavingRef.current = false;
      }
    };
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  // P66.1: Auth gate - redirect guests without join code to signup
  // Wait for session restoration before redirecting (prevents kicking out guests who refresh)
  useEffect(() => {
    if (isAuthLoading) return;
    if (isRestoring) return; // Don't redirect while checking for saved session
    if (user) return;
    if (isJoinViaLink) return;
    // Check for a stored session — guest may have refreshed mid-session
    const storedCode = storage?.getItem(STORAGE_KEYS.SESSION_CODE);
    if (storedCode) return; // Restoration will handle this
    navigate('/signup');
  }, [isAuthLoading, isRestoring, user, isJoinViaLink, navigate]);

  // Pre-fill name from logged-in user (if authenticated and name is empty)
  useEffect(() => {
    if (user?.name && !name) {
      setName(user.name);
    }
  }, [user?.name, name]);

  // B48: Old P40 effect removed - mic permission is now checked BEFORE transitioning to live
  // via gateMicAndGoLive() and pendingLiveTransition pattern (see line ~1390)

  // P28.1: Start audio recording when session goes live AND mic permission granted
  // P28.2: Only record in production to avoid polluting training data with dev sessions
  useEffect(() => {
    // Gate C (P160): skip recording entirely for private sessions
    if (view === 'live' && session && !isRecording && micStatus === 'granted' && !session.isPrivate) {
      // Skip recording in dev - only capture production sessions
      if (!import.meta.env.PROD) {
        console.log('[P28.1] Skipping recording in dev mode (mic permission granted)');
        return;
      }

      // Permission granted - start recording
      console.log('[P28.1] Session is live, starting recording and events collection');
      // Set refs for chunk upload callback (avoids stale closures)
      sessionCodeForChunks.current = session.code;
      userNameForChunks.current = name;
      sessionForChunks.current = session; // P28.2: Store session for events snapshot
      userForChunks.current = user ? { id: user.id, email: user.email } : null; // For Mixpanel correlation
      eventsCollectorRef.current.start();
      // P28.2: Register collector so ALL analytics.track() calls are captured for ML
      analytics.registerMLCollector(eventsCollectorRef.current);
      startRecording().catch((err) => {
        console.error('[P28.1] Failed to start recording:', err);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- name is immutable once view='live'; startRecording/analytics are stable module refs
  }, [view, session?.id, session?.isPrivate, session?.code, micStatus, isRecording]);

  // P28.2: Keep sessionForChunks and userForChunks in sync with updates
  // This is important when joiner joins after recording has started
  // or when user auth state changes during a session
  useEffect(() => {
    if (view === 'live' && session && sessionForChunks.current) {
      sessionForChunks.current = session;
    }
  }, [view, session]);

  useEffect(() => {
    if (view === 'live' && isRecording && user) {
      userForChunks.current = { id: user.id, email: user.email };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- We only want to sync when user id/email changes, not on every user object reference change
  }, [view, isRecording, user?.id, user?.email]);

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

  // Request mic permission proactively when host enters waiting view
  // This ensures the host is ready when partner joins (better UX than requesting mid-flow)
  useEffect(() => {
    // Only request if not already granted or in progress
    // Gate A (P160): skip mic request for private sessions — no recording needed
    if (view === 'waiting' && isCreator && micStatus === 'unknown' && !isPrivate) {
      console.log('[Mic] Proactively requesting mic permission for host in waiting view');
      requestMicPermission().then((granted) => {
        if (!granted) {
          // Show retry dialog if permission denied
          console.log('[Mic] Permission denied in waiting view, showing retry dialog');
          setShowMicDialog(true);
        }
      });
    }
  }, [view, isCreator, micStatus, isPrivate, requestMicPermission]);

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
            // B48: Use pendingLiveTransition to trigger mic permission gate
            const restoredLiveState = restoredSession.liveState as Record<string, unknown> | null;
            const sessionAlreadyEnded = restoredLiveState?.sessionEnded === true;
            if (restoredSession.joinerName && !sessionAlreadyEnded) {
              setPendingLiveTransition(true);
            } else if (restoredSession.joinerName && sessionAlreadyEnded) {
              // Session ended — don't restore into live view, start fresh
              clearStoredSession();
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

  // Fetch host name when joining via link (for personalized "Join X's Session" title)
  useEffect(() => {
    if (!isJoinViaLink || !urlCode) return;

    const fetchHostName = async () => {
      try {
        const sessionInfo = await getClaritySession(urlCode.toUpperCase());
        if (sessionInfo?.creatorName) {
          setHostName(sessionInfo.creatorName);
        }
        // P160: Capture session's recording state for joiner UI
        setJoinSessionIsPrivate(sessionInfo?.isPrivate ?? false);
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
    storage?.removeItem(STORAGE_KEYS.SESSION_ID);
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
          exit_reason: 'partner_departure',
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
          exit_reason: 'partner_departure',
        });
        return; // Don't process further updates after partner leaves
      }

      setSession(updatedSession);

      // Sync live state from session (merge with defaults for missing fields)
      // Also update the confirmed ref to prevent drift detection from reverting
      // IMPORTANT: Skip if an update is in flight to prevent realtime from reverting optimistic updates
      // This fixes the "flashing button" bug where realtime delivers old state before DB save completes
      if (updatedSession.liveState && !updateInFlightRef.current) {
        const mergedState = { ...DEFAULT_LIVE_STATE, ...updatedSession.liveState } as LiveSessionState;
        setLiveState(mergedState);
        confirmedLiveStateRef.current = mergedState;
      }

      // When joiner joins, move to live view
      // B48: Use functional update + pendingLiveTransition to gate mic permission check
      if (updatedSession.joinerName) {
        markJoinerDetected(updatedSession.joinerName);
        setView((currentView) => {
          if (currentView === 'waiting') {
            // Trigger mic permission gate instead of going directly to 'live'
            setPendingLiveTransition(true);
          }
          return currentView; // Don't change view here - let the effect handle it
        });
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
        // B48: Use pendingLiveTransition to gate mic permission check
        if (freshSession.joinerName && !hasJoinerRef.current) {
          markJoinerDetected(freshSession.joinerName);
          setSession(freshSession);
          if (freshSession.liveState) {
            setLiveState({ ...DEFAULT_LIVE_STATE, ...freshSession.liveState } as LiveSessionState);
            confirmedLiveStateRef.current = { ...DEFAULT_LIVE_STATE, ...freshSession.liveState } as LiveSessionState;
          }
          setView((currentView) => {
            if (currentView === 'waiting') {
              // Trigger mic permission gate instead of going directly to 'live'
              setPendingLiveTransition(true);
            }
            return currentView; // Don't change view here - let the effect handle it
          });
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
            exit_reason: 'partner_departure',
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
            exit_reason: 'partner_departure',
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
        const roleSwitchNegotiationDrift = serverState.roleSwitchNegotiation?.state !== localState.roleSwitchNegotiation?.state;
        // Bug 5: story selection fields were missing from drift check — partner's screen
        // never updated when Realtime WebSocket dropped (common on mobile).
        const selectedStoryIdDrift = serverState.selectedStoryId !== localState.selectedStoryId;
        const selectedStoryDataDrift = !!serverState.selectedStoryData !== !!localState.selectedStoryData;
        const selectedContentTitleDrift = serverState.selectedContentTitle !== localState.selectedContentTitle;
        // celebrationAcknowledgedBy must be in drift check so both parties can coordinate
        // the two-party Continue when Realtime is unavailable (mobile WebSocket dropout).
        const celebrationAcknowledgedByDrift = (serverState.celebrationAcknowledgedBy?.length ?? 0) !== (localState.celebrationAcknowledgedBy?.length ?? 0);
        // P490: livePositions missing from drift check caused guest positions to never sync
        // when Realtime WebSocket dropped. JSON.stringify comparison consistent with celebrationAcknowledgedBy pattern.
        const livePositionsDrift = JSON.stringify(serverState.livePositions ?? {}) !== JSON.stringify(localState.livePositions ?? {});

        const serverHasUpdate = phaseDrift || checkerNameDrift || checkerDrift || checkerRatingDrift || responderDrift || responderRatingDrift || explainBackDoneDrift || checksCountDrift || clarificationPhaseDrift || roleSwitchNegotiationDrift || selectedStoryIdDrift || selectedStoryDataDrift || selectedContentTitleDrift || celebrationAcknowledgedByDrift || livePositionsDrift;

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
              livePositionsDrift,
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
        // P399: Use partial DB merge when the write doesn't touch story/content fields
        // AND a story is currently active. The merge preserves selectedStoryData written
        // by the partner when our confirmedLiveStateRef is stale.
        //
        // When no story is active, a full overwrite is safe — there is nothing to protect.
        // This also serves as a fallback until the patch_live_state migration is applied.
        const touchesStory =
          'selectedStoryId' in updates ||
          'selectedStoryData' in updates ||
          'selectedContentTitle' in updates;
        const storyIsActive = Boolean(stateBeforeUpdate.selectedStoryId);
        // If any update value is explicitly undefined (clearing a field), use full overwrite.
        // The patch path (JSONB ||) silently ignores undefined values — they get stripped by
        // JSON.stringify before reaching the DB, so the old value stays. Full overwrite
        // properly clears them by rewriting the entire live_state column.
        const hasExplicitClears = Object.values(updates).some(v => v === undefined);
        if (touchesStory || !storyIsActive || hasExplicitClears) {
          await updateClaritySessionLiveState(session.id, newState);
        } else {
          await patchClaritySessionLiveState(session.id, updates as Record<string, unknown>);
        }
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
    lastActionTimestampRef.current = Date.now(); // P516

    // P398: Signal partner to close history view immediately (before submission)
    updateLiveState({ ratingInitiatedBy: name });

    setLocalFlowType('check');
    setIsLocallyRating(true);
  }, [name, partnerName, session?.code, updateLiveState]);

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
    lastActionTimestampRef.current = Date.now(); // P516

    // P398: Signal partner to close history view immediately (before submission)
    updateLiveState({ ratingInitiatedBy: name });

    setLocalFlowType('prove');
    setIsLocallyRating(true);
  }, [name, partnerName, session?.code, updateLiveState]);

  // P128: Handle story selection from content picker
  const handleSelectStory = useCallback((storyId: string, title: string, storyData?: StoryWithPoints) => {
    if (!name || !partnerName) return;

    // Guard: if a check is already in progress, don't start
    const currentState = confirmedLiveStateRef.current;
    if (currentState.checkerName || currentState.ratingPhase !== 'idle') {
      return;
    }

    analytics.track('live_story_selected', {
      session_code: session?.code,
      story_id: storyId,
    });
    lastActionTimestampRef.current = Date.now(); // P516
    analytics.track('story_session_started', {
      story_id: storyId,
      session_code: session?.code,
    });

    // Set selected content in shared state (partner will see it via selectedStoryData)
    updateLiveState({
      selectedStoryId: storyId,
      selectedPointId: undefined,
      selectedContentTitle: title,
      selectedStoryData: storyData ? {
        id: storyData.id,
        authorId: storyData.authorId,
        content: storyData.content,
        points: storyData.points.map(p => ({
          id: p.id,
          statement: p.statement,
          context: p.context,
          tags: p.tags,
          positionCounts: p.positionCounts,
          userPosition: p.userPosition,
          profileSubjectPosition: p.profileSubjectPosition,
        })),
        authorName: storyData.authorName,
        authorSlug: storyData.authorSlug,
        authorAvatarColor: storyData.authorAvatarColor,
        authorAvatarUrl: storyData.authorAvatarUrl,
        authorRole: storyData.authorRole,
        authorEarsCount: storyData.authorEarsCount,
        authorHasPledged: storyData.authorHasPledged,
        visibility: storyData.visibility,
        createdAt: storyData.createdAt,
      } : undefined,
    });
    // NOTE: Do NOT call setLocalFlowType or setIsLocallyRating here.
    // Story selection now shows the story card in idle state.
    // Round starts when either participant taps an action button.
  }, [name, partnerName, session?.code, updateLiveState]);

  // P272: Clear selected story (both participants return to no-story idle state)
  const handleClearStory = useCallback(() => {
    updateLiveState({
      selectedStoryId: undefined,
      selectedPointId: undefined,
      selectedContentTitle: undefined,
      selectedStoryData: undefined,
    });
  }, [updateLiveState]);

  // P128: Handle point selection from content picker
  const handleSelectPoint = useCallback((pointId: string, title: string) => {
    if (!name || !partnerName) return;

    // Guard: if a check is already in progress, don't start
    const currentState = confirmedLiveStateRef.current;
    if (currentState.checkerName || currentState.ratingPhase !== 'idle') {
      return;
    }

    analytics.track('live_point_selected', {
      session_code: session?.code,
      point_id: pointId,
    });
    lastActionTimestampRef.current = Date.now(); // P516

    // Set selected content in shared state (partner will see it)
    updateLiveState({
      selectedPointId: pointId,
      selectedStoryId: undefined,
      selectedContentTitle: title,
    });

    // Picking a point = "does partner understand YOUR point" (check flow)
    setLocalFlowType('check');
    setIsLocallyRating(true);
  }, [name, partnerName, session?.code, updateLiveState]);

  // Guard for removing positions in /live — shows profile-removal warning and syncs to point_positions.
  const { dialogProps: liveRemoveDialogProps, guardedRemovePosition: liveGuardedRemovePosition } =
    useRemovePositionGuard({
      userId: user?.id ?? '',
      onAfterRemove: useCallback((pointId: string) => {
        if (!name) return;
        const currentPositions = confirmedLiveStateRef.current.livePositions ?? {};
        const myPositions = currentPositions[name] ?? {};
        updateLiveState({
          livePositions: {
            ...currentPositions,
            [name]: { ...myPositions, [pointId]: null },
          },
        });
      }, [name, updateLiveState]),
    });

  // P275: Handle point position selection during a /live session.
  // Adding: writes to live_state + persists to point_positions for verified users.
  // Removing: shows confirmation dialog (warns about profile removal) then syncs both.
  // Unverified guests (is_verified=false) skip DB sync — RLS blocks it, expected per P275.
  const handlePositionSelectInLive = useCallback(
    (pointId: string, position: PositionType | null) => {
      if (!name) return;

      if (position === null) {
        if (user?.id) {
          // Verified user: show confirmation dialog; guard handles DB removal + live_state update
          liveGuardedRemovePosition(pointId);
        } else {
          // Unverified guest: no profile, remove from live_state directly
          const currentPositions = confirmedLiveStateRef.current.livePositions ?? {};
          const myPositions = currentPositions[name] ?? {};
          updateLiveState({
            livePositions: {
              ...currentPositions,
              [name]: { ...myPositions, [pointId]: null },
            },
          });
        }
        return;
      }

      // Setting a position — write to live_state for real-time sync (works for all participants)
      const currentPositions = confirmedLiveStateRef.current.livePositions ?? {};
      const myPositions = currentPositions[name] ?? {};
      updateLiveState({
        livePositions: {
          ...currentPositions,
          [name]: { ...myPositions, [pointId]: position },
        },
      });

      // Best-effort persistence to point_positions for verified users.
      // Unverified guests: RLS will silently reject this — expected per P275.
      if (user?.id) {
        pointsService.setPosition(pointId, user.id, position).catch(() => {
          // Silently ignored: expected failure for is_verified=false users
        });
      }
    },
    [name, updateLiveState, user?.id, liveGuardedRemovePosition]
  );

  // P413: Write calibration record on every completed paraphrase exchange.
  // storyId is optional — loose exchanges without a formal story still count.
  // Fire-and-forget with error guard — round completes regardless.
  const writeVerification = useCallback(async ({
    storyId,
    sessionId,
    checkerName,
    checkerRating,
    responderRating,
    exchangeIndex,
  }: {
    storyId?: string;
    sessionId: string | undefined;
    checkerName: string;
    checkerRating: number;
    responderRating: number;
    exchangeIndex: number;
  }) => {
    const roundKey = `${sessionId}_${checkerName}_${exchangeIndex}`;
    if (verificationFiredRef.current.has(roundKey)) return;
    verificationFiredRef.current.add(roundKey);

    if (!user?.id || !session) return;

    try {
      const speakerId = session.creatorName === checkerName
        ? session.creatorProfileId
        : session.joinerProfileId;
      const listenerId = session.creatorName === checkerName
        ? session.joinerProfileId
        : session.creatorProfileId;

      if (!speakerId || !listenerId) {
        console.error('[P413] Cannot write verification: missing profile IDs');
        return;
      }

      // Look up story version only when a story is selected
      let versionId: string | undefined;
      if (storyId) {
        const { data: versionRow } = await supabase
          .from('story_versions')
          .select('id')
          .eq('story_id', storyId)
          .order('version_number', { ascending: false })
          .limit(1)
          .single();
        versionId = versionRow?.id;
      }

      await calibrationService.recordVerification({
        storyId,
        versionId,
        sessionId,
        speakerId,
        listenerId,
        speakerRating: checkerRating,
        listenerRating: responderRating,
      });

      analytics.track('live_story_verified', {
        session_code: session.code,
        story_id: storyId ?? null,
      });
    } catch (err) {
      console.error('[P413] writeVerification failed:', err);
      // Non-blocking — round completes regardless
    }
  }, [user?.id, session]);

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

      // Track rating submission (P28.1: also collect for ML training)
      trackLiveEvent('live_rating_submitted', {
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

          // P413: Write calibration record on every completed paraphrase exchange
          void writeVerification({
            storyId: currentState.selectedStoryId ?? undefined,
            sessionId: session?.id,
            checkerName: currentState.checkerName ?? name,
            checkerRating: checkerRatingValue,
            responderRating: responderRatingValue ?? 0,
            exchangeIndex: currentState.checksCount,
          });
          const gap = (responderRatingValue ?? 0) - (checkerRatingValue ?? 0);

          const isPerfect = checkerRatingValue === 10 && responderRatingValue === 10;

          // P28.1: Critical event for ML - ground truth for prediction
          trackLiveEvent('live_understanding_revealed', {
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
            trackLiveEvent('live_perfect_understanding', {
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
    [name, partnerName, localFlowType, updateLiveState, session?.code, session?.id, trackLiveEvent, writeVerification]
  );

  // V7: Handle skip (resets to idle state for next check)
  // V10: Now tracks who skipped so partner can be notified
  const handleSkip = useCallback(() => {

    // Track round skip (P28.1: tolerance threshold signal)
    const currentState = confirmedLiveStateRef.current;
    trackLiveEvent('live_round_skipped', {
      session_code: session?.code,
      phase: currentState.ratingPhase,
      round: currentState.explainBackRatings.length,
    });

    // P128: Append to session history before clearing content
    const prevHistory = currentState.sessionHistory ?? [];
    const contentTitle = currentState.selectedContentTitle;
    const historyEntry = currentState.selectedStoryId
      ? { title: contentTitle || 'Story verification', type: 'story' as const, skipped: true }
      : currentState.selectedPointId
        ? { title: contentTitle || 'Point verification', type: 'point' as const, skipped: true }
        : currentState.checkerName
          ? { title: 'Free conversation', type: 'free' as const, skipped: true }
          : null;

    // Reset to idle state for a fresh start
    // Set skippedBy so partner sees toast notification
    updateLiveState({
      ratingPhase: 'idle',
      ratingInitiatedBy: undefined,
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
      speakerSawExplainBackDone: false, // B32_2: Reset for new round
      // Clear any pending role switch negotiation
      roleSwitchNegotiation: undefined,
      // Clear speaker clarification state
      clarificationPhase: undefined,
      // P128: Clear content selection and update history
      selectedStoryId: undefined,
      selectedPointId: undefined,
      selectedContentTitle: undefined,
      sessionHistory: historyEntry ? [...prevHistory, historyEntry] : prevHistory,
    });
    // P272: Clear verification guard so new rounds can fire verification
    verificationFiredRef.current.clear();
  }, [name, updateLiveState, session?.code, trackLiveEvent]);

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
      // P128: Append to session history before clearing content
      const prevHistory = currentState.sessionHistory ?? [];
      const contentTitle = currentState.selectedContentTitle;
      // P398: Capture journey data at completion time
      const journeyData = {
        checkerRating: currentState.checkerRating,
        responderRating: currentState.responderRating,
        explainBackRatings: [...(currentState.explainBackRatings ?? [])],
        checkerName: currentState.checkerName,
        partnerName: partnerName ?? undefined,
        completedAt: new Date().toISOString(),
        isChecker: currentState.checkerName === name,
      };
      const historyEntry = currentState.selectedStoryId
        ? { title: contentTitle || 'Story verification', type: 'story' as const, ...journeyData, storyData: currentState.selectedStoryData }
        : currentState.selectedPointId
          ? { title: contentTitle || 'Point verification', type: 'point' as const, ...journeyData }
          : { title: 'Free conversation', type: 'free' as const, ...journeyData };

      // Both done - reset to idle state for a fresh start
      updateLiveState({
        ratingPhase: 'idle',
        ratingInitiatedBy: undefined,
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
        speakerSawExplainBackDone: false, // B32_2: Reset for new round
        // Clear acknowledgment for next celebration
        celebrationAcknowledgedBy: [],
        // Clear any pending role switch negotiation
        roleSwitchNegotiation: undefined,
        // Clear speaker clarification state
        clarificationPhase: undefined,
        // P128: Clear content selection and update history
        selectedStoryId: undefined,
        selectedStoryData: undefined, // Bug 1: must clear data too — UI gate checks this field
        selectedPointId: undefined,
        selectedContentTitle: undefined,
        sessionHistory: [...prevHistory, historyEntry],
      });
      // P272: Clear verification guard for next round
      verificationFiredRef.current.clear();
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
    // P28.1: Correction loop entry marker
    trackLiveEvent('live_explain_back_started', {
      session_code: session?.code,
      round: currentState.explainBackRatings.length + 1,
      checker_rating: currentState.checkerRating,
      responder_rating: currentState.responderRating,
    });

    updateLiveState({
      ratingPhase: 'explain-back',
      explainBackDone: false,
      speakerSawExplainBackDone: false, // B32_2: Reset when entering explain-back phase
      // Clear any pending role switch negotiation (in case listener clicked "Respond as speaker" then changed mind)
      roleSwitchNegotiation: undefined,
      // Clear clarification state (listener is now acting)
      clarificationPhase: undefined,
    });
  }, [updateLiveState, session?.code, trackLiveEvent]);

  // V11: Handle listener tapping "Done Explaining" - unlocks speaker's rating UI
  const handleExplainBackDone = useCallback(() => {
    // P28.1: Track when listener finishes explaining (critical for audio segmentation)
    trackLiveEvent('live_explain_back_done', {
      session_code: session?.code,
      round: confirmedLiveStateRef.current.explainBackRound,
    });

    updateLiveState({
      explainBackDone: true,
      // B32_2: Also set speakerSawExplainBackDone so speaker's drawer persists
      // even if explainBackDone gets reset (e.g., after "Continue as listener")
      speakerSawExplainBackDone: true,
    });
  }, [updateLiveState, session?.code, trackLiveEvent]);

  // Handle listener wanting to share their perspective instead of explaining back
  // This now starts the negotiation flow instead of immediate role swap
  const handleSharePerspective = useCallback(() => {
    // P28.1: Cognitive friction signal
    trackLiveEvent('live_share_perspective_requested', {
      session_code: session?.code,
    });

    // Start negotiation flow - speaker will see Accept / Ask to explain back first
    updateLiveState({
      roleSwitchNegotiation: {
        requestedBy: name,
        state: 'pending',
      },
    });
  }, [name, updateLiveState, session?.code, trackLiveEvent]);

  // Handle speaker asking listener to explain back first (negotiation step 1 → 2)
  const handleAskToExplainFirst = useCallback(() => {
    trackLiveEvent('live_role_switch_ask_explain', {
      session_code: session?.code,
    });

    const currentState = confirmedLiveStateRef.current;
    updateLiveState({
      roleSwitchNegotiation: {
        requestedBy: currentState.roleSwitchNegotiation?.requestedBy || '',
        state: 'speaker-asked-to-explain',
      },
    });
  }, [updateLiveState, session?.code, trackLiveEvent]);

  // Handle listener continuing as listener (accepting speaker's request to explain back)
  const handleContinueAsListener = useCallback(() => {
    trackLiveEvent('live_role_switch_continue_listening', {
      session_code: session?.code,
    });

    // B32_3 Fix: Just clear the negotiation dialog, preserve listener's state
    // The listener already finished explaining (explainBackDone=true) before clicking "Speak freely".
    // They should return to "Waiting for speaker to evaluate", not restart explain-back mode.
    // Previously this incorrectly reset explainBackDone=false and ratingPhase='explain-back'.
    updateLiveState({
      roleSwitchNegotiation: undefined,
      // DON'T reset ratingPhase or explainBackDone - listener already finished explaining
    });
  }, [updateLiveState, session?.code, trackLiveEvent]);

  // Handle listener insisting they need to speak (negotiation step 2 → 3)
  const handleInsistToSpeak = useCallback(() => {
    trackLiveEvent('live_role_switch_insist', {
      session_code: session?.code,
    });

    const currentState = confirmedLiveStateRef.current;
    updateLiveState({
      roleSwitchNegotiation: {
        requestedBy: currentState.roleSwitchNegotiation?.requestedBy || '',
        state: 'listener-insists',
      },
    });
  }, [updateLiveState, session?.code, trackLiveEvent]);

  // Handle speaker letting listener speak (final step - accept the role switch)
  const handleLetThemSpeak = useCallback(() => {
    trackLiveEvent('live_role_switch_accepted_after_insist', {
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
      speakerSawExplainBackDone: false, // B32_2: Reset for new round
      perspectiveRequestedBy: undefined,
      roleSwitchNegotiation: undefined,
      // Clear speaker clarification state
      clarificationPhase: undefined,
    });
  }, [updateLiveState, session?.code, trackLiveEvent]);

  // Handle speaker starting clarification (after rating < 10)
  const handleClarifyStart = useCallback(() => {
    trackLiveEvent('live_clarify_started', {
      session_code: session?.code,
      round: confirmedLiveStateRef.current.explainBackRatings.length,
    });

    updateLiveState({
      clarificationPhase: 'speaker-clarifying',
    });
  }, [updateLiveState, session?.code, trackLiveEvent]);

  // Handle speaker finishing clarification
  // After clarifying, listener gets to act (explain back again), speaker waits
  const handleClarifyDone = useCallback(() => {
    trackLiveEvent('live_clarify_done', {
      session_code: session?.code,
      round: confirmedLiveStateRef.current.explainBackRatings.length,
    });

    updateLiveState({
      clarificationPhase: 'listener-responding',
    });
  }, [updateLiveState, session?.code, trackLiveEvent]);

  // V6: Handle speaker rating after explain-back
  const handleExplainBackRate = useCallback(
    (rating: number) => {
      const currentState = confirmedLiveStateRef.current;
      const newExplainBackRatings = [...currentState.explainBackRatings, rating];
      const round = currentState.explainBackRound + 1;
      const isPerfect = rating === 10;

      // Track explain-back rating (P28.1: re-rating data)
      trackLiveEvent('live_explain_back_rated', {
        session_code: session?.code,
        rating,
        round,
        is_perfect: isPerfect,
        previous_checker_rating: currentState.checkerRating,
      });

      // Track perfect understanding if achieved
      if (isPerfect) {
        trackLiveEvent('live_perfect_understanding', {
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
        speakerSawExplainBackDone: false, // B32_2: Reset for next round
        checksCount: currentState.checksCount + 1,
        checksTotal: currentState.checksTotal + rating,
        ...(rating >= 9 ? { ideasUnderstood: currentState.ideasUnderstood + 1 } : {}),
        // If rating < 10, speaker enters "deciding to clarify" state
        // Listener will see waiting state until speaker decides (Clarify now / Good enough)
        clarificationPhase: rating < 10 ? 'speaker-deciding' : undefined,
      });
    },
    [updateLiveState, session?.code, trackLiveEvent]
  );

  // Clear the skip notification after toast is shown
  const handleClearSkipNotification = useCallback(() => {
    updateLiveState({
      skippedBy: undefined,
    });
  }, [updateLiveState]);

  // ============================================================================
  // P37.2a: Consent Flow Handlers
  // ============================================================================

  /**
   * Called when logged-in user accepts updated terms.
   */
  const handleTermsAccept = async () => {
    if (!user || !pendingJoinRef.current) return;

    setConsentLoading(true);
    try {
      await recordTermsAcceptance(user.id);
      await recordSessionConsent(pendingJoinRef.current.code, user.id);

      setShowTermsUpdateDialog(false);
      await completeJoin(pendingJoinRef.current.code, user.name || name);

    } catch (err) {
      console.error('Terms acceptance failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to record consent.');
    } finally {
      setConsentLoading(false);
    }
  };

  /**
   * Complete the actual session join after consent is recorded.
   *
   * IMPORTANT (Bug fix): Mic permission is checked BEFORE writing to database.
   * This ensures joiner_name is only set when the joiner is actually ready to
   * enter the live view. Without this, the creator would see the joiner as
   * "joined" even if they denied mic permission.
   */
  const completeJoin = async (code: string, joinName: string) => {
    setIsLoading(true);
    try {
      // Step 1: Check mic permission BEFORE writing to database
      // This ensures we don't tell the creator we "joined" if we can't actually participate
      // Note: We check permission directly, NOT via gateMicAndGoLive which also changes view
      console.log('[Join] Checking mic permission before joining session...');

      // P490: Allow /verify browser automation to skip the native mic permission dialog
      // (Chrome's getUserMedia dialog is not dismissible by automation tools)
      const skipMicCheck = new URLSearchParams(window.location.search).get('skipMicCheck') === 'true';

      // Gate B (P160): private sessions don't need mic permission
      let hasMicPermission = skipMicCheck || joinSessionIsPrivate || micStatus === 'granted';
      if (!hasMicPermission) {
        hasMicPermission = await requestMicPermission();
      }

      if (!hasMicPermission) {
        // Mic permission denied - don't write to database, don't join
        // Store join info for retry, then show the mic dialog
        console.log('[Join] Mic permission denied, aborting join');
        pendingJoinRef.current = { code, joinName };
        setShowMicDialog(true);
        analytics.track('live_session_join_blocked', {
          session_code: code,
          reason: 'mic_permission_denied',
        });
        return;
      }

      // Step 2: Mic granted - now safe to join the session
      console.log('[Join] Mic granted, joining session...');
      const joinedSession = await joinClaritySession(code, joinName, user?.id);
      if (!joinedSession) {
        setError('Session not found or already full');
        return;
      }

      // Reset all refs for clean state
      iAmLeavingRef.current = false;
      partnerLeftRef.current = false;
      sessionEndedRef.current = false;
      hasJoinerRef.current = false;
      lastJoinerNameRef.current = null;
      pendingJoinRef.current = null;

      setSession(joinedSession);
      setIsCreator(false);
      // Save to localStorage for rejoin
      saveSessionToStorage(joinedSession.code, joinName, false);

      analytics.track('live_session_joined', {
        session_code: joinedSession.code,
        join_method: isJoinViaLink ? 'link' : 'code',
      });

      // Step 3: Now transition to live view (mic is granted, session is joined)
      console.log('[Join] Session joined, transitioning to live view');
      setView('live');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join session');
    } finally {
      setIsLoading(false);
    }
  };

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

  // P66: Create session handler - auth gate (only verified users can host)
  const handleCreate = async () => {
    // P66/P396: Auth gate - only authenticated (verified) users can host sessions
    if (!user) {
      navigate('/signup');
      return;
    }

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
      const newSession = await createClaritySession(trimmedName, user?.id, isPrivate);

      // P66: Record session consent for the authenticated user
      await recordSessionConsent(newSession.code, user.id);

      // Reset all refs to ensure clean state for new session
      // Critical: Without this, stale refs from previous sessions could cause
      // subscription/polling to skip updates (guards check these refs)
      iAmLeavingRef.current = false;
      partnerLeftRef.current = false;
      sessionEndedRef.current = false;
      hasJoinerRef.current = false;
      lastJoinerNameRef.current = null;

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

  // B50: Join session handler - inline consent (no dialog)
  const handleJoin = async () => {
    // Extract code from URL or direct input
    const extractedCode = extractCodeFromInput(roomCode);
    if (!extractedCode) {
      setError('Enter a 6-character code or a session link');
      return;
    }
    const normalizedCode = extractedCode;

    // P25: Track join meeting click
    const inputWasLink = roomCode.includes('/') || roomCode.includes('.');
    analytics.track('live_meeting_join_clicked', {
      code_length: normalizedCode.length,
      input_type: inputWasLink ? 'link' : 'code',
    });

    setError(null);

    // Store the code for after consent flow completes
    pendingJoinRef.current = { code: normalizedCode };

    if (user) {
      // Logged-in user: check if terms acceptance needed
      const needsAcceptance = await needsTermsAcceptance(user.id);
      if (needsAcceptance) {
        setShowTermsUpdateDialog(true);
      } else {
        // Terms current, record session consent and join directly
        try {
          await recordSessionConsent(normalizedCode, user.id);
          await completeJoin(normalizedCode, user.name || name);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to record consent');
        }
      }
    } else {
      // P396: Guest — name-only validation, no email collected, no profile created
      const nameError = validateName(name);
      if (nameError) {
        setError(nameError);
        return;
      }
      await completeJoin(normalizedCode, name.trim());
    }
  };

  // P396: Keep ref pointing to latest handleJoin — avoids stale closure in auto-join effect
  const handleJoinRef = useRef<() => void>(() => {});
  handleJoinRef.current = handleJoin;

  // P396: Auto-join authenticated users arriving via invite link — no form needed
  // P406: Relaxed from isVerified to any authenticated user — practice room joiners are
  // already trusted (they're on an event page) and shouldn't need to click Join manually.
  useEffect(() => {
    if (!isJoinViaLink || !urlCode) return;
    if (isAuthLoading || isRestoring) return;
    if (!user) return;
    if (view !== 'start') return;
    if (autoJoinFiredRef.current) return;

    autoJoinFiredRef.current = true;

    (async () => {
      setIsLoading(true);
      const code = urlCode.toUpperCase();
      try {
        // Host detection: creator arriving at their own session link (e.g. via Practice Rooms)
        // → restore them directly into the waiting room instead of the entry form
        const sessionInfo = await getClaritySession(code);
        if (sessionInfo?.creatorProfileId === user.id) {
          const creatorName = user.name || '';
          iAmLeavingRef.current = false;
          partnerLeftRef.current = false;
          sessionEndedRef.current = false;
          hasJoinerRef.current = false;
          lastJoinerNameRef.current = null;
          setSession(sessionInfo);
          setName(creatorName);
          setIsCreator(true);
          saveSessionToStorage(code, creatorName, true);
          if (sessionInfo.joinerName) {
            setPendingLiveTransition(true);
          } else {
            setView('waiting');
          }
          setIsLoading(false);
          return;
        }
      } catch {
        // Session lookup failed — proceed; handleJoin will surface any join error
      }
      setIsLoading(false);
      handleJoinRef.current();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- user.name captured once at join time (autoJoinFiredRef prevents re-runs); setters/service fns are stable refs; handleJoin is indirected via handleJoinRef to avoid dep
  }, [isJoinViaLink, urlCode, isAuthLoading, isRestoring, user?.id, view]);

  // Cancel waiting and go back to start
  const handleCancelWaiting = () => {
    // P106: Track session abandoned before partner joined
    if (session) {
      analytics.track('live_session_abandoned', {
        session_code: session.code,
        waited_seconds: Math.floor((Date.now() - new Date(session.created_at).getTime()) / 1000),
      });
    }
    clearStoredSession();
    setSession(null);
    setView('start');
    setRoomCode('');
    // P160: Reset toggle to default (ON) when cancelling from waiting room
    setIsPrivate(false);
    // Reset refs to ensure clean state for next session
    iAmLeavingRef.current = false;
    partnerLeftRef.current = false;
    sessionEndedRef.current = false;
    hasJoinerRef.current = false;
    lastJoinerNameRef.current = null;
  };

  // P28.1: Stop recording and upload final chunk + events
  // In chunked mode, audio is already uploaded in 30s intervals
  // This function just stops recording (triggers final chunk) and uploads events.json
  const stopAndUploadRecording = useCallback(async () => {
    if (!session || !eventsCollectorRef.current.isStarted()) {
      console.log('[P28.1] No recording to stop');
      return;
    }

    try {
      // Stop recording - this triggers final chunk upload via the hook's cleanup
      await stopRecording();

      // Upload events.json separately (audio chunks are already uploaded)
      const events = eventsCollectorRef.current.getEvents();
      const currentUser = userForChunks.current;
      const metadata = {
        sessionStartedAt: eventsCollectorRef.current.getStartTime(),
        sessionEndedAt: Date.now(),
        durationMs: eventsCollectorRef.current.getDurationMs(),
        participants: [
          { name: session.creatorName, role: 'creator' as const },
          ...(session.joinerName ? [{ name: session.joinerName, role: 'joiner' as const }] : []),
        ],
        // P28.2: Include uploader info for Mixpanel correlation
        uploader: currentUser
          ? { supabaseUserId: currentUser.id, email: currentUser.email, name }
          : { name },
      };

      console.log('[P28.1] Uploading events.json for session:', session.code, 'events:', events.length);

      // Use uploadSessionRecording with an empty blob to just upload events
      // The function handles this gracefully and uploads events.json
      const emptyBlob = new Blob([], { type: 'audio/webm' });
      await uploadSessionRecording(session.code, name, emptyBlob, events, metadata);
    } catch (err) {
      console.error('[P28.1] Failed to stop/upload recording:', err);
      // Don't throw - recording failure shouldn't block session exit
    } finally {
      // P28.2: Unregister ML collector so events outside session aren't captured
      analytics.unregisterMLCollector();
      eventsCollectorRef.current.reset();
      sessionCodeForChunks.current = null;
      userNameForChunks.current = null;
      sessionForChunks.current = null;
      userForChunks.current = null;
    }
  }, [session, name, stopRecording]);

  // Show exit confirmation dialog
  const handleExitMeeting = useCallback(() => {
    setShowExitConfirm(true);
  }, []);

  // Actually exit meeting after confirmation
  const confirmExitMeeting = useCallback(async () => {
    // Mark that I am leaving (prevents polling from detecting my own departure)
    iAmLeavingRef.current = true;

    // P28.1: Stop recording and upload before exiting
    await stopAndUploadRecording();

    // Track session exit
    if (session) {
      const checksCompleted = liveState.checksCount;
      const hadMeaningfulEngagement = checksCompleted > 0;

      analytics.track('live_session_exited', {
        session_code: session.code,
        checks_completed: checksCompleted,
        is_creator: isCreator,
        had_meaningful_engagement: hadMeaningfulEngagement,
        exit_reason: 'button_click',
        time_since_last_action_ms: Date.now() - lastActionTimestampRef.current,
        had_focus_when_exited: !document.hidden,
      });

      // Track session completion separately for funnel analysis
      if (hadMeaningfulEngagement) {
        analytics.track('live_session_completed', {
          session_code: session.code,
          checks_completed: checksCompleted,
          is_creator: isCreator,
        });
      }

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

    // P406: Close practice room if session came from an event
    if (isFromEvent && session) {
      eventsService.closePracticeRoomBySessionId(session.id).catch((err) => {
        console.error('[Live] Failed to close practice room:', err);
      });
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
    if (pendingNavTo) {
      const destination = pendingNavTo;
      setPendingNavTo(null);
      navigate(destination, { replace: true });
    } else {
      navigate(returnTo ?? '/live', { replace: true });
    }
  }, [session, liveState.checksCount, isCreator, isFromEvent, returnTo, navigate, stopAndUploadRecording, pendingNavTo, setPendingNavTo]);

  // Handle starting a new session after partner left
  const handleStartNewAfterPartnerLeft = useCallback(async () => {
    // P28.1: Stop recording and upload before starting new session
    await stopAndUploadRecording();

    setPartnerLeft(false);
    setSessionEnded(false);
    setDepartedPartnerName(null);
    // P406: Close practice room if session came from an event
    if (isFromEvent && session) {
      eventsService.closePracticeRoomBySessionId(session.id).catch((err) => {
        console.error('[Live] Failed to close practice room:', err);
      });
    }

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
    navigate(returnTo ?? '/live', { replace: true });
  }, [session, isFromEvent, returnTo, navigate, stopAndUploadRecording]);

  // P40: Handle mic permission dialog retry
  // If we have pending join info, complete the join after mic is granted
  const handleMicRetry = useCallback(async () => {
    const hasPermission = await requestMicPermission();
    if (hasPermission) {
      setShowMicDialog(false);

      // If we have pending join info (from failed join attempt), complete the join
      const pendingJoin = pendingJoinRef.current;
      if (pendingJoin?.joinName) {
        console.log('[MicRetry] Mic granted, completing pending join...');
        pendingJoinRef.current = null;
        // Complete the join now that mic is granted
        // Since completeJoin checks mic first, and we just granted it, this will succeed
        const joinedSession = await joinClaritySession(pendingJoin.code, pendingJoin.joinName, user?.id);
        if (joinedSession) {
          // Reset refs and set session
          iAmLeavingRef.current = false;
          partnerLeftRef.current = false;
          sessionEndedRef.current = false;
          hasJoinerRef.current = false;
          lastJoinerNameRef.current = null;

          setSession(joinedSession);
          setIsCreator(false);
          saveSessionToStorage(joinedSession.code, pendingJoin.joinName, false);

          analytics.track('live_session_joined', {
            session_code: joinedSession.code,
            join_method: 'mic_retry',
          });

          setView('live');
        } else {
          setError('Session not found or already full');
        }
      }
      // Recording will start automatically via the useEffect when micStatus becomes 'granted'
      // Note: Do NOT call resetMic() here - it would clear the 'granted' status
    }
  }, [requestMicPermission, user?.id]);

  // P40: Handle mic permission dialog cancel
  // B48: Cancel returns user to start view (they can't join without mic permission)
  const handleMicCancel = useCallback(() => {
    setShowMicDialog(false);
    resetMic();
    pendingJoinRef.current = null; // Clear any pending join info
    setView('start');
    toast.error('Microphone access is required to join Clarity Sessions');
  }, [resetMic]);

  // B48: Gate transition to live view behind mic permission check
  // This ensures users grant microphone access BEFORE seeing the live meeting UI
  // Returns true if transitioned to live, false if blocked by permission dialog
  const gateMicAndGoLive = useCallback(async (): Promise<boolean> => {
    // P490: Allow /verify browser automation to skip the native mic permission dialog
    const skipMicCheck = new URLSearchParams(window.location.search).get('skipMicCheck') === 'true';

    // Gate D (P160): private sessions bypass mic check entirely
    if (isPrivate || skipMicCheck) {
      console.log('[B48] Private session or skipMicCheck — skipping mic check, transitioning to live');
      setView('live');
      return true;
    }

    // If already granted from a previous check, go straight to live
    if (micStatus === 'granted') {
      console.log('[B48] Mic already granted, transitioning to live');
      setView('live');
      return true;
    }

    // Request permission before allowing transition
    console.log('[B48] Requesting mic permission before live transition...');
    const hasPermission = await requestMicPermission();

    if (hasPermission) {
      console.log('[B48] Mic permission granted, transitioning to live');
      setView('live');
      return true;
    } else {
      console.log('[B48] Mic permission denied, showing dialog (blocking live transition)');
      setShowMicDialog(true);
      return false;
    }
  }, [isPrivate, micStatus, requestMicPermission]);

  // B48: Effect to handle pending live transitions (from session restoration, subscription, polling)
  // This decouples the async mic permission check from synchronous state updates
  useEffect(() => {
    if (pendingLiveTransition) {
      console.log('[B48] Processing pending live transition...');
      gateMicAndGoLive().finally(() => {
        setPendingLiveTransition(false);
      });
    }
  }, [pendingLiveTransition, gateMicAndGoLive]);

  // P28.2: Auto-stop recording when partner leaves (prevents orphan recordings)
  useEffect(() => {
    if ((partnerLeft || sessionEnded) && isRecording) {
      console.log('[P28.2] Partner left, auto-stopping recording');
      stopAndUploadRecording();
    }
  }, [partnerLeft, sessionEnded, isRecording, stopAndUploadRecording]);

  // Show partner left screen if partner departed
  if (sessionEnded || partnerLeft) {
    return (
      <div className="flex flex-col min-h-[calc(100vh-4rem)] lg:min-h-[calc(100vh-5rem)]">
        <div className="flex-1 flex items-center justify-center">
          <PartnerLeftScreen
            partnerName={departedPartnerName}
            sessionEnded={sessionEnded}
            onStartNew={handleStartNewAfterPartnerLeft}
            isGuest={!user}
          />
        </div>
      </div>
    );
  }

  // Show loading while restoring session
  if (isRestoring) {
    return (
      <div className="flex flex-col min-h-[calc(100vh-4rem)] lg:min-h-[calc(100vh-5rem)]">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  // START VIEW
  if (view === 'start') {
    // P396: Join via link — two-state model (authenticated / anonymous guest)
    if (isJoinViaLink) {
      const joinTitle = hostName ? `Join ${hostName}'s Session` : 'Join Clarity Session';
      // P396: name-only requirement (no email)
      const canJoinViaLink = !validateName(name);
      // Redirect URL for login/signup flows — returns user to session after auth
      const sessionRedirectUrl = `/live/${urlCode}`;

      return (
        <div className="flex flex-col min-h-[calc(100vh-4rem)] lg:min-h-[calc(100vh-5rem)]">
          <div className="flex-1 container mx-auto px-4 max-w-md flex flex-col justify-center">
            <div className="text-center mb-8">
              {/* Prominent heading inside form area for context clarity */}
              <h2 className="text-2xl font-semibold mb-4">{joinTitle}</h2>
              {!hostName && (
                <div className="inline-flex items-center px-3 py-1.5 bg-muted rounded-full">
                  <span className="text-sm text-muted-foreground">
                    Room: <span className="font-mono font-medium">{roomCode}</span>
                  </span>
                </div>
              )}
            </div>

            {/* P160: Private-only badge for joiner — only shown when host disabled recording */}
            {joinSessionIsPrivate && (
              <div
                aria-live="polite"
                className="flex items-center gap-2 px-4 py-2 rounded-lg border mb-6 bg-muted border-border"
              >
                <ShieldOff className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Private session</div>
                  <div className="text-xs text-muted-foreground">AI insights disabled</div>
                </div>
              </div>
            )}

            {user ? (
              /* P396: Authenticated user — auto-joins on page load.
                 Spinner during auto-join; fallback button only if join fails. */
              <div className="space-y-6">
                {isLoading || consentLoading || !error ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Joining session...
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-red-600 text-center">{error}</p>

                    <Button
                      onClick={handleJoin}
                      disabled={isLoading || consentLoading}
                      className="w-full bg-blue-500 hover:bg-blue-600"
                      size="lg"
                    >
                      Join Session
                    </Button>

                    <Link
                      to="/live"
                      className="inline-flex items-center justify-center text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
                    >
                      Back
                    </Link>
                  </>
                )}
              </div>
            ) : (
              /* P396: Guest join form — name only, no email collected */
              <div className="space-y-6">
                {/* Login option for registered users who aren't logged in */}
                <div className="space-y-3">
                  <GoogleAuthButton
                    context="live-join"
                    source="login"
                    redirect={sessionRedirectUrl}
                  />
                  <div className="text-center">
                    <Link
                      to={`/login?redirect=${encodeURIComponent(sessionRedirectUrl)}`}
                      className="text-sm text-blue-600 hover:text-blue-700 underline underline-offset-2"
                    >
                      Log in with email
                    </Link>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or join as guest</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">What should we call you?</Label>
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
                  disabled={isLoading || consentLoading || !canJoinViaLink}
                  className="w-full bg-blue-500 hover:bg-blue-600"
                  size="lg"
                >
                  {isLoading || consentLoading ? 'Joining...' : 'Join as Guest'}
                </Button>

                <Link
                  to="/live"
                  className="inline-flex items-center justify-center text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
                >
                  Back
                </Link>
              </div>
            )}
          </div>

          {/* Terms update dialog (for logged-in users only) */}
          <TermsUpdateDialog
            open={showTermsUpdateDialog}
            onAccept={handleTermsAccept}
            onCancel={() => {
              setShowTermsUpdateDialog(false);
              pendingJoinRef.current = null;
            }}
            isLoading={consentLoading}
          />

          {/* B48 Fix: Mic dialog must be rendered in all views */}
          <MicrophonePermissionDialog
            open={showMicDialog}
            error={micError}
            attemptCount={micAttemptCount}
            onRetry={handleMicRetry}
            onCancel={handleMicCancel}
          />
        </div>
      );
    }

    // P25: Differentiate logged-in vs guest experience
    const isLoggedIn = !!user;

    // Handle login click for guests
    const handleLoginClick = () => {
      analytics.track('live_meeting_login_clicked');
      navigate('/login?redirect=/live');
    };

    // Show loading while checking auth state OR creating session to prevent flicker
    // The isLoading check prevents flash when guest account is created mid-flow
    // (auth state updates -> isLoggedIn becomes true -> form would briefly show logged-in view)
    if (isAuthLoading || isLoading) {
      return (
        <div className="flex flex-col min-h-[calc(100vh-4rem)] lg:min-h-[calc(100vh-5rem)]">
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">
              {isLoading ? 'Creating session...' : 'Loading...'}
            </div>
          </div>
        </div>
      );
    }

    // P396: Check if guest can proceed — name-only requirement
    const guestCanProceed = isLoggedIn || !validateName(name);

    return (
      <div className="flex flex-col min-h-[calc(100vh-4rem)] lg:min-h-[calc(100vh-5rem)]">
        <div className="flex-1 container mx-auto px-4 max-w-md md:max-w-2xl flex flex-col justify-center">
          <div className="space-y-6">
            {/* Page title - always shows "Clarity Session" */}
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-semibold">
                Clarity Session
              </h1>
              <p className="text-muted-foreground">
                Verify understanding in real-time
              </p>
            </div>

                {error && <p className="text-sm text-red-600 text-center">{error}</p>}

                {/* Form controls - centered container, left-aligned contents */}
                <div className="flex justify-center">
                  <div className="flex flex-col gap-4">
                    {/* P396: Guest: name-only input - above buttons */}
                    {!isLoggedIn && (
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="name" className="text-sm font-medium">What should we call you?</Label>
                        <Input
                          id="name"
                          placeholder="Enter your name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          autoFocus
                          className="w-[280px] rounded-full h-11 text-sm"
                        />
                      </div>
                    )}

                    {/* P160: Recording toggle — creator-only control, shown before session is created */}
                    <div className="w-[280px]">
                      <button
                        role="switch"
                        aria-checked={!isPrivate}
                        aria-label={isPrivate ? 'Private session — recording disabled' : 'Record session for AI Insights'}
                        onClick={() => setIsPrivate((prev) => !prev)}
                        className={`flex items-center gap-3 w-full min-h-[44px] px-3 py-2 rounded-lg border text-left transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                          isPrivate
                            ? 'bg-muted border-border'
                            : 'bg-blue-50 border-blue-200'
                        }`}
                      >
                        {/* Switch thumb */}
                        <div className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${isPrivate ? 'bg-muted-foreground/30' : 'bg-blue-400'}`}>
                          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${isPrivate ? 'left-0.5' : 'left-[18px]'}`} />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          {isPrivate ? (
                            <>
                              <span className="text-xs font-medium text-muted-foreground">Private session</span>
                              <span className="text-xs text-muted-foreground">AI insights disabled</span>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">Record for AI Insights</span>
                          )}
                        </div>
                      </button>
                      {/* SR-only announcement for screen readers when toggle changes */}
                      <span className="sr-only" aria-live="polite">
                        {isPrivate
                          ? 'Recording disabled. Only Terms & Privacy acceptance is required.'
                          : 'Recording enabled. Please re-confirm your consent.'}
                      </span>
                    </div>

                    {/* P25: Google Meet style - stacked on mobile, inline on desktop */}
                    <div className="flex flex-col md:flex-row md:items-center items-start gap-3">
                      {/* New meeting button - compact (not full width) */}
                      <Button
                        onClick={handleCreate}
                        disabled={isLoading || !guestCanProceed}
                        className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 rounded-full h-11 px-5"
                      >
                        <Mic className="h-[18px] w-[18px]" />
                        <span className="text-sm">{isLoading ? 'Creating...' : 'New session'}</span>
                      </Button>

                      {/* Code input + Join - with real-time validation */}
                      {(() => {
                        // Real-time validation for code/link input
                        const hasInput = roomCode.trim().length > 0;
                        const extractedCode = hasInput ? extractCodeFromInput(roomCode) : null;
                        const isValidInput = !!extractedCode;
                        const canJoin = guestCanProceed && isValidInput;

                        // Determine error message for inline display
                        let inputError: string | null = null;
                        if (hasInput && !isValidInput) {
                          if (roomCode.includes('/') || roomCode.includes('.')) {
                            inputError = 'Invalid session link';
                          } else {
                            inputError = 'Code must be 6 characters';
                          }
                        } else if (hasInput && isValidInput && !guestCanProceed) {
                          inputError = isLoggedIn ? '' : 'Enter your name first';
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
                  </div>
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

                {/* B50: Passive terms notice - only for logged-in users (guests have checkbox) */}
                {isLoggedIn && (
                  <div className="text-center pt-4">
                    <p className="text-sm text-muted-foreground">
                      By starting or joining, you agree to our{' '}
                      <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        Terms
                      </a>{' '}
                      and{' '}
                      <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        Privacy Policy
                      </a>.
                    </p>
                  </div>
                )}
          </div>

          {/* Terms update dialog (for logged-in users only) */}
          <TermsUpdateDialog
            open={showTermsUpdateDialog}
            onAccept={handleTermsAccept}
            onCancel={() => {
              setShowTermsUpdateDialog(false);
              pendingJoinRef.current = null;
            }}
            isLoading={consentLoading}
          />

          {/* B48 Fix: Mic dialog must be rendered in all views */}
          <MicrophonePermissionDialog
            open={showMicDialog}
            error={micError}
            attemptCount={micAttemptCount}
            onRetry={handleMicRetry}
            onCancel={handleMicCancel}
          />
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
          title: 'Join my Clarity Session',
          text: `Join my Clarity Session`,
          url: shareLink,
        });
        // P106: Track successful native share
        analytics.track('live_invite_shared', {
          session_code: session.code,
          method: 'native_share',
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
      // P106: Track link copied
      analytics.track('live_invite_shared', {
        session_code: session.code,
        method: 'clipboard_copy',
      });
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (view === 'waiting' && session) {
    // Display-friendly link (without https://)
    const displayLink = shareLink.replace('https://', '').replace('http://', '');
    const waitingMessage = partnerNameFromUrl
      ? `Waiting for ${partnerNameFromUrl} to join...`
      : 'Waiting for partner to join...';

    return (
      <div className="flex flex-col min-h-[calc(100vh-4rem)] lg:min-h-[calc(100vh-5rem)]">
        <div className="flex-1 container mx-auto px-4 max-w-md flex flex-col justify-center">
          <div className="text-center space-y-6">
            {isFromEvent && partnerNameFromUrl ? (
              <>
                <h2 className="text-2xl font-semibold">{waitingMessage}</h2>
                <p className="text-muted-foreground">
                  They can join by:
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-semibold">Invite Your Partner</h2>
                <p className="text-muted-foreground">
                  Share this link to start your clarity session:
                </p>
              </>
            )}

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
                className="flex-shrink-0 bg-blue-500 hover:bg-blue-600"
              >
                {copied ? (
                  <Check className="h-4 w-4 mr-1" />
                ) : (
                  <Share2 className="h-4 w-4 mr-1" />
                )}
                {copied ? 'Copied!' : 'Share'}
              </Button>
            </div>

            {/* P160: Recording status badge — display-only, locked once session created */}
            <div
              aria-live="polite"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border w-full ${
                isPrivate
                  ? 'bg-muted border-border'
                  : 'bg-blue-50 border-blue-200'
              }`}
            >
              {isPrivate ? (
                <>
                  <ShieldOff className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Private session</div>
                    <div className="text-xs text-muted-foreground">AI insights disabled</div>
                  </div>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <div className="text-sm text-blue-700">Session recorded for AI Insights</div>
                </>
              )}
            </div>

            {isFromEvent ? (
              <p className="text-xs text-muted-foreground">
                • Tapping "Join" on the event page<br />
                • Scanning this QR code<br />
                • Using this link
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Or show them this QR code:
              </p>
            )}

            {/* QR Code */}
            <div className="p-4 bg-white rounded-lg border inline-block">
              <QRCodeSVG
                value={shareLink}
                size={160}
                level="M"
              />
            </div>

            {returnTo && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(returnTo)}
                className="w-full"
              >
                ← Back to event
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelWaiting}
              className="text-muted-foreground w-full"
            >
              Cancel
            </Button>
          </div>
        </div>

        {/* B48 Fix: Mic dialog must be rendered in all views */}
        <MicrophonePermissionDialog
          open={showMicDialog}
          error={micError}
          attemptCount={micAttemptCount}
          onRetry={handleMicRetry}
          onCancel={handleMicCancel}
        />
      </div>
    );
  }

  // LIVE/REVIEW VIEW
  if ((view === 'live') && session && partnerName) {
    return (
      <div className="flex flex-col min-h-screen">
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
          // P128: Content selection and navigation
          userId={user?.id}
          onSelectStory={handleSelectStory}
          onSelectPoint={handleSelectPoint}
          onClearStory={handleClearStory}
          // P275: Position selection during live — stores in live_state, not point_positions
          onPositionSelect={handlePositionSelectInLive}
          // P160: Private session mode indicator
          isPrivate={session.isPrivate ?? false}
          partnerEarsCount={partnerEarsCount}
        />

        {/* Remove position confirmation dialog */}
        <RemovePositionDialog {...liveRemoveDialogProps} />

        {/* Exit confirmation dialog */}
        <Dialog open={showExitConfirm} onOpenChange={(open) => { setShowExitConfirm(open); if (!open) setPendingNavTo(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>End session?</DialogTitle>
              <DialogDescription>
                Are you sure you want to end this session? Your progress will be lost.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={() => { setShowExitConfirm(false); setPendingNavTo(null); }}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmExitMeeting}>
                End Session
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* P40: Microphone permission dialog */}
        <MicrophonePermissionDialog
          open={showMicDialog}
          error={micError}
          attemptCount={micAttemptCount}
          onRetry={handleMicRetry}
          onCancel={handleMicCancel}
        />
      </div>
    );
  }

  // B48 Fix: Render MicrophonePermissionDialog even when not in 'live' view
  // This is needed because mic permission is checked BEFORE transitioning to 'live'
  // If permission is denied, view stays at 'waiting'/'start' but dialog must still show
  return (
    <>
      <MicrophonePermissionDialog
        open={showMicDialog}
        error={micError}
        attemptCount={micAttemptCount}
        onRetry={handleMicRetry}
        onCancel={handleMicCancel}
      />
    </>
  );
}
