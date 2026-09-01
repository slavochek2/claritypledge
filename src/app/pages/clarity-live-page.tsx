/**
 * @file clarity-live-page.tsx
 * @description P23: Live Clarity Sessions - Two people join, talk naturally,
 * the app acts as a quiet referee enforcing the understanding protocol.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Share2, Check, Keyboard, Mic, ShieldOff, Sparkles, Loader2 } from 'lucide-react';
import { ClarityLoader } from '@/components/ui/clarity-loader';
import * as Sentry from '@sentry/react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// P50: ConsentNotice import removed - replaced with inline consent checkbox
import {
  createClaritySession,
  joinClaritySession,
  getClaritySession,
  getActiveSessionByCode,
  subscribeToClaritySession,
  updateClaritySessionLiveState,
  patchClaritySessionLiveState,
  clearSessionJoiner,
  uploadSessionRecording,
  // uploadAudioChunk is replaced by uploadSingleChunk + queue (P566)
  uploadEventsSnapshot,
  uploadSingleChunk,
  recordChunkUploadComplete,
  MAX_NAME_LENGTH,
  SESSION_GRACE_PERIOD_SECONDS,
  type ClaritySession,
  recordTermsAcceptance,
  recordSessionConsent,
  needsTermsAcceptance,
  createTranscriptionJob,
  // P703: Letter-sourced session
  getLetterBaselineRatings,
  cancelLiveInvite,
  checkSessionRequiresAuth,
  getProfile,
  completeClaritySessionKeepalive,
} from '@/app/data/api';
import { TermsUpdateDialog } from '@/app/components/live-meeting/terms-update-dialog';
import { analytics } from '@/lib/mixpanel';
import { useAuth } from '@/auth';
import {
  type LiveSessionState,
  type SessionHistoryItem,
  type LiveStoryData,
  type PositionType,
  type StoryWithPoints,
  type Profile,
  DEFAULT_LIVE_STATE,
} from '@/app/types';
import { findLetterPreloadForStory } from '@/app/data/letters-service';
import { composeLetterPreloadState, toLiveStoryData, toPositionRecord } from '@/app/pages/live/letter-preload';
import { pointsService } from '@/app/data/points-service';
import { eventsService } from '@/app/data/events-service';
import { storiesService } from '@/app/data/stories-service';
import { calibrationService } from '@/app/data/calibration-service';
import { badgeService } from '@/app/data/badge-service';
import { supabase } from '@/lib/supabase';
import { isDevRecordingActive } from '@/lib/dev-recording';
import { mergeInFlight, isStateRegression, isPhaseRegression } from '@/app/lib/live-state-merge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LiveModeView, PartnerLeftScreen, type UploadProgressState } from '@/app/components/partners/live-mode-view';
import { ReconnectingCountdown } from '@/app/components/session/reconnecting-countdown';
import { RejoinPrompt } from '@/app/components/session/rejoin-prompt';
import { SessionEndedScreen } from '@/app/components/session/session-ended-screen';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { useMicrophonePermission } from '@/hooks/useMicrophonePermission';
import { MicrophonePermissionDialog } from '@/app/components/live-meeting/microphone-permission-dialog';
import { SessionEventsCollector } from '@/lib/session-events-collector';
import { GuestOrAccountJoin } from '@/app/components/auth/guest-or-account-join';
import { toast } from 'sonner';
import { RemovePositionDialog, useRemovePositionGuard } from '@/app/components/shared/remove-position-dialog';
import { useLiveSession, getActiveSessionFromStorage, clearActiveSessionFromStorage } from '@/app/contexts/live-session-context';
import { useSessionHeartbeat } from '@/hooks/use-session-heartbeat';
import { createChunkStore, type ChunkStore, type ChunkMetadata } from '@/lib/chunk-store';
import { ChunkUploadQueue } from '@/lib/chunk-upload-queue';
import { useUploadHealth } from '@/hooks/use-upload-health';
import { useTerminateSession } from '@/hooks/use-terminate-session';

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
// P525: Utility functions for deadlock prevention and observability
// ============================================================================

/** P525: Timeout constant for updateLiveState DB calls */
const UPDATE_TIMEOUT_MS = 5000;

/**
 * P525: Race a promise against a timeout. Rejects with a descriptive error if the promise
 * doesn't resolve within `ms` milliseconds. Cleans up the timer on success to prevent leaks.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Live state update timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

/**
 * P525+: Determines whether a live state write should use full overwrite or JSONB merge (patch).
 *
 * Full overwrite (updateClaritySessionLiveState): rewrites the entire live_state column.
 * JSONB merge (patchClaritySessionLiveState): atomically merges only the provided keys.
 *
 * Full overwrite is needed when:
 * - Writing story fields (must be atomic with other state)
 * - Clearing fields (undefined values are stripped by JSON.stringify, so patch ignores them)
 *
 * All other writes (ratings, celebration booleans, phase changes) use JSONB merge to prevent
 * last-writer-wins clobbering when two users write concurrently.
 *
 * BUG FIX: Previously included `!storyIsActive` which routed ALL writes through full overwrite
 * when no story was selected. This caused celebration booleans to clobber each other in
 * free-conversation rounds (both users write simultaneously, last writer erases partner's boolean).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function shouldUseFullOverwrite(
  updates: Partial<Record<string, unknown>>,
  stateBeforeUpdate: Record<string, unknown>
): boolean {
  const touchesStory =
    'selectedStoryId' in updates ||
    'selectedStoryData' in updates ||
    'selectedContentTitle' in updates;
  const hasExplicitClears = Object.values(updates).some(v => v === undefined);
  // Suppress unused parameter warning — stateBeforeUpdate is kept in signature for documentation:
  // Previously `!Boolean(stateBeforeUpdate.selectedStoryId)` was included here, causing the bug.
  void stateBeforeUpdate;
  return touchesStory || hasExplicitClears;
}

/**
 * P671: Monotonic phase ordering for rating flow.
 *
 * P1080: the implementation and its rank table now live in `live-state-merge.ts`
 * alongside `isStateRegression`, which shares them. This file previously kept a
 * second copy; the duplication is what allowed the clarify-loop edge
 * (`results → explain-back`) to be rejected on one path after being fixed on the
 * other. Re-exported here so the existing import path stays stable.
 */
// eslint-disable-next-line react-refresh/only-export-components
export { isPhaseRegression };

/**
 * P525: Strips PII from live state before sending to Sentry.
 * Keeps only structural/diagnostic fields — no user names, story content, or name-keyed maps.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function sanitizeLiveStateForSentry(
  state: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!state) return {};
  // Allowlist of structural fields safe for Sentry
  const safeKeys = [
    'ratingPhase', 'currentRound', 'checkerSubmitted', 'responderSubmitted',
    'explainBackRound', 'explainBackDone', 'checksCount', 'checksTotal',
    'ideasDiscussed', 'ideasUnderstood', 'celebrationAcknowledgedByCreator',
    'celebrationAcknowledgedByJoiner', 'clarificationPhase', 'speakerSawExplainBackDone',
    'checkerRating', 'responderRating', 'isRecording',
    // P562: Free mode fields
    'sessionMode', 'freePhase', 'freeSliderCreator', 'freeSliderJoiner', 'freeRerating',
    // P892: round persistence flag
    'roundRecorded',
  ];
  const sanitized: Record<string, unknown> = {};
  for (const key of safeKeys) {
    if (key in state) sanitized[key] = state[key];
  }
  // Include boolean indicator for story presence (not the content)
  if (state.selectedStoryId) sanitized.hasSelectedStory = true;
  return sanitized;
}

/**
 * P525: Checks if both users have acknowledged the celebration, supporting both
 * new boolean keys and old array format for backward compatibility.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function isBothAcknowledged(state: {
  celebrationAcknowledgedByCreator?: boolean;
  celebrationAcknowledgedByJoiner?: boolean;
}): boolean {
  return state.celebrationAcknowledgedByCreator === true && state.celebrationAcknowledgedByJoiner === true;
}

/**
 * P525: Backward-compatible check — new booleans OR old array with both names.
 * Used during deploy transition when one user may have old code.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function isBothAcknowledgedCompat(
  state: {
    celebrationAcknowledgedByCreator?: boolean;
    celebrationAcknowledgedByJoiner?: boolean;
    celebrationAcknowledgedBy?: string[];
  },
  creatorName: string,
  joinerName: string
): boolean {
  // New booleans take priority
  if (isBothAcknowledged(state)) return true;
  // Old array fallback
  const arr = state.celebrationAcknowledgedBy ?? [];
  if (arr.includes(creatorName) && arr.includes(joinerName)) return true;
  // Mixed: creator via boolean + joiner via array, or vice versa
  const creatorAck = state.celebrationAcknowledgedByCreator === true || arr.includes(creatorName);
  const joinerAck = state.celebrationAcknowledgedByJoiner === true || arr.includes(joinerName);
  return creatorAck && joinerAck;
}

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

// P804: Picks the #understanding-tagged point with the highest v<N> tag.
// Pre-P800: parses v<N> from systemTags to identify the latest version.
// Post-P800: selectedStoryData.points contains only HEAD versions; same code picks it.
function pickLatestUnderstandingPoint(
  points: Array<{ id: string; systemTags?: string[] | null }>
): { id: string } | undefined {
  const candidates = points.filter(p => p.systemTags?.includes('understanding'));
  if (candidates.length === 0) return undefined;
  return candidates.reduce((best, p) => {
    const vOf = (pt: typeof p) => {
      const tag = pt.systemTags?.find(t => /^v\d+$/.test(t));
      return tag ? parseInt(tag.slice(1), 10) : 0;
    };
    return vOf(p) > vOf(best) ? p : best;
  });
}

// P804: Shared badge-certification helper. Checks is_certifier, picks the latest
// #understanding point, verifies listener's agree position, inserts badge_points row.
// Returns { badgePointEarned, newBadgeCount, isCertifier } — caller sets React state.
async function awardBadgeIfEligible({
  storyData,
  livePositions,
  myProfileId,
  listenerProfileId,
  sessionId,
}: {
  storyData: LiveStoryData | undefined;
  livePositions: Record<string, string> | undefined;
  myProfileId: string | undefined;
  listenerProfileId: string | undefined;
  sessionId: string;
}): Promise<{ badgePointEarned: boolean; newBadgeCount: number; isCertifier: boolean }> {
  if (!myProfileId || !listenerProfileId) {
    return { badgePointEarned: false, newBadgeCount: 0, isCertifier: false };
  }
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('is_certifier')
    .eq('id', myProfileId)
    .maybeSingle();
  if (myProfile?.is_certifier !== true) {
    return { badgePointEarned: false, newBadgeCount: 0, isCertifier: false };
  }
  const understandingPoint = pickLatestUnderstandingPoint(storyData?.points ?? []);
  if (!understandingPoint) {
    return { badgePointEarned: false, newBadgeCount: 0, isCertifier: true };
  }
  let listenerPosition: string | null | undefined = livePositions?.[understandingPoint.id];
  if (listenerPosition == null) {
    const { data: posRow } = await supabase
      .from('point_positions')
      .select('position')
      .eq('point_id', understandingPoint.id)
      .eq('user_id', listenerProfileId)
      .maybeSingle();
    listenerPosition = (posRow as { position: string } | null)?.position ?? null;
  }
  if (listenerPosition !== 'agree' && listenerPosition !== 'strongly_agree') {
    return { badgePointEarned: false, newBadgeCount: 0, isCertifier: true };
  }
  const result = await badgeService.insertBadgePoint({
    userId: listenerProfileId,
    pointId: understandingPoint.id,
    storyId: storyData?.id ?? null,
    verifiedBy: myProfileId,
    sessionId,
    position: listenerPosition as 'agree' | 'strongly_agree',
  });
  if (result === null) {
    return { badgePointEarned: false, newBadgeCount: 0, isCertifier: true };
  }
  const newBadgeCount = await badgeService.getBadgeCount(listenerProfileId);
  return { badgePointEarned: true, newBadgeCount, isCertifier: true };
}

// P827: toPositionRecord / toLiveStoryData / composeLetterPreloadState moved
// to ./live/letter-preload.ts so the test file imports them without dragging
// the ClarityLivePage component, and to keep this file's exports
// component-only (react-refresh/only-export-components).

export function ClarityLivePage() {
  // Get room code from URL if present (for direct join via shared link)
  const { code: urlCode } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isJoinViaLink = !!urlCode;
  const { setIsLive, setActiveSession, clearActiveSession } = useLiveSession();
  const terminate = useTerminateSession();

  // P124: Get event context from URL params
  const returnTo = searchParams.get('returnTo');
  const partnerNameFromUrl = searchParams.get('partner');
  const isFromEvent = returnTo?.startsWith('/events/');
  // P779: same-origin relative paths only — rejects protocol-relative URLs (`//evil.com`)
  const safeReturnTo = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : null;

  // Get logged-in user's name (if authenticated)
  const { user, session: authSession, isLoading: isAuthLoading } = useAuth();

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
  // P792: Partner's profile for avatar in badge
  const [partnerProfile, setPartnerProfile] = useState<Profile | null>(null);

  // Exit flow state (P512: prevents double-click on End Session)
  const [isExiting, setIsExiting] = useState(false);

  // Partner departure state
  const [partnerLeft, setPartnerLeft] = useState(false); // Joiner left (creator sees this)
  const [sessionEnded, setSessionEnded] = useState(false); // Creator left (joiner sees this)
  const [sessionEndedOnLoad, setSessionEndedOnLoad] = useState(false); // P769: cold-start after session ended

  // P703: Letter-sourced session display state
  const [listenerDisplayName, setListenerDisplayName] = useState<string | null>(null);

  // P511 Task 6: Grace period state — when set, shows ReconnectingCountdown instead of instant PartnerLeftScreen
  const [gracePeriodStart, setGracePeriodStart] = useState<Date | null>(null);

  // P511 Task 10: Rejoin prompt state for /live landing
  const [rejoinSession, setRejoinSession] = useState<{
    code: string;
    partnerName: string | null;
    guestDisplayName: string | null;
    role: 'creator' | 'joiner';
    sessionId: string;
  } | null>(null);
  const [isCheckingRejoin, setIsCheckingRejoin] = useState(false);
  const [isRejoining, setIsRejoining] = useState(false);

  // Sync live state to context so BottomNav can intercept nav during live sessions
  // Not live if: still on start screen, or session has ended (partner left / creator left)
  useEffect(() => {
    const isInLive = view === 'live' && !sessionEnded && !partnerLeft;
    setIsLive(isInLive);
    return () => { setIsLive(false); };
  }, [view, sessionEnded, partnerLeft, setIsLive]);

  // Scroll to top on view transitions (prevents mid-page render after join, restore, refresh)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  // P511: Heartbeat — creators only, only when in live view
  useSessionHeartbeat(session?.id ?? null, isCreator && view === 'live');

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
  // P703: True when the join-via-link session is letter-sourced (requires authentication)
  const [joinSessionIsLetterSourced, setJoinSessionIsLetterSourced] = useState(false);

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

  // P792: Fetch partner's profile for avatar in badge
  useEffect(() => {
    const partnerProfileId = session
      ? isCreator
        ? session.joinerProfileId
        : session.creatorProfileId
      : null;
    if (!partnerProfileId) { setPartnerProfile(null); return; }
    void Promise.resolve(null)
      .then(() => getProfile(partnerProfileId))
      .then(setPartnerProfile)
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps -- getProfile is a stable module export; setPartnerProfile is a stable state setter
  }, [session?.joinerProfileId, session?.creatorProfileId, isCreator]);

  // P28.1/P566: Audio recording and events collection for ML training
  // Uses chunked mode (5s uploads) with IndexedDB persistence + upload queue
  const sessionCodeForChunks = useRef<string | null>(null);
  const userNameForChunks = useRef<string | null>(null);
  const sessionForChunks = useRef<ClaritySession | null>(null);
  const userForChunks = useRef<{ id: string; email?: string } | null>(null); // For Mixpanel correlation
  const eventsCollectorRef = useRef(new SessionEventsCollector());
  const recordingStartTimeRef = useRef<number>(0);

  // P566: Chunk store + upload queue
  const chunkStoreRef = useRef<ChunkStore | null>(null);
  const uploadQueueRef = useRef<ChunkUploadQueue | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(() => {
    // Debug: ?debugUpload=uploading|complete|failed simulates upload states on localhost
    if (!import.meta.env.PROD) {
      const debugUpload = new URLSearchParams(window.location.search).get('debugUpload');
      if (debugUpload === 'uploading') return { status: 'uploading', pending: 3, total: 10 };
      if (debugUpload === 'complete') return { status: 'complete', pending: 0, total: 10 };
      if (debugUpload === 'failed') return { status: 'failed', pending: 2, total: 10 };
    }
    return null;
  });

  // P584: Navigation guard state — prevents navigating away during upload
  const [showUploadNavGuard, setShowUploadNavGuard] = useState(false);
  const uploadNavGuardRef = useRef<(() => void) | null>(null);

  // P584: Navigation guard — popstate + pushState pattern (proven in P427/story-detail-page)
  // BrowserRouter doesn't support useBlocker; use popstate + history.pushState instead.
  useEffect(() => {
    const isUploading = uploadProgress?.status === 'uploading';

    // Remove any previously-registered handler
    if (uploadNavGuardRef.current) {
      window.removeEventListener('popstate', uploadNavGuardRef.current, true);
      uploadNavGuardRef.current = null;
    }

    if (!isUploading) return;

    const handler = () => {
      // Re-push the current URL to keep the browser on this page
      window.history.pushState(null, '', window.location.href);
      setShowUploadNavGuard(true);
    };

    uploadNavGuardRef.current = handler;
    window.addEventListener('popstate', handler, { capture: true });

    return () => {
      window.removeEventListener('popstate', handler, { capture: true });
      uploadNavGuardRef.current = null;
    };
  }, [uploadProgress?.status]);

  // P566: Initialize chunk store on mount
  useEffect(() => {
    let cancelled = false;
    createChunkStore().then((store) => {
      if (cancelled) return;
      chunkStoreRef.current = store;

      // Create upload queue
      const queue = new ChunkUploadQueue(store);
      uploadQueueRef.current = queue;

      // Upload function for the queue
      const uploadFn = async (chunkKey: string, blob: Blob, metadata: ChunkMetadata) => {
        await uploadSingleChunk(metadata.sessionCode, metadata.userName, blob, metadata.chunkNumber);
      };

      queue.start(uploadFn);

      // Upload orphaned chunks from previous sessions
      ChunkUploadQueue.uploadOrphanedChunks(store, 24 * 60 * 60 * 1000, uploadFn).catch((err) => {
        console.error('[P566] Failed to upload orphaned chunks:', err);
      });
    });

    return () => {
      cancelled = true;
      uploadQueueRef.current?.destroy();
    };
  }, []);

  // P566: Upload health hook
  const { uploadHealth } = useUploadHealth(uploadQueueRef.current);

  // P566: onChunkProduced callback — persist to IndexedDB + enqueue
  const handleChunkProduced = useCallback((
    chunkBlob: Blob,
    chunkNumber: number,
    _isLastChunk: boolean,
  ) => {
    const code = sessionCodeForChunks.current;
    const userName = userNameForChunks.current;
    const currentSession = sessionForChunks.current;
    const currentUser = userForChunks.current;
    const store = chunkStoreRef.current;
    const queue = uploadQueueRef.current;

    if (!code || !userName || !store || !queue) {
      console.warn('[P566] Cannot process chunk - missing session code, user name, store, or queue');
      return;
    }

    const chunkKey = `${code}_${userName}_${chunkNumber}`;
    const metadata: ChunkMetadata = {
      sessionCode: code,
      userName,
      chunkNumber,
      createdAt: Date.now(),
      blobSize: chunkBlob.size,
      mimeType: chunkBlob.type || 'audio/webm',
    };

    // Save to IndexedDB then enqueue (async but fire-and-forget from recorder's perspective)
    store.saveChunk(chunkKey, chunkBlob, metadata).then(() => {
      queue.enqueue(chunkKey);
    }).catch((err) => {
      console.error(`[P566] Failed to save chunk ${chunkKey} to store:`, err);
    });

    // P28.2: Upload events snapshot alongside each chunk (fire-and-forget)
    if (currentSession && eventsCollectorRef.current.isStarted()) {
      const participants: { name: string; role: 'creator' | 'joiner' }[] = [
        { name: currentSession.creatorName, role: 'creator' },
        ...(currentSession.joinerName ? [{ name: currentSession.joinerName, role: 'joiner' as const }] : []),
      ];
      const uploader = currentUser
        ? { supabaseUserId: currentUser.id, email: currentUser.email, name: userName }
        : { name: userName };
      uploadEventsSnapshot(code, userName, chunkNumber, eventsCollectorRef.current, participants, uploader).catch((err) => {
        console.error('[P566] Events snapshot upload failed:', err);
      });
    }
  }, []);

  const { isRecording, startRecording, stopRecording, requestImmediateFlush } = useAudioRecorder({
    onChunkProduced: handleChunkProduced,
    chunkIntervalMs: 5000, // P566: 5 seconds for faster persistence
  });

  // P566: Flush on visibility change (tab switch / phone lock)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isRecording) {
        requestImmediateFlush();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isRecording, requestImmediateFlush]);

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
  // P779: safeReturnTo read inside Realtime/polling callbacks — the effect is pinned to
  // [session?.id, session?.code], so a direct closure would capture the value at first
  // render of those deps (null if URL params hydrate late) and silently no-op forever.
  const safeReturnToRef = useRef<string | null>(null);
  // P511 Task 6: Grace period ref (mirrors gracePeriodStart state for use in callbacks)
  const gracePeriodStartRef = useRef<Date | null>(null);
  // Ref to track if I am leaving (prevents detecting my own departure as partner leaving)
  const iAmLeavingRef = useRef(false);
  // P272: Guard against duplicate story verification inserts on re-renders
  const verificationFiredRef = useRef<Set<string>>(new Set());
  // P516: Track last user action timestamp for exit telemetry
  const lastActionTimestampRef = useRef<number>(Date.now());
  // P516: Track session start time for duration telemetry
  const sessionStartTimestampRef = useRef<number>(Date.now());
  // P525: Track previous phase for Mixpanel live_phase_transition event
  const previousPhaseRef = useRef<string | undefined>(undefined);

  // P525: Sentry context — set on session join for retroactive debugging
  useEffect(() => {
    if (session?.code && name) {
      Sentry.setContext('live_session', {
        session_code: session.code,
        session_id: session.id,
        role: isCreator ? 'creator' : 'joiner',
        current_user: name,
        partner: partnerName ?? 'waiting',
      });
    }
  }, [session?.code, session?.id, name, isCreator, partnerName]);

  // P525: Phase transition observability — Sentry breadcrumbs + Mixpanel events
  useEffect(() => {
    const currentPhase = liveState.ratingPhase;
    const prevPhase = previousPhaseRef.current;
    if (prevPhase !== undefined && prevPhase !== currentPhase) {
      // Sentry breadcrumb for the transition timeline
      Sentry.addBreadcrumb({
        category: 'live_session',
        message: `Phase: ${prevPhase} → ${currentPhase}`,
        level: 'info',
        data: { round: liveState.currentRound, session_code: session?.code },
      });
      // Mixpanel event for funnel analysis
      try {
        analytics.track('live_phase_transition', {
          session_code: session?.code,
          from_phase: prevPhase,
          to_phase: currentPhase,
          round: liveState.currentRound,
          timestamp: new Date().toISOString(),
        });
      } catch { /* never let analytics break the app */ }
    }
    previousPhaseRef.current = currentPhase;
  }, [liveState.ratingPhase, liveState.currentRound, session?.code]);

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

  // P779: keep safeReturnTo in a ref so the Realtime/polling effect reads the current
  // URL-derived value, not the one closed over when session?.id first resolved.
  useEffect(() => {
    safeReturnToRef.current = safeReturnTo;
  }, [safeReturnTo]);

  // Refs to track isCreator and view for use in pagehide handler (avoids stale closure)
  const isCreatorRef = useRef(isCreator);
  useEffect(() => {
    isCreatorRef.current = isCreator;
  }, [isCreator]);

  // P921 Cause 3: keep the creator's JWT in a ref so confirmExitMeeting can pass it
  // to completeClaritySessionKeepalive synchronously (no getSession await before the
  // keepalive fetch, so an immediate post-click nav can't abort it).
  const accessTokenRef = useRef(authSession?.access_token);
  useEffect(() => {
    accessTokenRef.current = authSession?.access_token;
  }, [authSession?.access_token]);

  const viewRef = useRef<ViewState>(view);
  useEffect(() => {
    viewRef.current = view;
    // P516: Reset session start timestamp when entering live view
    if (view === 'live') {
      sessionStartTimestampRef.current = Date.now();
    }
  }, [view]);

  // P511: pagehide handler — analytics only, no DB writes.
  // DB cleanup is now handled by the heartbeat timeout (server-side reaper).
  // DB writes in pagehide were unreliable (browser kills keepalive fetches inconsistently).
  useEffect(() => {
    const handlePageHide = (e: PageTransitionEvent) => {
      if (e.persisted) return; // bfcache — page will be restored, skip
      const sessionId = currentSessionIdRef.current;
      if (!sessionId || iAmLeavingRef.current) return;
      if (viewRef.current !== 'live') return;
      iAmLeavingRef.current = true;

      // P516: Track session exit via pagehide (tab close / navigation away)
      analytics.track('live_session_exited', {
        session_code: sessionCodeRef.current,
        exit_reason: 'pagehide',
        time_since_last_action_ms: Date.now() - lastActionTimestampRef.current,
        had_focus_when_exited: !document.hidden,
        is_creator: isCreatorRef.current,
        session_duration_seconds: Math.round((Date.now() - sessionStartTimestampRef.current) / 1000),
        checks_completed_so_far: confirmedLiveStateRef.current.checksCount,
        round_number: (confirmedLiveStateRef.current.sessionHistory ?? []).length,
      });
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
    // P703: Letter-sourced sessions require the specific authenticated listener — redirect to login
    if (isJoinViaLink && joinSessionIsLetterSourced) {
      const redirectTo = encodeURIComponent(window.location.pathname + window.location.search);
      navigate(`/login?redirect=${redirectTo}`, { replace: true });
      return;
    }
    if (isJoinViaLink) return;
    // Check for a stored session — guest may have refreshed mid-session (sessionStorage)
    const storedCode = storage?.getItem(STORAGE_KEYS.SESSION_CODE);
    if (storedCode) return; // Restoration will handle this
    // Check localStorage for active session — guest may have closed tab and reopened /live
    const activeStored = getActiveSessionFromStorage();
    if (activeStored) return; // Rejoin prompt effect will handle this
    navigate('/signup');
  }, [isAuthLoading, isRestoring, user, isJoinViaLink, joinSessionIsLetterSourced, navigate]);

  // Pre-fill name from logged-in user, or from last guest session (localStorage)
  useEffect(() => {
    if (user?.name && !name) {
      setName(user.name);
    } else if (!user && !name) {
      const stored = getActiveSessionFromStorage();
      if (stored?.guestDisplayName) {
        setName(stored.guestDisplayName);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- user object used for null check; user?.name already tracked
  }, [user?.name, name]);

  // B48: Old P40 effect removed - mic permission is now checked BEFORE transitioning to live
  // via gateMicAndGoLive() and pendingLiveTransition pattern (see line ~1390)

  // P28.1: Start audio recording when session goes live AND mic permission granted
  // P28.2: Only record in production to avoid polluting training data with dev sessions
  useEffect(() => {
    // Gate C (P160): skip recording entirely for private sessions
    if (view === 'live' && session && !isRecording && micStatus === 'granted' && !session.isPrivate) {
      // P28.2: Only record in prod by default. P809: non-prod can opt-in via
      // `?dev-recording=1` URL flag for local reproduction of upload bugs.
      // Prod path is untouched — the flag is no-op there.
      if (!import.meta.env.PROD && !isDevRecordingActive()) {
        return;
      }

      // Permission granted - start recording
      // Set refs for chunk upload callback (avoids stale closures)
      sessionCodeForChunks.current = session.code;
      userNameForChunks.current = name;
      sessionForChunks.current = session; // P28.2: Store session for events snapshot
      userForChunks.current = user ? { id: user.id, email: user.email } : null; // For Mixpanel correlation
      eventsCollectorRef.current.start();
      // P28.2: Register collector so ALL analytics.track() calls are captured for ML
      analytics.registerMLCollector(eventsCollectorRef.current);
      recordingStartTimeRef.current = Date.now();
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
      requestMicPermission().then((granted) => {
        if (!granted) {
          // Show retry dialog if permission denied
          setShowMicDialog(true);
        }
      });
    }
  }, [view, isCreator, micStatus, isPrivate, requestMicPermission]);

  // Helper to clear stored session
  const clearStoredSession = () => {
    storage?.removeItem(STORAGE_KEYS.SESSION_CODE);
    storage?.removeItem(STORAGE_KEYS.SESSION_ID);
    storage?.removeItem(STORAGE_KEYS.USER_NAME);
    storage?.removeItem(STORAGE_KEYS.IS_CREATOR);
  };

  // HIGH #6: Restore session from sessionStorage on mount
  // IMPORTANT: Skip restoration if user is joining via link (urlCode takes priority)
  useEffect(() => {
    const restoreSession = async () => {
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
            const restoredLiveState = restoredSession.liveState as Record<string, unknown> | null;
            const sessionAlreadyEnded = restoredLiveState?.sessionEnded === true || restoredLiveState?.joinerEnded === true;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- session restore runs once on mount; urlCode is stable from URL
  }, [isJoinViaLink]);

  // P511 Task 10: Check localStorage for active session to show rejoin prompt on /live landing
  useEffect(() => {
    // Only check on the landing page (not join-via-link) and when no session is already restored
    if (isJoinViaLink || session) return;

    const checkActiveSession = async () => {
      const stored = getActiveSessionFromStorage();
      if (!stored) return;

      setIsCheckingRejoin(true);
      try {
        const activeSession = await getActiveSessionByCode(stored.code);
        if (activeSession) {
          // Session still active — show rejoin prompt
          // Use partner name from DB (more up-to-date than localStorage)
          const partnerName = stored.role === 'creator'
            ? activeSession.joinerName ?? null
            : activeSession.creatorName ?? null;
          setRejoinSession({
            code: stored.code,
            partnerName,
            guestDisplayName: stored.guestDisplayName ?? null,
            role: stored.role,
            sessionId: activeSession.id,
          });
        } else {
          // P769: Session ended — show "This session has ended" screen instead of create-landing
          clearActiveSessionFromStorage();
          clearActiveSession();
          setSessionEndedOnLoad(true);
        }
      } catch {
        // Network error — don't show rejoin prompt, fall through to normal landing
        console.error('[Live] Failed to check active session for rejoin prompt');
      } finally {
        setIsCheckingRejoin(false);
      }
    };

    checkActiveSession();
  }, [isJoinViaLink, session, clearActiveSession]);

  // P582: Subscribe to realtime updates while rejoin prompt is visible.
  // The main subscription (line ~867) requires `session` to be non-null, but
  // the rejoin prompt is a pre-session state (session=null). Without this,
  // the prompt never clears when the session ends remotely.
  // P595: Added polling fallback — realtime alone is fragile (WebSocket drops
  // silently on mobile). Polls every 5s as a safety net.
  useEffect(() => {
    if (!rejoinSession) return;

    const unsubscribe = subscribeToClaritySession(rejoinSession.sessionId, rejoinSession.code, (updatedSession) => {
      const liveState = updatedSession.liveState as Record<string, unknown> | null;
      if (liveState?.sessionEnded === true || liveState?.joinerEnded === true) {
        clearActiveSession(); // also clears localStorage via clearActiveSessionFromStorage()
        setRejoinSession(null);
      }
    });

    // P595: Polling fallback — if realtime subscription drops, this catches ended sessions
    const pollInterval = setInterval(async () => {
      const activeSession = await getActiveSessionByCode(rejoinSession.code);
      if (!activeSession) {
        // Session ended or expired — clear the stale rejoin prompt
        clearActiveSession();
        setRejoinSession(null);
      }
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rejoinSession?.sessionId is the stable identity; adding full object would re-subscribe on every state change
  }, [rejoinSession?.sessionId, clearActiveSession]);

  // P703: Fetch listener display name for waiting screen invite panel
  useEffect(() => {
    if (!session?.targetListenerId) return;
    supabase
      .from('profiles')
      .select('name')
      .eq('id', session.targetListenerId)
      .single()
      .then(({ data }) => {
        if (data && typeof data.name === 'string') setListenerDisplayName(data.name);
      });
  }, [session?.targetListenerId]);

  // Fetch host name when joining via link (for personalized "Join X's Session" title)
  useEffect(() => {
    if (!isJoinViaLink || !urlCode) return;

    const fetchHostName = async () => {
      try {
        const [sessionInfo, requiresAuth] = await Promise.all([
          getClaritySession(urlCode.toUpperCase()),
          // P703: Check via public SECURITY DEFINER RPC — works even when unauthenticated
          checkSessionRequiresAuth(urlCode.toUpperCase()),
        ]);
        if (sessionInfo?.creatorName) {
          setHostName(sessionInfo.creatorName);
        }
        // P160: Capture session's recording state for joiner UI
        setJoinSessionIsPrivate(sessionInfo?.isPrivate ?? false);
        // P703: Set auth requirement flag — triggers redirect in auth guard for anon users
        setJoinSessionIsLetterSourced(requiresAuth);
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

  // Subscribe to session updates
  // Note: We intentionally use session?.id and session?.code as dependencies
  // rather than the full session object to avoid re-subscribing on every state change.
  // The subscription callback uses functional updates to avoid stale closures.
  useEffect(() => {
    if (!session) {
      return;
    }

    const sessionId = session.id;

    const sessionCode = session.code;
    const unsubscribe = subscribeToClaritySession(sessionId, sessionCode, (updatedSession) => {
      // Guard: Ignore updates from stale sessions (prevents race condition when exiting)
      // This can happen if a realtime update arrives after user clicked "Leave" but before cleanup
      if (currentSessionIdRef.current !== updatedSession.id) {
        return;
      }

      // Guard: Skip if I am leaving or session already ended (prevents processing updates after departure)
      if (iAmLeavingRef.current || sessionEndedRef.current || partnerLeftRef.current) {
        return;
      }

      // Check for session end (creator clicked "End Session") — immediate, no grace period
      const sessionEndedInLiveState = (updatedSession.liveState as Record<string, unknown>)?.sessionEnded;
      if (sessionEndedInLiveState) {
        // Update ref immediately to prevent any subsequent updates from processing
        sessionEndedRef.current = true;
        setGracePeriodStart(null); // Cancel any active grace period
        setDepartedPartnerName(updatedSession.creatorName);
        setSessionEnded(true);
        // P921 Cause 2: a tab that learns of the end REMOTELY (here, not via its
        // own End-Session button) must also drop its clarity_live_* sessionStorage.
        // P769 invariant: session-end clears storage on both sides.
        clearStoredSession();
        analytics.track('live_session_partner_left', {
          session_code: updatedSession.code,
          left_by: 'creator',
          exit_reason: 'partner_departure',
          checks_completed_so_far: confirmedLiveStateRef.current.checksCount,
        });
        // P779: joiner auto-returns to letter (or wherever returnTo points) instead of lingering on /live
        if (safeReturnToRef.current) navigate(safeReturnToRef.current, { replace: true });
        return; // Don't process further updates after session ends
      }

      // Check for joiner deliberately ending session — immediate, no grace period
      // (mirrors the sessionEnded pattern for creator exit)
      const joinerEndedInLiveState = (updatedSession.liveState as Record<string, unknown>)?.joinerEnded;
      if (joinerEndedInLiveState && !partnerLeftRef.current) {
        partnerLeftRef.current = true;
        setGracePeriodStart(null);
        gracePeriodStartRef.current = null;
        setDepartedPartnerName(lastJoinerNameRef.current);
        setPartnerLeft(true);
        analytics.track('live_session_partner_left', {
          session_code: updatedSession.code,
          left_by: 'joiner',
          exit_reason: 'deliberate_end',
          checks_completed_so_far: confirmedLiveStateRef.current.checksCount,
        });
        // P779: symmetric — creator auto-returns when joiner ends
        if (safeReturnToRef.current) navigate(safeReturnToRef.current, { replace: true });
        return;
      }

      // P511 Task 6: Check if partner returned during grace period
      if (updatedSession.joinerName && gracePeriodStartRef.current) {
        gracePeriodStartRef.current = null;
        setGracePeriodStart(null);
        markJoinerDetected(updatedSession.joinerName);
        analytics.track('live_session_partner_returned', {
          session_code: updatedSession.code,
        });
      }

      // Check for joiner departure (I'm creator, joiner left)
      // P511 Task 6: Enter grace period instead of immediate departure
      // Skip if joiner deliberately ended (joinerEnded already handled above)
      if (!updatedSession.joinerName && hasJoinerRef.current && !partnerLeftRef.current && !gracePeriodStartRef.current) {
        const now = new Date();
        gracePeriodStartRef.current = now;
        setGracePeriodStart(now);
        setDepartedPartnerName(lastJoinerNameRef.current);
        hasJoinerRef.current = false;
        analytics.track('live_session_grace_period_started', {
          session_code: updatedSession.code,
          left_by: 'joiner',
          checks_completed_so_far: confirmedLiveStateRef.current.checksCount,
        });
        // Don't return — continue processing updates during grace period
      }

      setSession(updatedSession);

      // Sync live state from session (merge with defaults for missing fields)
      // Also update the confirmed ref to prevent drift detection from reverting
      // IMPORTANT: Skip if an update is in flight to prevent realtime from reverting optimistic updates
      // This fixes the "flashing button" bug where realtime delivers old state before DB save completes
      if (updatedSession.liveState) {
        const mergedState = { ...DEFAULT_LIVE_STATE, ...updatedSession.liveState } as LiveSessionState;

        // P671/P976: Monotonic state guard — reject stale Realtime echoes that regress either
        // the phase (P671) or boolean submission flags (P976) at the same phase.
        const stateRegression = isStateRegression(confirmedLiveStateRef.current, mergedState);

        if (import.meta.env.DEV) {
          const incoming = updatedSession.liveState as Record<string, unknown>;
          const prevPhase = confirmedLiveStateRef.current.ratingPhase;
          const nextPhase = mergedState.ratingPhase;
          // eslint-disable-next-line no-console -- gated by import.meta.env.DEV; dev-only diagnostic (P1200)
          console.log(
            `[Realtime] ${new Date().toISOString()} Event ${stateRegression ? 'REJECTED (regression)' : updateInFlightRef.current ? 'MERGED (inFlight)' : 'applied'}:`,
            `phase=${prevPhase}→${nextPhase}`,
            `checkerSubmitted=${incoming.checkerSubmitted ?? '∅'}`,
            `responderSubmitted=${incoming.responderSubmitted ?? '∅'}`,
            `celebCreator=${incoming.celebrationAcknowledgedByCreator ?? '∅'}`,
            `celebJoiner=${incoming.celebrationAcknowledgedByJoiner ?? '∅'}`,
          );
        }

        if (stateRegression) {
          // Stale echo — skip state application entirely.
          // The next Realtime event (or drift poll) will carry the correct state.
        } else if (updateInFlightRef.current) {
          // P609/P741: Field-aware merge — partner-owned keys preserved, ratingPhase monotonic (P671).
          const myKey = isCreator ? 'freeSliderCreator' : 'freeSliderJoiner';
          const myPositionKey = isCreator ? 'livePositionsCreator' : 'livePositionsJoiner';
          const snapshot = confirmedLiveStateRef.current;
          const merged = mergeInFlight({
            incoming: mergedState,
            prev: liveState,
            confirmedRef: snapshot,
            myKey,
            myPositionKey,
            isPhaseRegression,
          });
          setLiveState(merged.nextState);
          confirmedLiveStateRef.current = merged.nextConfirmedRef;
        } else {
          // Normal: wholesale replace
          setLiveState(mergedState);
          confirmedLiveStateRef.current = mergedState;
        }
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
    }, (channelStatus) => {
      try {
        analytics.track('live_realtime_channel_status', {
          sessionCode,
          channelStatus,
        });
      } catch { /* never let analytics break the app */ }
    });

    // Fallback: Poll for updates as a safety net
    // This handles cases where realtime subscription might not fire
    // Also catches liveState drift when signals are lost between phones
    let pollTickCount = 0;
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

      // P934: heartbeat so a dead/silent poll loop is distinguishable from a healthy one
      // Emit at tick 1 (proves liveness in short sessions) and every 30 thereafter
      pollTickCount++;
      if (pollTickCount === 1 || pollTickCount % 30 === 0) {
        try {
          analytics.track('live_poll_heartbeat', {
            sessionCode: currentCode,
            tickCount: pollTickCount,
          });
        } catch { /* never let analytics break the app */ }
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
        // Case A: Session ended (creator clicked "End Session") — immediate, no grace period
        // Check live_state.sessionEnded since ended_at column doesn't exist
        const sessionEndedInLiveState = (freshSession.liveState as Record<string, unknown>)?.sessionEnded;
        if (sessionEndedInLiveState) {
          // Update ref immediately to prevent any subsequent updates from processing
          sessionEndedRef.current = true;
          gracePeriodStartRef.current = null;
          setGracePeriodStart(null);
          // Store the partner's name before we clear session
          setDepartedPartnerName(freshSession.creatorName);
          setSessionEnded(true);
          // P921 Cause 2: polling-detected remote end must clear storage too
          // (mirrors the Realtime branch). P769 invariant: end clears both sides.
          clearStoredSession();
          analytics.track('live_session_partner_left', {
            session_code: freshSession.code,
            left_by: 'creator',
            exit_reason: 'partner_departure',
            checks_completed_so_far: confirmedLiveStateRef.current.checksCount,
          });
          // P779: joiner auto-returns to letter (polling fallback mirrors Realtime branch)
          if (safeReturnToRef.current) navigate(safeReturnToRef.current, { replace: true });
          return;
        }

        // Case A.5: Joiner deliberately ended session — immediate, no grace period
        const joinerEndedInLiveState = (freshSession.liveState as Record<string, unknown>)?.joinerEnded;
        if (joinerEndedInLiveState && !partnerLeftRef.current) {
          partnerLeftRef.current = true;
          gracePeriodStartRef.current = null;
          setGracePeriodStart(null);
          setDepartedPartnerName(lastJoinerNameRef.current);
          setPartnerLeft(true);
          analytics.track('live_session_partner_left', {
            session_code: freshSession.code,
            left_by: 'joiner',
            exit_reason: 'deliberate_end',
            checks_completed_so_far: confirmedLiveStateRef.current.checksCount,
          });
          // P779: symmetric — creator auto-returns on joiner-triggered end (polling fallback)
          if (safeReturnToRef.current) navigate(safeReturnToRef.current, { replace: true });
          return;
        }

        // P511 Task 6: Check if partner returned during grace period
        if (freshSession.joinerName && gracePeriodStartRef.current) {
          gracePeriodStartRef.current = null;
          setGracePeriodStart(null);
          markJoinerDetected(freshSession.joinerName);
          setSession(freshSession);
          analytics.track('live_session_partner_returned', {
            session_code: freshSession.code,
          });
          return;
        }

        // Case B: Joiner left (creator sees this) - joiner_name went from set to null
        // P511 Task 6: Enter grace period instead of immediate departure
        // Skip if joiner deliberately ended (joinerEnded already handled above)
        if (!freshSession.joinerName && hasJoinerRef.current && !gracePeriodStartRef.current) {
          const now = new Date();
          gracePeriodStartRef.current = now;
          setGracePeriodStart(now);
          setDepartedPartnerName(lastJoinerNameRef.current);
          hasJoinerRef.current = false;
          analytics.track('live_session_grace_period_started', {
            session_code: freshSession.code,
            left_by: 'joiner',
            checks_completed_so_far: confirmedLiveStateRef.current.checksCount,
          });
          // Don't return — continue processing updates during grace period
        }

        // Check 2: Detect liveState drift (fixes lost signal bug)
        // Compare server state with our last confirmed state
        // P671: No longer skip during in-flight — merge-on-top instead (same as Realtime handler)
        const hasLiveState = !!freshSession.liveState;
        const hasJoiner = hasJoinerRef.current;

        if (!hasLiveState || !hasJoiner) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console -- gated by import.meta.env.DEV; dev-only diagnostic (P1200)
            console.log(`[Drift Poll] SKIPPED: hasLiveState=${hasLiveState}, hasJoiner=${hasJoiner}`);
          }
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
        // P525: Drift detection uses new boolean keys (+ old array for backward compat)
        const celebrationCreatorDrift = (serverState.celebrationAcknowledgedByCreator ?? false) !== (localState.celebrationAcknowledgedByCreator ?? false);
        const celebrationJoinerDrift = (serverState.celebrationAcknowledgedByJoiner ?? false) !== (localState.celebrationAcknowledgedByJoiner ?? false);
        const celebrationAcknowledgedByDrift = celebrationCreatorDrift || celebrationJoinerDrift || ((serverState.celebrationAcknowledgedBy?.length ?? 0) !== (localState.celebrationAcknowledgedBy?.length ?? 0));
        // P490: livePositions missing from drift check caused guest positions to never sync
        // when Realtime WebSocket dropped. JSON.stringify comparison consistent with celebrationAcknowledgedBy pattern.
        const livePositionsDrift = JSON.stringify(serverState.livePositions ?? {}) !== JSON.stringify(localState.livePositions ?? {});
        // P825: livePositions is @deprecated (P562). New position writes go to livePositionsCreator/Joiner.
        // Without these drift checks, partner position taps are silently lost when WS drops.
        const livePositionsCreatorDrift = JSON.stringify(serverState.livePositionsCreator ?? {}) !== JSON.stringify(localState.livePositionsCreator ?? {});
        const livePositionsJoinerDrift = JSON.stringify(serverState.livePositionsJoiner ?? {}) !== JSON.stringify(localState.livePositionsJoiner ?? {});
        // P637: ratingInitiatedBy was missing — partner's mode switcher never disabled when Realtime dropped
        const ratingInitiatedByDrift = (serverState.ratingInitiatedBy ?? '') !== (localState.ratingInitiatedBy ?? '');
        // P750: Free-mode slider positions were missing — missed Realtime slider events left partner dots stale indefinitely.
        // Normalize with `?? 0` to align with the display semantics at line ~1578 (`current.freeSliderCreator ?? 0`) — avoids spurious drift events when server has explicit 0 and local is still undefined.
        const freeSliderCreatorDrift = (serverState.freeSliderCreator ?? 0) !== (localState.freeSliderCreator ?? 0);
        const freeSliderJoinerDrift = (serverState.freeSliderJoiner ?? 0) !== (localState.freeSliderJoiner ?? 0);

        const serverHasUpdate = phaseDrift || checkerNameDrift || checkerDrift || checkerRatingDrift || responderDrift || responderRatingDrift || explainBackDoneDrift || checksCountDrift || clarificationPhaseDrift || roleSwitchNegotiationDrift || selectedStoryIdDrift || selectedStoryDataDrift || selectedContentTitleDrift || celebrationAcknowledgedByDrift || livePositionsDrift || livePositionsCreatorDrift || livePositionsJoinerDrift || ratingInitiatedByDrift || freeSliderCreatorDrift || freeSliderJoinerDrift;

        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console -- gated by import.meta.env.DEV; dev-only diagnostic (P1200)
          console.log(`[Drift Poll] server.ratingInitiatedBy=${serverState.ratingInitiatedBy}, local.ratingInitiatedBy=${localState.ratingInitiatedBy}, drift=${ratingInitiatedByDrift}, serverHasUpdate=${serverHasUpdate}`);
        }

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
              livePositionsCreatorDrift,
              livePositionsJoinerDrift,
              ratingInitiatedByDrift,
              freeSliderCreatorDrift,
              freeSliderJoinerDrift,
            });
          } catch (err) {
            // Analytics failure shouldn't break the app, but log for visibility
            console.warn('[Live Poll] Analytics error:', err);
          }

          const mergedState = { ...DEFAULT_LIVE_STATE, ...serverState };
          if (isStateRegression(confirmedLiveStateRef.current, mergedState)) {
            // P976: Stale poll result — skip. Same guard as the Realtime handler.
          } else if (updateInFlightRef.current) {
            // P609/P741: Field-aware merge — partner-owned keys preserved, ratingPhase monotonic (P671).
            const myKey = isCreator ? 'freeSliderCreator' : 'freeSliderJoiner';
            const myPositionKey = isCreator ? 'livePositionsCreator' : 'livePositionsJoiner';
            const snapshot = confirmedLiveStateRef.current;
            const merged = mergeInFlight({
              incoming: mergedState,
              prev: liveState,
              confirmedRef: snapshot,
              myKey,
              myPositionKey,
              isPhaseRegression,
            });
            setLiveState(merged.nextState);
            confirmedLiveStateRef.current = merged.nextConfirmedRef;
          } else {
            setLiveState(mergedState);
            confirmedLiveStateRef.current = mergedState;
          }
          setSession(freshSession);
        }
      } catch (err) {
        console.error('[Live Poll] Error:', err);
        // P934: emit so a throwing poll loop is distinguishable from a healthy/dead one
        try {
          analytics.track('live_poll_tick_error', {
            sessionCode: currentCode,
            error: err instanceof Error ? err.message : String(err),
          });
        } catch { /* never let analytics break the app */ }
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
        // P525+: Route to full overwrite or JSONB merge based on write contents.
        // See shouldUseFullOverwrite() for the decision logic and bug-fix history.
        const dbCall = shouldUseFullOverwrite(updates, stateBeforeUpdate as Record<string, unknown>)
          ? updateClaritySessionLiveState(session.id, newState)
          : patchClaritySessionLiveState(session.id, updates as Record<string, unknown>);
        await raceWithTimeout(dbCall, UPDATE_TIMEOUT_MS);
        // P609: Merge only the written keys into the confirmed ref, preserving
        // any partner updates that arrived via Realtime during the in-flight period.
        // Previously `confirmedLiveStateRef.current = newState` would overwrite partner
        // slider values with stale data captured before the write started.
        confirmedLiveStateRef.current = { ...confirmedLiveStateRef.current, ...updates } as LiveSessionState;
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console -- gated by import.meta.env.DEV; dev-only diagnostic (P1200)
          console.log(`[LiveUpdate] Write succeeded: ${Object.keys(updates).join(', ')}`);
        }
      } catch (err) {
        console.error('[Live Update] Failed to update state:', err);
        if (import.meta.env.DEV) {
          console.error(`[LiveUpdate] Write FAILED + REVERTED: ${Object.keys(updates).join(', ')}`);
        }
        // P525: Capture failure in Sentry with sanitized state snapshot
        try {
          Sentry.captureException(err, {
            extra: {
              live_state: sanitizeLiveStateForSentry(stateBeforeUpdate as unknown as Record<string, unknown>),
              attempted_keys: Object.keys(updates),
              session_code: session.code,
            },
          });
        } catch { /* never let Sentry break the app */ }
        // P525: Track failure in Mixpanel
        try {
          analytics.track('live_state_update_failed', {
            session_code: session.code,
            error_message: err instanceof Error ? err.message : 'unknown',
            attempted_keys: Object.keys(updates),
            phase_at_failure: stateBeforeUpdate.ratingPhase,
          });
        } catch { /* never let analytics break the app */ }
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
  // P686: Track whether the current user is a certified certifier (badge giver)
  const [isCertifier, setIsCertifier] = useState(false);

  // P806: State-watching badge insertion. Replaces per-handler awardBadgeIfEligible
  // calls (handleFreeRoundComplete / handleRatingSubmit / handleExplainBackRate) which
  // fired only on whichever client triggered the action — and never on the certifier
  // when the listener was the second to reach 10 (the dominant prod scenario).
  // Both clients run this effect; the helper short-circuits on non-certifiers.
  // Idempotent via local roundKey ref + DB UNIQUE constraint as backstop.
  const badgeFiredRoundsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const explainBacks = liveState.explainBackRatings ?? [];
    const lastExplainBack = explainBacks.length > 0 ? explainBacks[explainBacks.length - 1] : undefined;
    const reachedPerfect =
      (liveState.checkerRating === 10 && liveState.responderRating === 10) ||
      (liveState.freeSliderCreator === 10 && liveState.freeSliderJoiner === 10) ||
      lastExplainBack === 10;
    if (!reachedPerfect) return;
    if (liveState.badgePointEarned === true) return;

    const sessionId = session?.id;
    if (!sessionId) return;
    const myProfileId = isCreator ? session?.creatorProfileId : session?.joinerProfileId;
    const listenerProfileId = isCreator ? session?.joinerProfileId : session?.creatorProfileId;
    if (!myProfileId || !listenerProfileId) return;

    const roundKey = `${sessionId}:${liveState.selectedStoryId ?? ''}:${liveState.currentRound ?? 0}`;
    if (badgeFiredRoundsRef.current.has(roundKey)) return;
    badgeFiredRoundsRef.current.add(roundKey);

    const livePositions = isCreator
      ? liveState.livePositionsJoiner
      : liveState.livePositionsCreator;

    void (async () => {
      try {
        const badgeResult = await awardBadgeIfEligible({
          storyData: liveState.selectedStoryData,
          livePositions,
          myProfileId,
          listenerProfileId,
          sessionId,
        });
        if (badgeResult.isCertifier) setIsCertifier(true);
        if (badgeResult.badgePointEarned) {
          updateLiveState({
            badgePointEarned: true,
            badgeCount: badgeResult.newBadgeCount,
          });
        }
      } catch (err) {
        // Rollback the ref guard so a subsequent state change can retry.
        // Without this, a transient network error permanently suppresses the badge.
        badgeFiredRoundsRef.current.delete(roundKey);
        console.error('[P806] Badge state-watcher failed:', err);
      }
    })();
  }, [
    liveState.checkerRating,
    liveState.responderRating,
    liveState.freeSliderCreator,
    liveState.freeSliderJoiner,
    liveState.explainBackRatings,
    liveState.badgePointEarned,
    liveState.currentRound,
    liveState.selectedStoryId,
    liveState.selectedStoryData,
    liveState.livePositionsCreator,
    liveState.livePositionsJoiner,
    session?.id,
    session?.creatorProfileId,
    session?.joinerProfileId,
    isCreator,
    updateLiveState,
  ]);

  // P562: Free mode reuses guided mode's handleStartCheck — no separate handler needed.
  // The guided mode round runs identically; divergence happens in handleCelebrationComplete.

  const handleStartCheck = useCallback(() => {
    if (!name || !partnerName) return;

    // Guard: if a check is already in progress (someone already submitted), don't start a new local rating
    // This prevents race condition where both users tap "I spoke" and submit simultaneously
    const currentState = confirmedLiveStateRef.current;
    if (currentState.checkerName || currentState.ratingPhase !== 'idle') {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console -- gated by import.meta.env.DEV; dev-only diagnostic (P1200)
        console.log(`[Guard] handleStartCheck: ref.ratingPhase=${currentState.ratingPhase}, ref.checkerName=${!!currentState.checkerName}, action=rejected`);
      }
      return;
    }

    // Track check initiation
    analytics.track('live_check_started', {
      session_code: session?.code,
      flow_type: 'check',
    });
    lastActionTimestampRef.current = Date.now(); // P516

    // P398: Signal partner to close history view immediately (before submission)
    // P646: Write isCreator flag alongside name — name comparison breaks when both users share a name
    updateLiveState({ ratingInitiatedBy: name, ratingInitiatedByIsCreator: isCreator });

    setLocalFlowType('check');
    setIsLocallyRating(true);
  }, [name, partnerName, session?.code, updateLiveState, isCreator]);

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
    // P646: Write isCreator flag alongside name — name comparison breaks when both users share a name
    updateLiveState({ ratingInitiatedBy: name, ratingInitiatedByIsCreator: isCreator });

    setLocalFlowType('prove');
    setIsLocallyRating(true);
  }, [name, partnerName, session?.code, updateLiveState, isCreator]);

  // ============================================================================
  // P562: Free mode handlers
  // ============================================================================

  /** P562: Change session mode (entry screen toggle) */
  const handleSessionModeChange = useCallback((mode: 'guided' | 'free') => {
    updateLiveState({ sessionMode: mode });
  }, [updateLiveState]);

  // P562: handleFreeSealedBidSubmit and handleFreeParaphraseDone deleted —
  // guided mode's existing handlers run the first round. Divergence happens
  // in handleCelebrationComplete (see below).

  /** P562: Debounced slider change in unlocked mode */
  const handleFreeSliderChange = useCallback((value: number) => {
    const key = isCreator ? 'freeSliderCreator' : 'freeSliderJoiner';
    updateLiveState({ [key]: value });
  }, [isCreator, updateLiveState]);

  /** P562: "Speak freely" — exit round, return to idle */
  const handleFreeSpeakFreely = useCallback(() => {
    updateLiveState({
      freePhase: undefined,
      checkerName: undefined,
      checkerIsCreator: undefined,
      checkerSubmitted: false,
      responderSubmitted: false,
      checkerRating: undefined,
      responderRating: undefined,
      freeSliderCreator: undefined,
      freeSliderJoiner: undefined,
      freeRounds: undefined,
      freeRerating: undefined,
      ratingPhase: 'idle',
      ratingInitiatedBy: undefined, ratingInitiatedByIsCreator: undefined,
      explainBackDone: false,
      speakerSawExplainBackDone: false,
      explainBackRound: 0,
      explainBackRatings: [],
      // P600: Clear content selection so idle screen shows fresh
      selectedStoryId: undefined,
      selectedStoryData: undefined,
      selectedPointId: undefined,
      selectedContentTitle: undefined,
    });
  }, [updateLiveState]);

  /** P562: Round complete (10/10 auto-transition). P806: badge insertion moved to state-watcher useEffect. */
  const handleFreeRoundComplete = useCallback(() => {
    const current = confirmedLiveStateRef.current;
    if (current.freePhase !== 'unlocked') return;
    const partnerKey = isCreator ? 'freeSliderJoiner' : 'freeSliderCreator';
    if ((current[partnerKey] ?? 0) !== 10) return;
    updateLiveState({ freePhase: 'success' });
  }, [updateLiveState, isCreator]);

  /**
   * P879: Build a sessionHistory entry for a completed round (P128 shape + P398
   * journey data). Mirrors the guided bothDone blocks (handleCelebrationComplete
   * + guided reactive reset) — free-mode completion paths previously reset state
   * WITHOUT appending, so free rounds were never recorded.
   */
  const buildRoundHistoryEntry = useCallback((state: LiveSessionState): SessionHistoryItem => {
    const contentTitle = state.selectedContentTitle;
    const journeyData = {
      checkerRating: state.checkerRating,
      responderRating: state.responderRating,
      explainBackRatings: [...(state.explainBackRatings ?? [])],
      checkerName: state.checkerName,
      partnerName: partnerName ?? undefined,
      completedAt: new Date().toISOString(),
      isChecker: state.checkerIsCreator === isCreator,
    };
    return state.selectedStoryId
      ? { title: contentTitle || 'Story verification', type: 'story' as const, ...journeyData, storyData: state.selectedStoryData }
      : state.selectedPointId
        ? { title: contentTitle || 'Point verification', type: 'point' as const, ...journeyData }
        : { title: 'Free conversation', type: 'free' as const, ...journeyData };
  }, [partnerName, isCreator]);

  /** P562/P592: "Discuss another story" from free mode success — dual-ack pattern */
  const handleFreeDiscussAnother = useCallback(() => {
    const currentState = confirmedLiveStateRef.current;
    const myBooleanKey = isCreator ? 'celebrationAcknowledgedByCreator' : 'celebrationAcknowledgedByJoiner';
    const myAlreadyAcknowledged = currentState[myBooleanKey] === true;
    if (myAlreadyAcknowledged) return; // Already clicked

    const myUpdate = { [myBooleanKey]: true } as Partial<LiveSessionState>;
    const afterMyWrite = { ...currentState, ...myUpdate };
    const bothDone = isBothAcknowledgedCompat(afterMyWrite, session?.creatorName ?? '', partnerName ?? '');

    if (bothDone) {
      // Both acknowledged — reset to idle
      // P879: Record the completed free-mode round before clearing state
      // P892: Skip the append when the first ack (or exit flush) already recorded it
      const prevHistory = currentState.sessionHistory ?? [];
      const historyEntry = currentState.roundRecorded === true ? null : buildRoundHistoryEntry(currentState);
      updateLiveState({
        sessionHistory: historyEntry ? [...prevHistory, historyEntry] : prevHistory,
        roundRecorded: false,
        // P879: Increment round counter (mirrors guided bothDone reset)
        currentRound: (currentState.currentRound ?? 1) + 1,
        freePhase: undefined,
        checkerName: undefined,
        checkerIsCreator: undefined,
        checkerSubmitted: false,
        responderSubmitted: false,
        checkerRating: undefined,
        responderRating: undefined,
        freeSliderCreator: undefined,
        freeSliderJoiner: undefined,
        freeRounds: undefined,
      freeRerating: undefined,
        ratingPhase: 'idle',
        ratingInitiatedBy: undefined, ratingInitiatedByIsCreator: undefined,
        explainBackDone: false,
        speakerSawExplainBackDone: false,
        explainBackRound: 0,
        explainBackRatings: [],
        celebrationAcknowledgedByCreator: false,
        celebrationAcknowledgedByJoiner: false,
        celebrationAcknowledgedBy: [],
        // P686: Clear badge state for next round
        badgePointEarned: false,
        badgeCount: 0,
        // P600: Clear content selection so idle screen shows fresh
        selectedStoryId: undefined,
        selectedStoryData: undefined,
        selectedPointId: undefined,
        selectedContentTitle: undefined,
      });
    } else {
      // P892: First ack — record the completed round NOW (abandoned handshake
      // must not lose it). Patch path: no explicit undefined values.
      if (currentState.roundRecorded !== true) {
        const prevHistory = currentState.sessionHistory ?? [];
        updateLiveState({
          ...myUpdate,
          sessionHistory: [...prevHistory, buildRoundHistoryEntry(currentState)],
          roundRecorded: true,
        });
      } else {
        // Just set my boolean — waiting for partner
        updateLiveState(myUpdate);
      }
    }
  }, [isCreator, session?.creatorName, partnerName, updateLiveState, buildRoundHistoryEntry]);

  // P128: Handle story selection from content picker
  const handleSelectStory = useCallback(async (storyId: string, title: string, storyData?: StoryWithPoints) => {
    if (!name || !partnerName) return;

    // Guard: don't start if a story is already selected (picker only renders when
    // !selectedStoryId, but handleSelectStory is also wired via live-content-cards
    // which could fire from a stale card mid-rating).
    const currentState = confirmedLiveStateRef.current;
    if (currentState.selectedStoryId) {
      return;
    }

    lastActionTimestampRef.current = Date.now(); // P516
    analytics.track('story_session_started', {
      story_id: storyId,
      session_code: session?.code,
    });

    // P792: Preload both participants' saved positions for this story's points.
    // Mirrors bootstrapLetterSourcedSession (P733) — ensures badge shows partner's position
    // immediately in gap-revealed / explain-back phases without a round-trip.
    const pointIds = storyData?.points.map(p => p.id) ?? [];
    const creatorId = session?.creatorProfileId;
    const joinerId = session?.joinerProfileId;
    const [creatorPositions, joinerPositions] = pointIds.length > 0 && creatorId && joinerId
      ? await Promise.all([
          pointsService.getMyPositionsForPoints(pointIds, creatorId),
          pointsService.getMyPositionsForPoints(pointIds, joinerId),
        ])
      : [new Map<string, { position: PositionType }>(), new Map<string, { position: PositionType }>()];

    const creatorPositionRecord = toPositionRecord(creatorPositions);
    const joinerPositionRecord = toPositionRecord(joinerPositions);

    // P827: If the two participants share a completed letter that covers the
    // picked story, preload positions + ratings + ratingPhase='explain-back'
    // (Decision 3). Otherwise, fall through to the positions-only write below.
    // Null ratings after a discovery match (sealed-bid RLS blocks prediction
    // for a partially-completed delivery) → also fall through to positions-only.
    let letterPreloadState: LiveSessionState | null = null;
    if (creatorId && joinerId && storyData) {
      try {
        const descriptor = await findLetterPreloadForStory({
          storyId,
          participantAId: creatorId,
          participantBId: joinerId,
        });
        if (descriptor) {
          const ratings = await getLetterBaselineRatings(
            descriptor.letterId,
            storyId,
            descriptor.senderId,
            descriptor.receiverId,
          );
          if (ratings) {
            const creatorIsLetterSender = descriptor.senderId === creatorId;
            const creatorName = session?.creatorName ?? '';
            const joinerName = partnerName ?? '';
            letterPreloadState = composeLetterPreloadState({
              ratings,
              liveStoryData: toLiveStoryData(storyData),
              storyTitle: title,
              creatorIsLetterSender,
              creatorName,
              joinerName,
              creatorPositions: creatorPositionRecord,
              joinerPositions: joinerPositionRecord,
              ratingInitiatedBy: name,
              ratingInitiatedByIsCreator: isCreator,
            });
          }
        }
      } catch (err) {
        // Non-fatal: drop to positions-only write so the picker still works.
        console.error('[P827] Letter preload discovery failed — falling back to positions-only:', err);
      }
    }

    // P643: Atomic write — story data + ratingInitiatedBy in ONE updateLiveState call.
    // Two separate writes create a Realtime race: listener receives story data before
    // ratingInitiatedBy, causing the story card to render prematurely (Bug 3).
    if (letterPreloadState) {
      // P827: Full preload (positions + ratings + explain-back) in one write.
      // P643: single atomic event so listener never observes positions without phase.
      updateLiveState(letterPreloadState);
    } else {
      updateLiveState({
        selectedStoryId: storyId,
        selectedPointId: undefined,
        selectedContentTitle: title,
        selectedStoryData: storyData ? toLiveStoryData(storyData) : undefined,
        // P643/P646: Include rating initiation in same write to prevent race
        ratingInitiatedBy: name,
        ratingInitiatedByIsCreator: isCreator,
        // P792: Include preloaded positions to drive partner badge immediately
        livePositionsCreator: creatorPositionRecord,
        livePositionsJoiner: joinerPositionRecord,
      });
    }

    // P643: Story selection auto-starts the rating flow (no separate Speak click needed).
    // P827: Skip when the full letter preload already submitted both ratings — otherwise
    // isLocallyRating=true would trap the initiator on the rating drawer (Branch 3 of
    // getViewState) even though live_state already says checkerSubmitted/responderSubmitted=true.
    if (!letterPreloadState) {
      setLocalFlowType('check');
      setIsLocallyRating(true);
    }
  }, [name, partnerName, session?.code, session?.creatorName, session?.creatorProfileId, session?.joinerProfileId, updateLiveState, isCreator]);

  // P272: Clear selected story (both participants return to no-story idle state)
  // P827: Also reset all rating state fields so the next picker selection starts clean.
  // Without this reset, ratingPhase/checkerName residue from round N blocks preload on round N+1.
  const handleClearStory = useCallback(() => {
    updateLiveState({
      selectedStoryId: undefined,
      selectedPointId: undefined,
      selectedContentTitle: undefined,
      selectedStoryData: undefined,
      ratingPhase: 'idle',
      checkerName: '',
      checkerRating: undefined,
      responderRating: undefined,
      checkerSubmitted: false,
      responderSubmitted: false,
      ratingInitiatedBy: '',
      ratingInitiatedByIsCreator: false,
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
        // P562: Write to top-level per-participant key (not nested livePositions)
        const myKey = isCreator ? 'livePositionsCreator' : 'livePositionsJoiner';
        const myCurrentPositions = isCreator
          ? (confirmedLiveStateRef.current.livePositionsCreator ?? {})
          : (confirmedLiveStateRef.current.livePositionsJoiner ?? {});
        updateLiveState({
          [myKey]: { ...myCurrentPositions, [pointId]: null },
        });
      }, [name, updateLiveState, isCreator]),
    });

  // P275: Handle point position selection during a /live session.
  // Adding: writes to live_state + persists to point_positions for verified users.
  // Removing: shows confirmation dialog (warns about profile removal) then syncs both.
  // Unverified guests (is_verified=false) skip DB sync — RLS blocks it, expected per P275.
  const handlePositionSelectInLive = useCallback(
    (pointId: string, position: PositionType | null) => {
      if (!name) return;

      // P562: Use top-level per-participant keys to avoid JSONB shallow merge clobber.
      // Each user writes only their own key — partner's positions are never touched.
      const myKey = isCreator ? 'livePositionsCreator' : 'livePositionsJoiner';
      const myCurrentPositions = isCreator
        ? (confirmedLiveStateRef.current.livePositionsCreator ?? {})
        : (confirmedLiveStateRef.current.livePositionsJoiner ?? {});

      if (position === null) {
        if (user?.id) {
          // Verified user: show confirmation dialog; guard handles DB removal + live_state update
          liveGuardedRemovePosition(pointId);
        } else {
          // Unverified guest: no profile, remove from live_state directly
          updateLiveState({
            [myKey]: { ...myCurrentPositions, [pointId]: null },
          });
        }
        return;
      }

      // Setting a position — write to live_state for real-time sync (works for all participants)
      updateLiveState({
        [myKey]: { ...myCurrentPositions, [pointId]: position },
      });

      // Best-effort persistence to point_positions for verified users.
      // Unverified guests: RLS will silently reject this — expected per P275.
      if (user?.id) {
        pointsService.setPosition(pointId, user.id, position).catch(() => {
          // Silently ignored: expected failure for is_verified=false users
        });
      }
    },
    [name, updateLiveState, user?.id, liveGuardedRemovePosition, isCreator]
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
          .maybeSingle();
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
    async (rating: number) => {
      if (!name || !partnerName) return;

      if (import.meta.env.DEV) {
        const cs = confirmedLiveStateRef.current;
        // eslint-disable-next-line no-console -- gated by import.meta.env.DEV; dev-only diagnostic (P1200)
        console.log(
          `[RatingSubmit] ${new Date().toISOString()}`,
          `rating=${rating}`,
          `phase=${cs.ratingPhase}`,
          `checkerName=${cs.checkerName ?? '∅'}`,
          `checkerSubmitted=${cs.checkerSubmitted}`,
          `responderSubmitted=${cs.responderSubmitted}`,
          `inFlight=${updateInFlightRef.current}`,
          `isCreator=${isCreator}`,
        );
      }

      // Clear local rating state
      setIsLocallyRating(false);

      // Use ref to get current confirmed state (avoids stale closure)
      const currentState = confirmedLiveStateRef.current;

      // Determine role for tracking
      const isFirstSubmitter = !currentState.checkerName;
      const role = isFirstSubmitter
        ? (localFlowType === 'prove' ? 'responder' : 'checker')
        : (currentState.checkerIsCreator === isCreator ? 'checker' : 'responder');

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
          updates.checkerIsCreator = !isCreator; // Partner's role is opposite of mine
          updates.responderRating = rating;    // Prover's confidence rating
          updates.responderSubmitted = true;
        } else {
          // "Did you get it?" flow - first person becomes checker (speaker)
          updates.checkerName = name;
          updates.checkerIsCreator = isCreator;
          updates.checkerRating = rating;
          updates.checkerSubmitted = true;
        }
      } else {
        // Checker already exists - determine role using session position (not name)
        const isChecker = currentState.checkerIsCreator === isCreator;

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
            flow_type: localFlowType,
          });

          // Track perfect understanding on first round
          if (isPerfect) {
            trackLiveEvent('live_perfect_understanding', {
              session_code: session?.code,
              rounds_to_achieve: 0,
              initial_checker_rating: checkerRatingValue,
              initial_responder_rating: responderRatingValue,
              has_explain_backs: currentState.explainBackRatings.length > 0,
            });
            // P806: badge insertion moved to state-watcher useEffect.
          }
        }
      }

      updateLiveState(updates);
    },
    [name, partnerName, localFlowType, updateLiveState, session?.code, session?.id, trackLiveEvent, writeVerification, isCreator]
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
    // P892: A round already recorded (first-ack append) must not also log a skip
    const prevHistory = currentState.sessionHistory ?? [];
    const contentTitle = currentState.selectedContentTitle;
    const historyEntry = currentState.roundRecorded === true
      ? null
      : currentState.selectedStoryId
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
      roundRecorded: false, // P892: clear for next round
      ratingInitiatedBy: undefined, ratingInitiatedByIsCreator: undefined,
      skippedBy: name, skippedByIsCreator: isCreator,
      // Clear checker/responder
      checkerName: undefined,
      checkerIsCreator: undefined,
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
      selectedStoryData: undefined, // P525: Fix stale story data leak
      selectedPointId: undefined,
      selectedContentTitle: undefined,
      sessionHistory: historyEntry ? [...prevHistory, historyEntry] : prevHistory,
      // P592: Clear free mode state so skip from guided mode doesn't leak
      freePhase: undefined,
      freeSliderCreator: undefined,
      freeSliderJoiner: undefined,
      freeRounds: undefined,
      freeRerating: undefined,
    });
    // P272: Clear verification guard so new rounds can fire verification
    verificationFiredRef.current.clear();
  }, [name, isCreator, updateLiveState, session?.code, trackLiveEvent]);

  // Handle celebration complete - user clicked "Continue" on perfect rating celebration
  // P525: Uses boolean keys per-role instead of array to prevent race condition
  // Both users must acknowledge before state resets (prevents forceful exit for partner)
  const handleCelebrationComplete = useCallback(() => {
    const currentState = confirmedLiveStateRef.current;
    // P525: Determine role-based boolean key
    const myBooleanKey = isCreator ? 'celebrationAcknowledgedByCreator' : 'celebrationAcknowledgedByJoiner';
    const myAlreadyAcknowledged = currentState[myBooleanKey] === true;
    // Backward compat: also check old array
    const oldAcknowledged = currentState.celebrationAcknowledgedBy || [];
    if (myAlreadyAcknowledged || oldAcknowledged.includes(name)) {
      return; // Already acknowledged, ignore duplicate clicks
    }

    // Write my boolean key — JSONB || merge of independent keys never collides
    const myUpdate = { [myBooleanKey]: true } as Partial<LiveSessionState>;

    // P525: Check if both acknowledged using dual-read (backward compat)
    const afterMyWrite = { ...currentState, ...myUpdate };
    const bothDone = isBothAcknowledgedCompat(afterMyWrite, session?.creatorName ?? '', partnerName ?? '');

    if (bothDone) {
      // P128: Append to session history before clearing content
      // P892: Skip the append when the first ack (or exit flush) already recorded it
      const prevHistory = currentState.sessionHistory ?? [];
      const historyEntry = currentState.roundRecorded === true ? null : buildRoundHistoryEntry(currentState);

      // Both done - reset to idle state for a fresh start
      // Increment round counter for next round
      updateLiveState({
        roundRecorded: false,
        currentRound: (currentState.currentRound ?? 1) + 1,
        ratingPhase: 'idle',
        ratingInitiatedBy: undefined, ratingInitiatedByIsCreator: undefined,
        // Clear checker/responder
        checkerName: undefined,
        checkerIsCreator: undefined,
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
        speakerSawExplainBackDone: false,
        // P525: Clear both new boolean keys + old array for clean state
        celebrationAcknowledgedByCreator: false,
        celebrationAcknowledgedByJoiner: false,
        celebrationAcknowledgedBy: [],
        // Clear any pending role switch negotiation
        roleSwitchNegotiation: undefined,
        // Clear speaker clarification state
        clarificationPhase: undefined,
        // P128: Clear content selection and update history
        selectedStoryId: undefined,
        selectedStoryData: undefined,
        selectedPointId: undefined,
        selectedContentTitle: undefined,
        // P814: Clear badge state for next round (mirrors handleFreeDiscussAnother)
        badgePointEarned: false,
        badgeCount: 0,
        sessionHistory: historyEntry ? [...prevHistory, historyEntry] : prevHistory,
      });
      // P272: Clear verification guard for next round
      verificationFiredRef.current.clear();
    } else {
      // P892: First ack — record the completed round NOW. Waiting for the
      // partner's ack to persist meant an abandoned handshake lost the round.
      // Uses patch path (no explicit undefined values) so JSONB || merge works.
      if (currentState.roundRecorded !== true) {
        const prevHistory = currentState.sessionHistory ?? [];
        updateLiveState({
          ...myUpdate,
          sessionHistory: [...prevHistory, buildRoundHistoryEntry(currentState)],
          roundRecorded: true,
        });
      } else {
        updateLiveState(myUpdate);
      }
    }
  }, [name, partnerName, isCreator, session?.creatorName, updateLiveState, buildRoundHistoryEntry]);

  // P525 safety net: reactive useEffect catches simultaneous acknowledgment
  // When both users click Continue at the same time, handleCelebrationComplete may not see
  // the partner's boolean (stale ref). This effect watches the live state and triggers reset
  // when both booleans are true but the round hasn't been reset yet.
  const reactiveResetFiredRef = useRef(false);
  useEffect(() => {
    const bothAcknowledged = isBothAcknowledged(liveState);
    if (import.meta.env.DEV && bothAcknowledged && liveState.ratingPhase !== 'idle') {
      // eslint-disable-next-line no-console -- gated by import.meta.env.DEV; dev-only diagnostic (P1200)
      console.log(
        `[ReactiveReset] ${new Date().toISOString()}`,
        `bothAck=true phase=${liveState.ratingPhase} guard=${reactiveResetFiredRef.current}`,
        reactiveResetFiredRef.current ? '→ SKIPPED (guard)' : '→ FIRING RESET',
      );
    }
    if (bothAcknowledged && liveState.ratingPhase !== 'idle' && !reactiveResetFiredRef.current) {
      reactiveResetFiredRef.current = true;
      // Trigger the same reset as handleCelebrationComplete's bothDone branch
      // P892: Skip the append when the first ack (or exit flush) already recorded it
      const prevHistory = liveState.sessionHistory ?? [];
      const historyEntry = liveState.roundRecorded === true ? null : buildRoundHistoryEntry(liveState);

      updateLiveState({
        roundRecorded: false,
        currentRound: (liveState.currentRound ?? 1) + 1,
        ratingPhase: 'idle',
        ratingInitiatedBy: undefined, ratingInitiatedByIsCreator: undefined,
        checkerName: undefined,
        checkerIsCreator: undefined,
        checkerRating: undefined,
        responderRating: undefined,
        checkerSubmitted: false,
        responderSubmitted: false,
        proverName: undefined,
        explainBackRound: 0,
        explainBackRatings: [],
        explainBackDone: false,
        speakerSawExplainBackDone: false,
        celebrationAcknowledgedByCreator: false,
        celebrationAcknowledgedByJoiner: false,
        celebrationAcknowledgedBy: [],
        roleSwitchNegotiation: undefined,
        clarificationPhase: undefined,
        selectedStoryId: undefined,
        selectedStoryData: undefined,
        selectedPointId: undefined,
        selectedContentTitle: undefined,
        // P814: Clear badge state for next round (mirrors handleFreeDiscussAnother)
        badgePointEarned: false,
        badgeCount: 0,
        sessionHistory: historyEntry ? [...prevHistory, historyEntry] : prevHistory,
      });
      verificationFiredRef.current.clear();
    }
    // Reset the guard when round resets (ratingPhase goes back to idle)
    if (liveState.ratingPhase === 'idle') {
      reactiveResetFiredRef.current = false;
    }
  }, [liveState.celebrationAcknowledgedByCreator, liveState.celebrationAcknowledgedByJoiner, liveState.ratingPhase, liveState, name, partnerName, updateLiveState, isCreator, buildRoundHistoryEntry]);

  // P592: Reactive safety net for free mode success dual-ack
  // Same pattern as guided mode above, but triggers when freePhase === 'success' + both ack'd
  const freeReactiveResetFiredRef = useRef(false);
  useEffect(() => {
    const bothAcknowledged = isBothAcknowledged(liveState);
    if (bothAcknowledged && liveState.freePhase === 'success' && !freeReactiveResetFiredRef.current) {
      freeReactiveResetFiredRef.current = true;
      // P879: Record the completed free-mode round before clearing state
      // P892: Skip the append when the first ack (or exit flush) already recorded it
      const prevHistory = liveState.sessionHistory ?? [];
      const historyEntry = liveState.roundRecorded === true ? null : buildRoundHistoryEntry(liveState);
      updateLiveState({
        sessionHistory: historyEntry ? [...prevHistory, historyEntry] : prevHistory,
        roundRecorded: false,
        // P879: Increment round counter (mirrors guided reactive reset)
        currentRound: (liveState.currentRound ?? 1) + 1,
        freePhase: undefined,
        checkerName: undefined,
        checkerIsCreator: undefined,
        checkerSubmitted: false,
        responderSubmitted: false,
        checkerRating: undefined,
        responderRating: undefined,
        freeSliderCreator: undefined,
        freeSliderJoiner: undefined,
        freeRounds: undefined,
      freeRerating: undefined,
        ratingPhase: 'idle',
        ratingInitiatedBy: undefined, ratingInitiatedByIsCreator: undefined,
        explainBackDone: false,
        speakerSawExplainBackDone: false,
        explainBackRound: 0,
        explainBackRatings: [],
        celebrationAcknowledgedByCreator: false,
        celebrationAcknowledgedByJoiner: false,
        celebrationAcknowledgedBy: [],
        // P814: Clear badge state for next round (mirrors handleFreeDiscussAnother)
        badgePointEarned: false,
        badgeCount: 0,
        // P600: Clear content selection so idle screen shows fresh
        selectedStoryId: undefined,
        selectedStoryData: undefined,
        selectedPointId: undefined,
        selectedContentTitle: undefined,
      });
    }
    if (!liveState.freePhase) {
      freeReactiveResetFiredRef.current = false;
    }
  }, [liveState.celebrationAcknowledgedByCreator, liveState.celebrationAcknowledgedByJoiner, liveState.freePhase, liveState, updateLiveState, buildRoundHistoryEntry]);

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

    // P600: Both guided and free mode now go through speaker re-rating.
    // Free mode diverges in handleExplainBackRate (after speaker rates).
    // Unlock speaker's re-rating drawer:
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
    // P646: Add requestedByIsCreator for role-based identity (same-name fix)
    updateLiveState({
      roleSwitchNegotiation: {
        requestedBy: name,
        requestedByIsCreator: isCreator,
        state: 'pending',
      },
    });
  }, [name, isCreator, updateLiveState, session?.code, trackLiveEvent]);

  // Handle speaker asking listener to explain back first (negotiation step 1 → 2)
  const handleAskToExplainFirst = useCallback(() => {
    trackLiveEvent('live_role_switch_ask_explain', {
      session_code: session?.code,
    });

    const currentState = confirmedLiveStateRef.current;
    updateLiveState({
      roleSwitchNegotiation: {
        requestedBy: currentState.roleSwitchNegotiation?.requestedBy || '',
        requestedByIsCreator: currentState.roleSwitchNegotiation?.requestedByIsCreator,
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

  // P515: Handle listener cancelling their "Speak freely" negotiation request
  const handleCancelNegotiation = useCallback(() => {
    trackLiveEvent('live_role_switch_cancel', {
      session_code: session?.code,
    });

    updateLiveState({
      roleSwitchNegotiation: undefined,
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
        requestedByIsCreator: currentState.roleSwitchNegotiation?.requestedByIsCreator,
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
      checkerIsCreator: undefined,
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
    async (rating: number) => {
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
          has_explain_backs: true,
        });
      }

      // P806: badge insertion moved to state-watcher useEffect.

      // P600: Free mode divergence — after speaker re-rates, transition to sliders
      // (unless rating === 10, which triggers guided celebration flow)
      if (currentState.sessionMode !== 'guided' && !isPerfect) {
        const listenerConf = currentState.responderRating ?? 0;
        const speakerBel = currentState.checkerRating ?? 0;
        // P600: Only 1 freeRound (sealed-bid). Re-rating stored separately as freeRerating.
        const freeRounds = [
          { listenerConfidence: listenerConf, speakerBelief: speakerBel, label: '0' },
        ];
        const creatorIsChecker = currentState.checkerIsCreator;
        // Initialize sliders from the re-rated values
        const creatorSlider = creatorIsChecker ? rating : listenerConf;
        const joinerSlider = creatorIsChecker ? listenerConf : rating;

        updateLiveState({
          freePhase: 'unlocked',
          freeRounds,
          freeRerating: rating, // P600: speaker's updated belief after paraphrase
          freeSliderCreator: creatorSlider,
          freeSliderJoiner: joinerSlider,
          ratingPhase: 'idle',
          explainBackDone: false,
          speakerSawExplainBackDone: false,
          explainBackRound: 0,
          explainBackRatings: [],
          checkerSubmitted: false,
          responderSubmitted: false,
          checksCount: currentState.checksCount + 1,
          checksTotal: currentState.checksTotal + rating,
          clarificationPhase: undefined,
        });
        return;
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
      skippedBy: undefined, skippedByIsCreator: undefined,
    });
  }, [updateLiveState]);

  // ============================================================================
  // P37.2a: Consent Flow Handlers
  // ============================================================================

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
        pendingJoinRef.current = { code, joinName };
        setShowMicDialog(true);
        analytics.track('live_session_join_blocked', {
          session_code: code,
          reason: 'mic_permission_denied',
        });
        return;
      }

      // Step 2: Mic granted - now safe to join the session
      const joinedSession = await joinClaritySession(code, joinName, user?.id);
      if (!joinedSession) {
        setError('Session not found or already full');
        return;
      }

      // P921 Cause 1: A cold link/refresh to an ALREADY-ended session must show
      // the SessionEndedScreen ("This session has ended" + Go to Letters), not
      // route through join → live → PartnerLeftScreen. joinClaritySession returns
      // an ended row without writing joiner_name (see api.ts guard); detect it
      // here and short-circuit before transitioning to the live view.
      const joinedLiveState = joinedSession.liveState as Record<string, unknown> | null;
      if (joinedLiveState?.sessionEnded === true || joinedLiveState?.joinerEnded === true) {
        clearStoredSession();
        clearActiveSessionFromStorage();
        clearActiveSession();
        setSessionEndedOnLoad(true);
        return; // completeJoin's finally clears isLoading
      }

      // Reset all refs for clean state
      iAmLeavingRef.current = false;
      partnerLeftRef.current = false;
      sessionEndedRef.current = false;
      hasJoinerRef.current = false;
      lastJoinerNameRef.current = null;
      gracePeriodStartRef.current = null;
      pendingJoinRef.current = null;

      setSession(joinedSession);
      setIsCreator(false);
      // Save to localStorage for rejoin
      saveSessionToStorage(joinedSession.code, joinName, false);
      // P511: Persist active session to localStorage for banner on other pages
      setActiveSession(joinedSession.code, joinedSession.creatorName ?? null, 'joiner', !user ? joinName : null);

      analytics.track('live_session_joined', {
        session_code: joinedSession.code,
        join_method: isJoinViaLink ? 'link' : 'code',
      });

      // Step 3: Now transition to live view (mic is granted, session is joined)
      setView('live');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join session');
    } finally {
      setIsLoading(false);
    }
  };

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

  // P703: Bootstrap letter-sourced session — writes explain-back phase + baseline ratings to DB.
  // Called by the creator immediately after creating a letter-sourced session. The joiner
  // inherits the phase from DB when they join (subscription delivers it within ~200ms).
  const bootstrapLetterSourcedSession = useCallback(async (sess: ClaritySession) => {
    if (!sess.targetListenerId || !sess.sourceStoryId || !sess.sourceLetterId || !sess.creatorProfileId) {
      return;
    }
    // Idempotency guard: if session already has a phase > idle, skip DB write to avoid
    // overwriting in-progress state (e.g. creator page-refreshes mid-session)
    const existingPhase = (sess.liveState as { ratingPhase?: string } | undefined)?.ratingPhase;
    if (existingPhase && existingPhase !== 'idle') {
      return;
    }
    try {
      const [ratings, storyData] = await Promise.all([
        getLetterBaselineRatings(
          sess.sourceLetterId,
          sess.sourceStoryId,
          sess.creatorProfileId,
          sess.targetListenerId,
        ),
        storiesService.getStoryWithPoints(sess.sourceStoryId),
      ]);

      const pointIds = (storyData?.points ?? []).map(p => p.id);
      const [creatorPositions, joinerPositions] = pointIds.length > 0
        ? await Promise.all([
            pointsService.getMyPositionsForPoints(pointIds, sess.creatorProfileId),
            pointsService.getMyPositionsForPoints(pointIds, sess.targetListenerId),
          ])
        : [new Map<string, { position: PositionType }>(), new Map<string, { position: PositionType }>()];

      const storyTitle = storyData?.content.split('\n')[0].substring(0, 80) ?? '';

      // P827: When letter ratings are missing (sealed-bid RLS edge case for a
      // partially-completed delivery), the entry path keeps its historical
      // behavior — write the preload skeleton without rating values so the
      // session can recover via the normal rating flow. checkerSubmitted /
      // responderSubmitted are gated on ratings being present.
      let bootstrapState: LiveSessionState;
      if (storyData && ratings) {
        // Entry path: the session creator is always the letter sender (P703).
        // Hardcoded here so the entry behavior cannot drift if the composer
        // gains additional callers — see Decision 3.
        bootstrapState = composeLetterPreloadState({
          ratings,
          liveStoryData: toLiveStoryData(storyData),
          storyTitle,
          creatorIsLetterSender: true,
          creatorName: sess.creatorName,
          // Joiner name is unused when creatorIsLetterSender=true; supply a
          // placeholder so the composer stays pure.
          joinerName: '',
          creatorPositions: toPositionRecord(creatorPositions),
          joinerPositions: toPositionRecord(joinerPositions),
          ratingInitiatedBy: sess.creatorName,
          ratingInitiatedByIsCreator: true,
        });
      } else {
        bootstrapState = {
          ...DEFAULT_LIVE_STATE,
          ratingPhase: 'explain-back',
          checkerIsCreator: true,
          checkerSubmitted: false,
          responderSubmitted: false,
          checkerName: sess.creatorName,
          selectedStoryId: sess.sourceStoryId,
          selectedStoryData: storyData ? toLiveStoryData(storyData) : undefined,
          selectedContentTitle: storyTitle,
          ratingInitiatedBy: sess.creatorName,
          ratingInitiatedByIsCreator: true,
          livePositionsCreator: toPositionRecord(creatorPositions),
          livePositionsJoiner: toPositionRecord(joinerPositions),
        };
      }
      await updateClaritySessionLiveState(sess.id, bootstrapState);
      setLiveState(bootstrapState);
      confirmedLiveStateRef.current = bootstrapState;
    } catch (err) {
      console.error('[P703] Letter session bootstrap failed — session will start at idle:', err);
      // Non-fatal: both parties will go through the normal rating flow
    }
  }, []);

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
      gracePeriodStartRef.current = null;

      setSession(newSession);
      setIsCreator(true);
      setView('waiting');
      // HIGH #6: Save to localStorage for rejoin
      saveSessionToStorage(newSession.code, trimmedName, true);
      // P511: Persist active session to localStorage for banner on other pages
      setActiveSession(newSession.code, null, 'creator');

      // Track session creation
      analytics.track('live_session_created', {
        session_code: newSession.code,
      });

      // P703: Bootstrap letter-sourced session — await so ratingPhase is set
      // before both parties see the /live UI (prevents explain-back race condition).
      if (newSession.targetListenerId && newSession.sourceStoryId && newSession.sourceLetterId) {
        await bootstrapLetterSourcedSession(newSession);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setIsLoading(false);
    }
  };

  // P511 Task 10: Rejoin handler — restores the user into their active session
  const handleRejoin = async () => {
    if (!rejoinSession) return;
    setIsRejoining(true);
    try {
      const activeSession = await getActiveSessionByCode(rejoinSession.code);
      if (!activeSession) {
        // Session expired between showing prompt and clicking rejoin
        clearActiveSessionFromStorage();
        clearActiveSession();
        setRejoinSession(null);
        setIsRejoining(false);
        return;
      }

      if (rejoinSession.role === 'joiner') {
        // Re-set joiner_name on the session row (joiner may have been cleared)
        const guestName = rejoinSession.guestDisplayName;
        const joinName = user?.name || guestName || name.trim();
        if (!joinName) {
          setError('Unable to rejoin — name not found');
          setIsRejoining(false);
          return;
        }
        const joinedSession = await joinClaritySession(rejoinSession.code, joinName, user?.id);
        if (!joinedSession) {
          // joinClaritySession may fail if session is already full with a different joiner
          clearActiveSessionFromStorage();
          clearActiveSession();
          setRejoinSession(null);
          setIsRejoining(false);
          return;
        }
        setSession(joinedSession);
        setIsCreator(false);
        setName(joinName);
        saveSessionToStorage(joinedSession.code, joinName, false);
      } else {
        // Creator — restore session state and navigate to live/waiting view
        setSession(activeSession);
        setIsCreator(true);
        setName(activeSession.creatorName);
        saveSessionToStorage(activeSession.code, activeSession.creatorName, true);
      }

      // Reset refs for clean state
      iAmLeavingRef.current = false;
      partnerLeftRef.current = false;
      sessionEndedRef.current = false;
      hasJoinerRef.current = false;
      lastJoinerNameRef.current = null;
      gracePeriodStartRef.current = null;

      // Sync live state
      if (activeSession.liveState) {
        setLiveState({ ...DEFAULT_LIVE_STATE, ...activeSession.liveState } as LiveSessionState);
      }

      // Determine the right view
      // P511 Task 12 (P495 recording integration): pendingLiveTransition triggers
      // gateMicAndGoLive → mic re-acquisition → view='live' → recording start effect.
      // MediaStream was released by browser on page unload; getUserMedia() runs again here.
      // Gap in recording during disconnect is expected (Decision 4).
      const liveStateRecord = activeSession.liveState as Record<string, unknown> | null;
      const isSessionEnded = liveStateRecord?.sessionEnded === true || liveStateRecord?.joinerEnded === true;
      if (activeSession.joinerName && !isSessionEnded) {
        setPendingLiveTransition(true);
      } else if (rejoinSession.role === 'creator') {
        setView('waiting');
      }

      setRejoinSession(null);
      analytics.track('live_session_rejoined', {
        session_code: rejoinSession.code,
        role: rejoinSession.role,
      });
    } catch (err) {
      console.error('[Live] Failed to rejoin session:', err);
      setError(err instanceof Error ? err.message : 'Failed to rejoin session');
    } finally {
      setIsRejoining(false);
    }
  };

  // P511 Task 10: End session from rejoin prompt
  const handleEndFromRejoin = async () => {
    if (!rejoinSession) return;
    try {
      await terminate(rejoinSession.sessionId);
      clearStoredSession();
      clearActiveSession();
      setRejoinSession(null);
      analytics.track('live_session_ended_from_rejoin', {
        session_code: rejoinSession.code,
        role: rejoinSession.role,
      });
    } catch (err) {
      console.error('[Live] Failed to end session from rejoin prompt:', err);
      // P769-fix: DB write failed, but user's intent is unambiguous — dismiss
      // the prompt locally so the banner doesn't persist on other routes.
      clearActiveSession();
      clearStoredSession();
      setRejoinSession(null);
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
          gracePeriodStartRef.current = null;
          setSession(sessionInfo);
          setName(creatorName);
          setIsCreator(true);
          saveSessionToStorage(code, creatorName, true);
          setActiveSession(code, null, 'creator');
          // P703: Bootstrap letter-sourced session when creator arrives via direct URL
          if (sessionInfo.targetListenerId && sessionInfo.sourceStoryId && sessionInfo.sourceLetterId) {
            await bootstrapLetterSourcedSession(sessionInfo);
          }
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
  const handleCancelWaiting = async () => {
    // P106: Track session abandoned before partner joined
    if (session) {
      analytics.track('live_session_abandoned', {
        session_code: session.code,
        waited_seconds: Math.floor((Date.now() - new Date(session.created_at).getTime()) / 1000),
      });
      // P703: Close the letter-sourced invite so the author's Start button re-enables
      if (session.targetListenerId) {
        try {
          await cancelLiveInvite(session.id);
        } catch (err) {
          console.error('[P703] cancelLiveInvite failed — invite may still be open:', err);
        }
      }
    }
    clearStoredSession();
    clearActiveSession();
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
    gracePeriodStartRef.current = null;
    autoJoinFiredRef.current = false;
    // P754: prefer returnTo (e.g. letter inbox) over /live; always escape join-via-link URL
    // so isJoinViaLink becomes false and the start view doesn't re-show the spinner.
    if (returnTo) {
      navigate(returnTo, { replace: true });
    } else if (isJoinViaLink) {
      navigate('/live', { replace: true });
    }
  };

  // P28.1: Stop recording and upload final chunk + events
  // In chunked mode, audio is already uploaded in 30s intervals
  // This function stops recording, drains the upload queue, and uploads events.json
  const stopAndUploadRecording = useCallback(async () => {
    if (!session || !eventsCollectorRef.current.isStarted()) {
      return;
    }

    try {
      // Stop recording - this triggers final chunk via onChunkProduced
      await stopRecording();

      // P566: Drain the upload queue (wait for all chunks to finish uploading)
      const queue = uploadQueueRef.current;
      if (queue) {
        setUploadProgress({ pending: queue.getPendingCount(), total: queue.getTotalCount(), status: 'uploading', state: queue.getState() });

        // Subscribe to progress updates for the drain phase
        const originalOnProgress = queue.onProgress;
        queue.onProgress = (progress) => {
          originalOnProgress?.(progress);
          setUploadProgress({
            pending: progress.total - progress.uploaded,
            total: progress.total,
            status: 'uploading',
            state: queue.getState(),
          });
        };

        try {
          // Wait up to 5 minutes for all chunks to upload
          await Promise.race([
            queue.drain(),
            new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Drain timeout')), 5 * 60 * 1000)),
          ]);

          const durationMs = Date.now() - recordingStartTimeRef.current;
          await recordChunkUploadComplete(session.code, name, queue.getTotalCount(), durationMs);
          setUploadProgress({ pending: 0, total: queue.getTotalCount(), status: 'complete' });
        } catch (err) {
          console.error('[P566] Queue drain failed or timed out:', err);
          setUploadProgress({ pending: queue.getPendingCount(), total: queue.getTotalCount(), status: 'failed' });
        }

        queue.onProgress = originalOnProgress;
      }

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

      // Use uploadSessionRecording with an empty blob to just upload events
      // The function handles this gracefully and uploads events.json
      const emptyBlob = new Blob([], { type: 'audio/webm' });
      await uploadSessionRecording(session.code, name, emptyBlob, events, metadata);
    } catch (err) {
      console.error('[P28.1] Failed to stop/upload recording:', err);
      // Don't throw - recording failure shouldn't block session exit
    }

    // P28.2: Unregister ML collector so events outside session aren't captured
    analytics.unregisterMLCollector();
    eventsCollectorRef.current.reset();
    sessionCodeForChunks.current = null;
    userNameForChunks.current = null;
    sessionForChunks.current = null;
    userForChunks.current = null;
  }, [session, name, stopRecording]);

  // Actually exit meeting (P511: no confirmation dialog — session can be resumed via heartbeat)
  const confirmExitMeeting = useCallback(async () => {
    // P512: Prevent double-click and show loading state
    if (isExiting) return;
    setIsExiting(true);

    // Mark that I am leaving (prevents polling from detecting my own departure)
    iAmLeavingRef.current = true;

    // P892: Flush a completed-but-unrecorded round before ending the session.
    // A check cycle that reached the celebration or free-mode success must not
    // be lost just because neither party clicked Continue before exiting.
    // Guided predicate mirrors live-mode-view's `reachedPerfect` exactly
    // (~2566): the LATEST checker rating — last explain-back rating when the
    // correction loop ran, initial checkerRating otherwise — is 10. After a
    // round reset both sources are cleared, so this never matches stale state.
    const exitState = confirmedLiveStateRef.current;
    const latestCheckerRating = (exitState.explainBackRatings?.length ?? 0) > 0
      ? exitState.explainBackRatings[exitState.explainBackRatings.length - 1]
      : exitState.checkerRating;
    const guidedRoundComplete = latestCheckerRating === 10;
    const freeRoundComplete = exitState.freePhase === 'success';
    if ((guidedRoundComplete || freeRoundComplete) && exitState.roundRecorded !== true) {
      if (!session) {
        // updateLiveState would silently no-op — surface the lost flush instead
        console.warn('[P892] Exit flush skipped — session is null; completed round not recorded');
      } else {
        const prevHistory = exitState.sessionHistory ?? [];
        await updateLiveState({
          sessionHistory: [...prevHistory, buildRoundHistoryEntry(exitState)],
          roundRecorded: true,
        });
      }
    }

    // P769-fix: Clear banner-facing state BEFORE any await. If the user navigates
    // away during the 5s upload wait, ActiveSessionBanner must not show
    // "Return to Session" on the new route.
    // clearActiveSession() clears cp_active_session (localStorage, read by
    // checkActiveSession on /live remount) and activeSessionCode (React context,
    // read by ActiveSessionBanner).
    // clearStoredSession() clears tab-scoped sessionStorage keys so a mid-upload
    // refresh doesn't rehydrate the session.
    clearStoredSession();
    clearActiveSession();

    // P921 Cause 3: Notify the partner BEFORE the upload await, with a
    // nav-surviving write. live_state.sessionEnded (set by the creator's
    // complete_clarity_session RPC) is the ONLY signal the partner receives that
    // the session is over. Previously this was sequenced AFTER the 5s upload race
    // + the transcription await, so a navigation/close during that window aborted
    // it and the partner was never notified. We now (a) fire it first, and (b) use
    // a `keepalive` fetch so an IMMEDIATE full-page navigation can't abort the
    // in-flight request. Local cleanup (clearStoredSession + clearActiveSession)
    // already ran above. P769 invariant preserved: creator → complete_clarity_session
    // (sets sessionEnded); joiner → clearSessionJoiner + cancelLiveInvite (the
    // creator's session continues).
    if (session) {
      try {
        if (isCreator) {
          // P921: keepalive variant survives an immediate post-click navigation;
          // token passed synchronously (no getSession await before the fetch)
          await completeClaritySessionKeepalive(session.id, accessTokenRef.current).catch((err) => {
            console.error('[Live] sessionEnded write failed on creator exit:', err);
          });
        } else {
          // Joiner leaving = clear their name so creator knows
          await clearSessionJoiner(session.id).catch((err) => {
            console.error('[Live] clearSessionJoiner failed on joiner exit:', err);
          });
          // P769: cancelLiveInvite (not completeClaritySession) — creator's session continues
          if (session.targetListenerId) {
            await cancelLiveInvite(session.id).catch((err) => {
              console.error('[P769] cancelLiveInvite failed on joiner exit:', err);
            });
          }
        }
      } catch (err) {
        console.error('[Live] Error updating session on exit:', err);
        // Continue with local cleanup even if DB update fails
      }
    }

    // P512: Stop recording with 5s timeout — exit must not be blocked by upload
    await Promise.race([
      stopAndUploadRecording(),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);

    // P495: Trigger transcription job — must be outside stopAndUploadRecording
    // because that function early-returns when eventsCollector hasn't started
    if (session && !session.isPrivate && session.id && session.code) {
      try {
        await createTranscriptionJob(session.code, session.id);
      } catch (err) {
        console.error('[P495] Failed to create transcription job:', err);
      }
    }

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
        session_duration_seconds: Math.round((Date.now() - sessionStartTimestampRef.current) / 1000),
        checks_completed_so_far: checksCompleted,
        round_number: (liveState.sessionHistory ?? []).length,
      });

      // Track session completion separately for funnel analysis
      if (hadMeaningfulEngagement) {
        analytics.track('live_session_completed', {
          session_code: session.code,
          checks_completed: checksCompleted,
          is_creator: isCreator,
          session_duration_seconds: Math.round((Date.now() - sessionStartTimestampRef.current) / 1000),
        });
      }

      // P921 Cause 3: partner notification (terminate / clearSessionJoiner +
      // cancelLiveInvite) now runs ABOVE, before the upload await — so an
      // immediate post-click navigation can't abort the sessionEnded write.
    }

    // P406: Close practice room if session came from an event
    if (isFromEvent && session) {
      eventsService.closePracticeRoomBySessionId(session.id).catch((err) => {
        console.error('[Live] Failed to close practice room:', err);
      });
    }

    // P583: Show session-end screen instead of immediate redirect.
    // Note: clearStoredSession() + clearActiveSession() already ran pre-await
    // (P769-fix) and cover every clarity_live_* key the app writes (the 4
    // STORAGE_KEYS), so the creator-exit sessionEnded write (P921) is DB-only.
    sessionEndedRef.current = true;
    setSessionEnded(true);
    setIsExiting(false);
  }, [session, liveState.checksCount, liveState.sessionHistory, isCreator, isFromEvent, stopAndUploadRecording, clearActiveSession, isExiting, updateLiveState, buildRoundHistoryEntry]);

  // P511: Exit directly — no confirmation dialog (session can be resumed via heartbeat)
  const handleExitMeeting = useCallback(() => {
    confirmExitMeeting();
  }, [confirmExitMeeting]);

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
    clearActiveSession();
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
    gracePeriodStartRef.current = null;
    setGracePeriodStart(null);
    navigate(returnTo ?? '/live', { replace: true });
  }, [session, isFromEvent, returnTo, navigate, stopAndUploadRecording, clearActiveSession]);

  // P40: Handle mic permission dialog retry
  // If we have pending join info, complete the join after mic is granted
  const handleMicRetry = useCallback(async () => {
    const hasPermission = await requestMicPermission();
    if (hasPermission) {
      setShowMicDialog(false);

      // If we have pending join info (from failed join attempt), complete the join
      const pendingJoin = pendingJoinRef.current;
      if (pendingJoin?.joinName) {
        pendingJoinRef.current = null;
        // Complete the join now that mic is granted
        // Since completeJoin checks mic first, and we just granted it, this will succeed
        const joinedSession = await joinClaritySession(pendingJoin.code, pendingJoin.joinName, user?.id);
        // P921 Cause 1: same ended-session guard as completeJoin — if the session
        // ended while the mic dialog was open, route to SessionEndedScreen instead
        // of rejoining a dead room and landing on PartnerLeftScreen.
        const retryLiveState = joinedSession?.liveState as Record<string, unknown> | null;
        if (joinedSession && (retryLiveState?.sessionEnded === true || retryLiveState?.joinerEnded === true)) {
          clearStoredSession();
          clearActiveSessionFromStorage();
          clearActiveSession();
          setSessionEndedOnLoad(true);
        } else if (joinedSession) {
          // Reset refs and set session
          iAmLeavingRef.current = false;
          partnerLeftRef.current = false;
          sessionEndedRef.current = false;
          hasJoinerRef.current = false;
          lastJoinerNameRef.current = null;
          gracePeriodStartRef.current = null;

          setSession(joinedSession);
          setIsCreator(false);
          saveSessionToStorage(joinedSession.code, pendingJoin.joinName, false);
          // P511: Persist active session to localStorage for banner on other pages
          setActiveSession(joinedSession.code, joinedSession.creatorName ?? null, 'joiner', !user ? pendingJoin.joinName : null);

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
  }, [requestMicPermission, setActiveSession, user, clearActiveSession]);

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
      setView('live');
      return true;
    }

    // If already granted from a previous check, go straight to live
    if (micStatus === 'granted') {
      setView('live');
      return true;
    }

    // Request permission before allowing transition
    const hasPermission = await requestMicPermission();

    if (hasPermission) {
      setView('live');
      return true;
    } else {
      setShowMicDialog(true);
      return false;
    }
  }, [isPrivate, micStatus, requestMicPermission]);

  // B48: Effect to handle pending live transitions (from session restoration, subscription, polling)
  // This decouples the async mic permission check from synchronous state updates
  useEffect(() => {
    if (pendingLiveTransition) {
      gateMicAndGoLive().finally(() => {
        setPendingLiveTransition(false);
      });
    }
  }, [pendingLiveTransition, gateMicAndGoLive]);

  // P511 Task 6: Grace period expired — transition to final partner-left state
  // P511 Task 12 (P495 recording): setPartnerLeft(true) triggers the P28.2 auto-stop
  // effect below, which calls stopAndUploadRecording() to finalize with existing chunks.
  const handleGracePeriodExpired = useCallback(() => {
    // 5-second post-expiry delay before auto-transitioning
    setTimeout(() => {
      if (!gracePeriodStartRef.current) return; // Already cancelled (partner returned)
      partnerLeftRef.current = true;
      setPartnerLeft(true);
      setGracePeriodStart(null);
      gracePeriodStartRef.current = null;
      analytics.track('live_session_partner_left', {
        session_code: sessionCodeRef.current,
        left_by: 'joiner',
        exit_reason: 'grace_period_expired',
        checks_completed_so_far: confirmedLiveStateRef.current.checksCount,
      });
    }, 5000);
  }, []);

  // P28.2: Auto-stop recording when partner leaves (prevents orphan recordings)
  useEffect(() => {
    if ((partnerLeft || sessionEnded) && isRecording) {
      stopAndUploadRecording();
    }
  }, [partnerLeft, sessionEnded, isRecording, stopAndUploadRecording]);

  // P511 Task 6: Show reconnecting countdown during grace period (before final departure)
  // Grace period only applies to joiner departure; sessionEnded (creator clicked End) is immediate.
  if (gracePeriodStart && !sessionEnded && !partnerLeft) {
    return (
      <div className="flex flex-col min-h-[calc(100vh-9rem)] lg:min-h-[calc(100vh-5rem)]">
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-md">
            <ReconnectingCountdown
              partnerName={departedPartnerName ?? 'Partner'}
              startTime={gracePeriodStart}
              gracePeriodSeconds={SESSION_GRACE_PERIOD_SECONDS}
              onExpired={handleGracePeriodExpired}
              sessionCode={session?.code}
            />
          </div>
        </div>
      </div>
    );
  }

  // Show partner left screen if partner departed
  if (sessionEnded || partnerLeft) {
    // P584: Count completed (non-skipped) rounds for transcript messaging
    const realRounds = (liveState.sessionHistory ?? []).filter(r => !r.skipped).length;
    // Debug: ?debugRounds=N simulates completed rounds on localhost
    const debugRounds = !import.meta.env.PROD ? parseInt(new URLSearchParams(window.location.search).get('debugRounds') ?? '', 10) : NaN;
    const completedRounds = !isNaN(debugRounds) ? debugRounds : realRounds;

    return (
      <div className="flex flex-col min-h-[calc(100vh-9rem)] lg:min-h-[calc(100vh-5rem)]">
        <div className="flex-1 flex items-center justify-center">
          <PartnerLeftScreen
            partnerName={departedPartnerName}
            sessionEnded={sessionEnded}
            onStartNew={handleStartNewAfterPartnerLeft}
            isGuest={!user}
            uploadProgress={uploadProgress}
            isCreator={isCreator}
            completedRounds={completedRounds}
          />
        </div>
        {/* P584: Navigation guard dialog — shown when user tries to navigate during upload */}
        <Dialog open={showUploadNavGuard} onOpenChange={setShowUploadNavGuard}>
          <DialogContent
            hideCloseButton
            className="max-w-sm"
            onPointerDownOutside={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle className="sr-only">Upload in progress</DialogTitle>
              <DialogDescription className="text-base text-foreground">
                Audio is still uploading. Leaving may lose your recording.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <Button
                className="bg-blue-500 hover:bg-blue-600 text-white w-full"
                onClick={() => setShowUploadNavGuard(false)}
              >
                Stay on this page
              </Button>
              <button
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => {
                  // Remove popstate guard before navigating
                  if (uploadNavGuardRef.current) {
                    window.removeEventListener('popstate', uploadNavGuardRef.current, true);
                    uploadNavGuardRef.current = null;
                  }
                  setShowUploadNavGuard(false);
                  navigate('/live', { replace: true });
                }}
              >
                Leave anyway
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Show loading while restoring session
  if (isRestoring) {
    return (
      <div className="flex flex-col min-h-[calc(100vh-9rem)] lg:min-h-[calc(100vh-5rem)]">
        <div className="flex-1 flex items-center justify-center">
          <ClarityLoader size="lg" />
        </div>
      </div>
    );
  }

  // P769 / P921: Cold-start or cold-link to an already-ended session — show the
  // explicit ended screen regardless of view. This must precede the `view ===
  // 'start'` block: on the join-via-link path that block returns the join form
  // (isJoinViaLink branch) before reaching the inner rejoin/ended render.
  if (sessionEndedOnLoad) {
    return (
      <div className="flex flex-col min-h-[calc(100vh-9rem)] lg:min-h-[calc(100vh-5rem)]">
        <div className="flex-1 container mx-auto px-4 flex flex-col justify-center">
          <SessionEndedScreen />
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
        <div className="flex flex-col min-h-[calc(100vh-9rem)] lg:min-h-[calc(100vh-5rem)]">
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
              /* P396: Guest join form — name only, no email collected. Presentation
                 lives in the shared GuestOrAccountJoin (P1114 extraction); this page
                 still owns validation, submit, and consent flow. */
              <div className="space-y-6">
                <GuestOrAccountJoin
                  name={name}
                  onNameChange={setName}
                  onGuestSubmit={handleJoin}
                  submitting={isLoading || consentLoading}
                  submitDisabled={!canJoinViaLink}
                  error={error}
                  googleContext="live-join"
                  googleSource="login"
                  redirect={sessionRedirectUrl}
                  loginHref={`/login?redirect=${encodeURIComponent(sessionRedirectUrl)}`}
                />

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
        <div className="flex flex-col min-h-[calc(100vh-9rem)] lg:min-h-[calc(100vh-5rem)]">
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">
              {isLoading ? 'Creating session...' : 'Loading...'}
            </div>
          </div>
        </div>
      );
    }

    // P511 Task 10: Show rejoin prompt if active session detected in localStorage
    // (P921: sessionEndedOnLoad is handled by the top-level gate above.)
    if (isCheckingRejoin || rejoinSession) {
      return (
        <div className="flex flex-col min-h-[calc(100vh-9rem)] lg:min-h-[calc(100vh-5rem)]">
          <div className="flex-1 container mx-auto px-4 flex flex-col justify-center">
            {isCheckingRejoin ? (
              <div className="flex items-center justify-center">
                <div className="animate-pulse text-muted-foreground">Checking session...</div>
              </div>
            ) : rejoinSession ? (
              <RejoinPrompt
                sessionCode={rejoinSession.code}
                partnerName={rejoinSession.partnerName}
                guestDisplayName={rejoinSession.guestDisplayName}
                onRejoin={handleRejoin}
                onEndSession={handleEndFromRejoin}
                isRejoining={isRejoining}
              />
            ) : null}
            {error && <p className="text-sm text-red-600 text-center mt-4">{error}</p>}
          </div>
        </div>
      );
    }

    // P396: Check if guest can proceed — name-only requirement
    const guestCanProceed = isLoggedIn || !validateName(name);

    return (
      <div className="flex flex-col min-h-[calc(100vh-9rem)] lg:min-h-[calc(100vh-5rem)]">
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
                        className={`flex items-center gap-3 w-full min-h-11 px-3 py-2 rounded-lg border text-left transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
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
      <div className="flex flex-col min-h-[calc(100vh-9rem)] lg:min-h-[calc(100vh-5rem)]">
        <div className="flex-1 container mx-auto px-4 max-w-md flex flex-col justify-center">
          <div className="text-center space-y-6">
            {isFromEvent && partnerNameFromUrl ? (
              <>
                <h2 className="text-2xl font-semibold">{waitingMessage}</h2>
                <p className="text-muted-foreground">
                  They can join by:
                </p>
              </>
            ) : session.targetListenerId ? (
              <h2 className="text-2xl font-semibold">Waiting for {listenerDisplayName ?? 'listener'}...</h2>
            ) : (
              <>
                <h2 className="text-2xl font-semibold">Invite Your Partner</h2>
                <p className="text-muted-foreground">
                  Share this link to start your clarity session:
                </p>
              </>
            )}

            {/* P703: Letter-sourced — show invite status instead of share link */}
            {session.targetListenerId ? (
              <div
                data-testid="invite-status-panel"
                className="flex items-center justify-center p-3 bg-muted rounded-lg"
              >
                <span className="text-sm text-muted-foreground">
                  Invite sent to {listenerDisplayName ?? 'listener'}
                </span>
              </div>
            ) : (
              /* Link row with copy/share */
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
            )}

            {!session.targetListenerId && (
              <>
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
              </>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleCancelWaiting()}
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
    // P703 defense-in-depth: letter-sourced session participants only (belt-and-braces for RLS)
    const isLetterSourced = !!session.targetListenerId;
    if (isLetterSourced && user?.id &&
        user.id !== session.creatorProfileId &&
        user.id !== session.targetListenerId) {
      return null;
    }

    return (
      <div className="flex flex-col h-screen overflow-hidden">
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
          onCancelLocalRating={() => {
            setIsLocallyRating(false);
            setLocalFlowType('check');
            // P643 Layer 4: Cancel = full undo — clear ALL fields from the atomic write.
            // Missing story fields left dirty state (story card visible, not clean idle).
            updateLiveState({
              ratingInitiatedBy: undefined,
              ratingInitiatedByIsCreator: undefined,
              selectedStoryId: undefined,
              selectedStoryData: undefined,
              selectedPointId: undefined,
              selectedContentTitle: undefined,
            });
          }}
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
          onCancelNegotiation={handleCancelNegotiation}
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
          partnerAvatarUrl={partnerProfile?.avatarUrl ?? undefined}
          partnerAvatarColor={partnerProfile?.avatarColor}
          partnerHasPledged={partnerProfile?.hasPledged ?? false}
          isCreator={isCreator}
          uploadHealth={uploadHealth}
          onSessionModeChange={handleSessionModeChange}
          onFreeSliderChange={handleFreeSliderChange}
          onFreeSpeakFreely={handleFreeSpeakFreely}
          onFreeRoundComplete={handleFreeRoundComplete}
          onFreeDiscussAnother={handleFreeDiscussAnother}
          freeStoryTitle={liveState.selectedContentTitle}
          isCertifier={isCertifier}
        />

        {/* Remove position confirmation dialog */}
        <RemovePositionDialog {...liveRemoveDialogProps} />

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
