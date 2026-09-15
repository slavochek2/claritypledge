/**
 * @file room-capture-context.tsx
 * @description P1307 Architecture Decision 7 — the ONE owner of room transcription capture.
 *
 * Mounted once in App.tsx, above <Routes>, inside the auth provider and the router (it needs
 * both) and inside the Sentry boundary (a crash unmounts it, and capture stops). Not
 * LiveSessionProvider or ClarityLandingLayout: both are instantiated per route element, so a
 * route change tears them down — which is exactly how "leaving the transcribe page ended your
 * contribution" happened.
 *
 * What it owns, and the spec line each piece answers to:
 *   - The microphone stream, the 30 s archive recorder and the 13 s slice recorder. The mic is
 *     requested only after the join RPC returns a member row with consent_given_at
 *     (Invariant: nothing is captured before consent is recorded on the server).
 *   - The hard stop: the first 410 (or 403) from either the slice path or the archive path,
 *     or this person's own 3-hour cap, releases the microphone on the client (Invariant:
 *     capture stops at the cap and at room end, on the client).
 *   - Any auth change — sign-out, a different user id — stops capture immediately.
 *   - One capture per person per browser: a Web Lock per room. A second tab observes (shows
 *     the bar with Open / End) and does not capture.
 *   - Pause/resume (D3, D13): paused on /live, on immersive letter screens and while an
 *     explain-back recording runs; resumed when none of those hold AND no /live session is
 *     still active. While paused nothing is sent or archived; a 2-minute heartbeat tells the
 *     room-end sweep this person is paused, not gone. The stream is HELD while paused
 *     (Decision 8, T3 — flip inside pauseMedia/resumeMedia only).
 *   - The stall counter (3 consecutive failed/dropped slices) and the "…" speaking cue, which
 *     is a realtime broadcast and never a row.
 *
 * No client ends a room for anyone else: End calls end_transcribe_room_capture for THIS
 * person only. The pure state machine, predicates and lock live in room-capture-core.ts.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth';
import { supabase } from '@/lib/supabase';
import {
  createRoom,
  joinRoom,
  endMyCapture as endMyCaptureRpc,
  getMyCaptureStatus,
  prewarmSlicePath,
  reserveRoomChunkNumber,
  sendAudioSlice,
  touchRoomCapture,
} from '@/app/data/transcribe-service';
import { uploadRoomAudioChunk } from '@/app/data/api';
import { createSerialSender, createSliceRecorder, type SliceRecorder } from '@/lib/audio/slice-recorder';
import { isImmersiveLetterRoute } from '@/app/layouts/immersive-letter-route';
import {
  CAPTURE_CAP_MINUTES,
  INITIAL_CAPTURE_STATE,
  LIVE_PHASES,
  PAUSED_HEARTBEAT_INTERVAL_MS,
  STALL_AFTER_CONSECUTIVE_FAILURES,
  acquireCaptureLock,
  captureReducer,
  hasActiveLiveSession,
  shouldPauseForLocation,
  type CaptureLock,
  type CapturePhase,
} from './room-capture-core';

/* eslint-disable react-refresh/only-export-components -- the pure core is re-exported so callers
   and tests have one import path for capture */
export {
  CAPTURE_CAP_MINUTES,
  INITIAL_CAPTURE_STATE,
  PAUSED_HEARTBEAT_INTERVAL_MS,
  acquireCaptureLock,
  captureReducer,
  hasActiveLiveSession,
  shouldPauseForLocation,
} from './room-capture-core';
export type { CaptureAction, CaptureLock, CapturePhase, CaptureState } from './room-capture-core';
/* eslint-enable react-refresh/only-export-components */

// ─── Constants ───────────────────────────────────────────────────────────────

/** The archive recorder's flush cadence — one chunk_NNN.webm per interval. */
const CHUNK_INTERVAL_MS = 30_000;
/** Failed archive uploads are retried from a bounded queue, never dropped silently. */
const UPLOAD_MAX_ATTEMPTS = 3;
const UPLOAD_QUEUE_LIMIT = 10;
/** The running capture, per browser, so a reload re-attaches and a second tab observes. */
const CAPTURE_STORAGE_KEY = 'cp_room_capture';
/** Speaking cue: input level above this within the last SPEAKING_HOLD_MS reads as speaking. */
const SPEAKING_RMS_THRESHOLD = 0.02;
const SPEAKING_HOLD_MS = 1_500;
/** A broadcast "speaking" state that is not refreshed expires, so a closed tab's "…" clears. */
const SPEAKING_EXPIRY_MS = 4_000;
/** How often an observing tab re-tries the lock, and a paused capture re-checks /live. */
const OBSERVE_RETRY_MS = 15_000;
const PAUSE_RECHECK_MS = 5_000;

// ─── Persisted running capture ───────────────────────────────────────────────

interface StoredCapture {
  userId: string;
  roomId: string;
  roomCode: string;
  memberId: string;
  eventId: string | null;
  joinedAt: string;
  displayName: string;
}

function readStoredCapture(): StoredCapture | null {
  try {
    const raw = localStorage.getItem(CAPTURE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCapture;
    return parsed.userId && parsed.roomId && parsed.memberId && parsed.roomCode ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredCapture(record: StoredCapture): void {
  try {
    localStorage.setItem(CAPTURE_STORAGE_KEY, JSON.stringify(record));
  } catch { /* private browsing — reload resume is lost, capture itself is not */ }
}

function clearStoredCapture(): void {
  try {
    localStorage.removeItem(CAPTURE_STORAGE_KEY);
  } catch { /* ignore */ }
}

function isHardStopError(err: unknown): boolean {
  // transcribe-slice: "transcribe-slice 410: …"; gcs-signed-url via api.ts:
  // "Failed to get signed URL: 410 …". A 403 means this person is no longer a consented member.
  const message = err instanceof Error ? err.message : String(err);
  return /(?:transcribe-slice|signed URL:) (?:403|410)\b/.test(message);
}

// ─── Context ─────────────────────────────────────────────────────────────────

export interface StartCaptureOptions {
  eventId: string | null;
  displayName: string;
  /** Join THIS room (a /transcribe/:code link) rather than the event's or the shared room. */
  room?: { id: string; code: string; eventId: string | null };
}

/**
 * What startCapture did. A person can be JOINED without capture having STARTED: the join RPC
 * recorded consent, then the microphone could not be opened (denied, absent, busy). Nothing
 * is captured in that case, the server records the end, and the caller decides what to show —
 * the ready screen shows its could-not-start message, the room page still shows the room.
 */
export interface CaptureStartResult {
  started: boolean;
  /** Set when the person joined, whether or not capture started. */
  room?: { id: string; code: string; eventId: string | null };
  reason?: 'join' | 'microphone';
}

export interface RoomCaptureContextValue {
  phase: CapturePhase;
  roomId: string | null;
  roomCode: string | null;
  eventId: string | null;
  memberId: string | null;
  /** True when the bar should be on screen for this person on the current route. */
  barVisible: boolean;
  /** Joins (switch on + Continue) and starts capture. See CaptureStartResult. */
  startCapture: (options: StartCaptureOptions) => Promise<CaptureStartResult>;
  /** Ends THIS person's capture. Never the room. */
  endMyCapture: (roomId: string) => Promise<void>;
  open: () => void;
  /** Explain-back and any future microphone user: pause room capture while held. */
  holdPause: (reason: string) => () => void;
  isCapturingForEvent: (eventId: string) => boolean;
  speakingMemberIds: ReadonlySet<string>;
  /** In-flow bar slots (the layout, the room page). With none mounted, App renders a fallback. */
  registerBarSlot: () => () => void;
  barSlotCount: number;
}

const noop = () => {};

const RoomCaptureContext = createContext<RoomCaptureContextValue>({
  phase: 'idle',
  roomId: null,
  roomCode: null,
  eventId: null,
  memberId: null,
  barVisible: false,
  startCapture: () => Promise.resolve({ started: false, reason: 'join' }),
  endMyCapture: () => Promise.resolve(),
  open: noop,
  holdPause: () => noop,
  isCapturingForEvent: () => false,
  speakingMemberIds: new Set(),
  registerBarSlot: () => noop,
  barSlotCount: 0,
});

// eslint-disable-next-line react-refresh/only-export-components
export function useRoomCapture(): RoomCaptureContextValue {
  return useContext(RoomCaptureContext);
}

interface UploadJob {
  blob: Blob;
  isLast: boolean;
  attempts: number;
  /** The capture this chunk belongs to, bound when it is queued. End clears storedRef before
   *  the recorder's asynchronous onstop delivers the tail, so reading storedRef at upload time
   *  dropped the last chunk — and a stale job could upload under the NEXT capture's record. */
  record: StoredCapture;
  /** Reserved once, on the first attempt, and reused by every retry. Reserving per attempt
   *  (the first version) turned one transient upload failure into a permanent gap in the chunk
   *  sequence, which the whole-recording pass reads as missing audio (external review). */
  chunkNumber?: number;
}

/** How long End waits for the final archive chunk to upload before telling the server the
 *  capture ended. gcs-signed-url refuses uploads once capture_ended_at is set, so an end RPC
 *  sent first made the tail — and any queued chunks — undeliverable (external review). */
const END_UPLOAD_GRACE_MS = 10_000;

interface MediaHandles {
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  chunkParts: Blob[];
  chunkTimer: ReturnType<typeof setInterval> | null;
  slices: SliceRecorder | null;
  uploadQueue: UploadJob[];
  uploading: boolean;
  lock: CaptureLock | null;
  lastLoudAt: number;
}

function emptyHandles(): MediaHandles {
  return {
    stream: null, recorder: null, chunkParts: [], chunkTimer: null, slices: null,
    uploadQueue: [], uploading: false, lock: null, lastLoudAt: 0,
  };
}

export function RoomCaptureProvider({ children }: { children: ReactNode }) {
  const { user, sessionChecked } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(captureReducer, INITIAL_CAPTURE_STATE);
  const [explainBackHolds, setExplainBackHolds] = useState(0);
  const [liveSessionActive, setLiveSessionActive] = useState(hasActiveLiveSession);
  const [speaking, setSpeaking] = useState<Map<string, number>>(new Map());
  const [barSlotCount, setBarSlotCount] = useState(0);

  const media = useRef<MediaHandles>(emptyHandles());
  const stateRef = useRef(state);
  stateRef.current = state;
  const storedRef = useRef<StoredCapture | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Media: archive + live slices ──────────────────────────────────────────

  const hardStopRef = useRef<(reason: string) => void>(noop);

  const pumpUploads = useCallback(async () => {
    const h = media.current;
    if (h.uploading) return;
    h.uploading = true;
    try {
      for (let job = h.uploadQueue[0]; job; job = h.uploadQueue[0]) {
        const { record } = job;
        try {
          // Decision 6: the number is issued by the server, so a reload, a pause/resume or a
          // second visit can never overwrite an earlier chunk.
          if (job.chunkNumber === undefined) job.chunkNumber = await reserveRoomChunkNumber(record.roomId);
          await uploadRoomAudioChunk(record.roomCode, record.displayName, record.memberId, job.blob, job.chunkNumber, job.isLast);
          h.uploadQueue.shift();
        } catch (err) {
          if (isHardStopError(err)) {
            h.uploadQueue.length = 0;
            hardStopRef.current('archive refused');
            return;
          }
          job.attempts += 1;
          if (job.attempts >= UPLOAD_MAX_ATTEMPTS) {
            console.error('[room-capture] archive chunk dropped after retries:', err);
            h.uploadQueue.shift();
          } else {
            const delayMs = 2_000 * job.attempts;
            await new Promise((r) => setTimeout(r, delayMs));
          }
        }
      }
    } finally {
      h.uploading = false;
    }
  }, []);

  const enqueueChunk = useCallback((isLast: boolean, record: StoredCapture | null = storedRef.current) => {
    const h = media.current;
    if (h.chunkParts.length === 0) return;
    if (!record) {
      h.chunkParts = [];
      return;
    }
    const blob = new Blob(h.chunkParts, { type: 'audio/webm' });
    h.chunkParts = [];
    if (h.uploadQueue.length >= UPLOAD_QUEUE_LIMIT) {
      // Keep the in-flight head; shed the oldest waiting chunk rather than grow without bound.
      console.error('[room-capture] archive upload queue full — dropping the oldest pending chunk');
      h.uploadQueue.splice(1, 1);
    }
    h.uploadQueue.push({ blob, isLast, attempts: 0, record });
    void pumpUploads();
  }, [pumpUploads]);

  const startSlices = useCallback(async (roomId: string) => {
    const h = media.current;
    if (!h.stream) return;
    const send = createSerialSender(
      (wav, sequence) => sendAudioSlice(roomId, sequence, wav),
      {
        onSuccess: () => dispatch({ type: 'SLICE_SUCCEEDED' }),
        onError: (err, sequence) => {
          if (isHardStopError(err)) {
            hardStopRef.current('slice refused');
            return;
          }
          console.error(`[room-capture] slice ${sequence} failed:`, err);
          dispatch({ type: 'SLICE_FAILED' });
        },
        onDrop: (sequence) => {
          console.warn(`[room-capture] slice ${sequence} dropped — upload queue full`);
          dispatch({ type: 'SLICE_FAILED' });
        },
      },
    );
    h.slices = await createSliceRecorder(h.stream, {
      onSlice: send,
      onError: (err) => console.error('[room-capture] slice recorder error:', err),
      onLevel: (rms) => {
        if (rms >= SPEAKING_RMS_THRESHOLD) h.lastLoudAt = Date.now();
      },
    });
  }, []);

  /**
   * `flushTail`: upload the recording since the last archive chunk. Only a person's own End asks
   * for it. Sign-out, a server refusal (410) and teardown drop the tail: after sign-out no chunk
   * may reach the bucket (AC), and after a 410 the server refuses it anyway.
   */
  /** Resolves once the recorder's final onstop has run (immediately if nothing was recording). */
  const stopMedia = useCallback(({ flushTail = false }: { flushTail?: boolean } = {}): Promise<void> => {
    const h = media.current;
    // Bound now, synchronously: every caller clears storedRef right after this returns, and the
    // recorder's onstop runs later.
    const record = storedRef.current;
    if (h.chunkTimer) clearInterval(h.chunkTimer);
    h.chunkTimer = null;
    // Order matters: the slice recorder stops (and flushes its final partial slice) before the
    // archive recorder, whose onstop releases the shared stream's tracks.
    h.slices?.stop();
    h.slices = null;
    const recorder = h.recorder;
    const stream = h.stream;
    h.recorder = null;
    h.stream = null;
    h.lock?.release();
    h.lock = null;
    if (recorder && recorder.state !== 'inactive') {
      return new Promise<void>((resolve) => {
        recorder.onstop = () => {
          if (flushTail) enqueueChunk(true, record);
          else h.chunkParts = [];
          stream?.getTracks().forEach((t) => t.stop());
          resolve();
        };
        recorder.stop();
      });
    }
    stream?.getTracks().forEach((t) => t.stop());
    return Promise.resolve();
  }, [enqueueChunk]);

  /** Resolves when the archive upload queue is empty and nothing is in flight. */
  const uploadsDrained = useCallback(() => new Promise<void>((resolve) => {
    const check = () => {
      const h = media.current;
      if (h.uploadQueue.length === 0 && !h.uploading) resolve();
      else setTimeout(check, 100);
    };
    check();
  }), []);

  const startArchiveTimer = useCallback((recorder: MediaRecorder) => {
    media.current.chunkTimer = setInterval(() => {
      if (recorder.state === 'recording') recorder.requestData();
      // requestData delivers asynchronously; enqueue on the next turn so the part is included.
      setTimeout(() => enqueueChunk(false), 0);
    }, CHUNK_INTERVAL_MS);
  }, [enqueueChunk]);

  const startMedia = useCallback(async (roomId: string) => {
    const h = media.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    h.stream = stream;
    const recorder = new MediaRecorder(stream);
    h.recorder = recorder;
    h.chunkParts = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) h.chunkParts.push(e.data);
    };
    recorder.start();
    startArchiveTimer(recorder);
    void prewarmSlicePath(roomId).catch((err) => console.warn('[room-capture] pre-warm failed (non-fatal):', err));
    try {
      await startSlices(roomId);
    } catch (err) {
      // The archive is already recording; only live text is lost. Counted toward the stall
      // state so the bar says so rather than implying live text is flowing.
      console.error('[room-capture] live slices could not start:', err);
      for (let i = 0; i < STALL_AFTER_CONSECUTIVE_FAILURES; i++) dispatch({ type: 'SLICE_FAILED' });
    }
  }, [startArchiveTimer, startSlices]);

  /** Decision 8 (T3: hold). Only these two functions change if the iPhone measurement flips it. */
  const pauseMedia = useCallback(() => {
    const h = media.current;
    if (h.chunkTimer) clearInterval(h.chunkTimer);
    h.chunkTimer = null;
    h.slices?.stop();
    h.slices = null;
    if (h.recorder?.state === 'recording') {
      h.recorder.requestData();
      h.recorder.pause();
      setTimeout(() => enqueueChunk(false), 0);
    }
  }, [enqueueChunk]);

  const resumeMedia = useCallback(async (roomId: string) => {
    const h = media.current;
    const recorder = h.recorder;
    if (!recorder || !h.stream) return;
    if (recorder.state === 'paused') recorder.resume();
    startArchiveTimer(recorder);
    try {
      await startSlices(roomId);
    } catch (err) {
      console.error('[room-capture] live slices could not resume:', err);
    }
  }, [startArchiveTimer, startSlices]);

  const teardownLocal = useCallback((forgetRecord: boolean) => {
    stopMedia();
    if (forgetRecord) clearStoredCapture();
    storedRef.current = null;
    dispatch({ type: 'TEARDOWN_COMPLETE' });
  }, [stopMedia]);

  hardStopRef.current = (reason: string) => {
    if (stateRef.current.phase === 'idle' || stateRef.current.phase === 'ending') return;
    console.warn(`[room-capture] hard stop: ${reason}`);
    dispatch({ type: 'SLICE_REFUSED_410' });
    teardownLocal(true);
  };

  // ── Join and end ─────────────────────────────────────────────────────────

  const endingRef = useRef(false);
  const endMyCapture = useCallback(async (roomId: string) => {
    if (stateRef.current.phase === 'idle' || endingRef.current) return;
    endingRef.current = true;
    // The microphone is released at once — End must never wait on the network to stop
    // recording. The bar stays until the server has recorded the End, so what the person sees
    // disappear is an end that exists, not one that is still in flight.
    const stopped = stopMedia({ flushTail: true });
    clearStoredCapture();
    storedRef.current = null;
    try {
      // The microphone is already released. The server is told only after the final chunk (and
      // any backlog) has uploaded, because once capture_ended_at is set gcs-signed-url refuses
      // the upload. Bounded: a stuck upload never holds End open for more than the grace period.
      await Promise.race([
        stopped.then(uploadsDrained),
        new Promise<void>((resolve) => setTimeout(resolve, END_UPLOAD_GRACE_MS)),
      ]);
      await endMyCaptureRpc(roomId);
    } catch (err) {
      // If the server did not hear the End, the sweep ends this seat after 10 minutes without
      // a signal. Nothing is being captured either way.
      console.error('[room-capture] end capture failed:', err);
    } finally {
      dispatch({ type: 'END_REQUESTED' });
      dispatch({ type: 'TEARDOWN_COMPLETE' });
      endingRef.current = false;
    }
  }, [stopMedia, uploadsDrained]);

  const startCapture = useCallback(async ({ eventId, displayName, room: targetRoom }: StartCaptureOptions): Promise<CaptureStartResult> => {
    if (!user) return { started: false, reason: 'join' };
    const current = stateRef.current;
    if (current.phase !== 'idle') {
      const sameRoom = targetRoom ? current.roomId === targetRoom.id : current.eventId === eventId;
      if (sameRoom && LIVE_PHASES.has(current.phase) && current.roomId && current.roomCode) {
        return { started: true, room: { id: current.roomId, code: current.roomCode, eventId: current.eventId ?? null } };
      }
      // One voice, one recording: a different room ends the current capture first.
      if (current.roomId) await endMyCapture(current.roomId);
    }
    dispatch({ type: 'JOIN_REQUESTED', roomId: targetRoom?.id ?? null, eventId });
    try {
      // The consent is the tap on the switch (or the room page's agreement control); the server
      // records it in the same statement that creates the member row.
      const { room, member } = targetRoom
        ? { room: targetRoom, member: await joinRoom(targetRoom.id, user.id, displayName, true) }
        : await createRoom(user.id, displayName, true, eventId ?? undefined);
      if (!member.consentGivenAt) {
        dispatch({ type: 'JOIN_FAILED', message: 'consent was not recorded' });
        return { started: false, reason: 'join' };
      }
      const record: StoredCapture = {
        userId: user.id, roomId: room.id, roomCode: room.code, memberId: member.id,
        eventId: room.eventId, joinedAt: member.joinedAt, displayName: member.displayName,
      };
      const lock = await acquireCaptureLock(room.id);
      storedRef.current = record;
      writeStoredCapture(record);
      const roomInfo = { id: room.id, code: room.code, eventId: room.eventId };
      if (!lock.acquired) {
        dispatch({ type: 'JOIN_SUCCEEDED', room: roomInfo, member, observeOnly: true });
        return { started: true, room: roomInfo };
      }
      media.current.lock = lock;
      dispatch({ type: 'JOIN_SUCCEEDED', room: roomInfo, member });
      try {
        // Only now — after a member row with consent_given_at — is the microphone requested.
        await startMedia(room.id);
      } catch (err) {
        // Joined, but nothing can be captured. Record the end so the server does not wait for
        // a device that will never send, and let the caller say so.
        console.error('[room-capture] microphone could not start:', err);
        await endMyCapture(room.id);
        return { started: false, room: roomInfo, reason: 'microphone' };
      }
      return { started: true, room: roomInfo };
    } catch (err) {
      console.error('[room-capture] join failed:', err);
      stopMedia();
      dispatch({ type: 'JOIN_FAILED', message: err instanceof Error ? err.message : 'join failed' });
      return { started: false, reason: 'join' };
    }
  }, [user, endMyCapture, startMedia, stopMedia]);

  // ── Re-attach on load, observe from a second tab ─────────────────────────

  const attach = useCallback(async () => {
    if (!user || stateRef.current.phase !== 'idle') return;
    const record = readStoredCapture();
    if (!record) return;
    if (record.userId !== user.id) {
      // Consented by someone else on this browser — never inherited.
      clearStoredCapture();
      return;
    }
    const status = await getMyCaptureStatus(record.roomId, user.id).catch(() => null);
    const capPassed = status
      ? Date.now() - new Date(status.joinedAt).getTime() > CAPTURE_CAP_MINUTES * 60_000
      : true;
    if (!status || status.captureEndedAt || status.roomEndedAt || capPassed) {
      clearStoredCapture();
      return;
    }
    if (stateRef.current.phase !== 'idle') return;
    const lock = await acquireCaptureLock(record.roomId);
    storedRef.current = record;
    const room = { id: record.roomId, code: record.roomCode, eventId: record.eventId };
    // The member row exists and is not ended, and it can only have been created with consent.
    const member = { id: record.memberId, consentGivenAt: status.joinedAt, joinedAt: status.joinedAt };
    if (!lock.acquired) {
      dispatch({ type: 'ATTACH', room, member, observeOnly: true });
      return;
    }
    media.current.lock = lock;
    dispatch({ type: 'ATTACH', room, member, observeOnly: false });
    try {
      await startMedia(record.roomId);
    } catch (err) {
      console.error('[room-capture] could not re-attach the microphone:', err);
      teardownLocal(false);
    }
  }, [user, startMedia, teardownLocal]);

  useEffect(() => {
    if (sessionChecked && user) void attach();
  }, [sessionChecked, user, attach]);

  // An observing tab takes over when the capturing tab closes (its lock is released).
  useEffect(() => {
    if (state.phase !== 'observing' || !state.roomId) return;
    const roomId = state.roomId;
    const timer = setInterval(async () => {
      if (stateRef.current.phase !== 'observing' || !readStoredCapture()) return;
      const lock = await acquireCaptureLock(roomId);
      if (!lock.acquired) return;
      if (stateRef.current.phase !== 'observing') {
        lock.release();
        return;
      }
      media.current.lock = lock;
      dispatch({ type: 'LOCK_ACQUIRED' });
      try {
        await startMedia(roomId);
      } catch (err) {
        console.error('[room-capture] could not take over capture:', err);
        teardownLocal(false);
      }
    }, OBSERVE_RETRY_MS);
    return () => clearInterval(timer);
  }, [state.phase, state.roomId, startMedia, teardownLocal]);

  // Another tab ended the capture, or /live state changed in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CAPTURE_STORAGE_KEY && !e.newValue && stateRef.current.phase !== 'idle') {
        teardownLocal(false);
      }
      setLiveSessionActive(hasActiveLiveSession());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [teardownLocal]);

  // ── Auth change ends capture immediately ─────────────────────────────────

  const lastUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!sessionChecked) return;
    const currentId = user?.id ?? null;
    const previousId = lastUserIdRef.current;
    lastUserIdRef.current = currentId;
    if (previousId === undefined || previousId === currentId) return;
    if (stateRef.current.phase !== 'idle') {
      stopMedia();
      // Chunks still waiting would upload under the signed-out person's record.
      media.current.uploadQueue.length = 0;
      storedRef.current = null;
      dispatch({ type: 'AUTH_CHANGED' });
    }
    const record = readStoredCapture();
    if (record && record.userId !== currentId) clearStoredCapture();
  }, [sessionChecked, user?.id, stopMedia]);

  // Unmount (a crash into the error boundary, a full teardown): capture stops with it.
  useEffect(() => () => { void stopMedia(); }, [stopMedia]);

  // ── The per-person cap ───────────────────────────────────────────────────

  useEffect(() => {
    if (!LIVE_PHASES.has(state.phase) || state.phase === 'observing' || !state.joinedAt) return;
    const remaining = new Date(state.joinedAt).getTime() + CAPTURE_CAP_MINUTES * 60_000 - Date.now();
    const timer = setTimeout(() => hardStopRef.current('per-person cap reached'), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [state.phase, state.joinedAt]);

  // ── Pause / resume ───────────────────────────────────────────────────────

  useEffect(() => {
    setLiveSessionActive(hasActiveLiveSession());
  }, [location.pathname]);

  const pauseLocation =
    shouldPauseForLocation(location.pathname) ||
    isImmersiveLetterRoute(location.pathname, location.search, !!user);

  useEffect(() => {
    const { phase, roomId } = state;
    if (!roomId) return;
    const wantPaused = pauseLocation || explainBackHolds > 0 || (phase === 'paused' && liveSessionActive);
    if ((phase === 'capturing' || phase === 'stalled') && wantPaused) {
      dispatch({ type: 'PAUSE_REQUESTED', reason: pauseLocation ? 'location' : 'explain-back' });
      pauseMedia();
    } else if (phase === 'paused' && !wantPaused) {
      dispatch({ type: 'RESUME_REQUESTED' });
      void resumeMedia(roomId);
    }
  }, [state, pauseLocation, explainBackHolds, liveSessionActive, pauseMedia, resumeMedia]);

  // While paused: the heartbeat, and a re-check of /live state that no navigation will trigger.
  useEffect(() => {
    if (state.phase !== 'paused' || !state.roomId) return;
    const roomId = state.roomId;
    const beat = () => void touchRoomCapture(roomId).catch((err) => console.warn('[room-capture] heartbeat failed:', err));
    beat();
    const heartbeat = setInterval(beat, PAUSED_HEARTBEAT_INTERVAL_MS);
    const recheck = setInterval(() => setLiveSessionActive(hasActiveLiveSession()), PAUSE_RECHECK_MS);
    return () => {
      clearInterval(heartbeat);
      clearInterval(recheck);
    };
  }, [state.phase, state.roomId]);

  const holdPause = useCallback((reason: string) => {
    void reason;
    setExplainBackHolds((n) => n + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setExplainBackHolds((n) => Math.max(0, n - 1));
    };
  }, []);

  // ── The "…" speaking cue: realtime broadcast, never a row ────────────────

  const subscribedRoomId = state.phase === 'idle' ? null : state.roomId;
  useEffect(() => {
    if (!subscribedRoomId) return;
    const channel = supabase
      .channel(`transcribe_speaking:${subscribedRoomId}`)
      .on('broadcast', { event: 'speaking' }, ({ payload }) => {
        const { memberId, speaking: isSpeaking } = (payload ?? {}) as { memberId?: string; speaking?: boolean };
        if (typeof memberId !== 'string') return;
        setSpeaking((prev) => {
          const next = new Map(prev);
          if (isSpeaking) next.set(memberId, Date.now() + SPEAKING_EXPIRY_MS);
          else next.delete(memberId);
          return next;
        });
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
      setSpeaking(new Map());
    };
  }, [subscribedRoomId]);

  useEffect(() => {
    const memberId = state.memberId;
    if (!memberId || !state.roomId) return;
    let lastSent: boolean | null = null;
    const timer = setInterval(() => {
      const isSpeaking = stateRef.current.phase === 'capturing' && Date.now() - media.current.lastLoudAt < SPEAKING_HOLD_MS;
      setSpeaking((prev) => {
        // Expire stale broadcasts (a tab that closed mid-sentence never sends "stopped").
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        for (const [id, expiresAt] of next) {
          if (expiresAt < now) {
            next.delete(id);
            changed = true;
          }
        }
        if (isSpeaking) {
          next.set(memberId, now + SPEAKING_EXPIRY_MS);
          changed = true;
        } else if (next.has(memberId)) {
          next.delete(memberId);
          changed = true;
        }
        return changed ? next : prev;
      });
      // Re-sent while speaking so other tabs' expiry keeps being refreshed.
      if (isSpeaking || lastSent !== isSpeaking) {
        lastSent = isSpeaking;
        void channelRef.current?.send({ type: 'broadcast', event: 'speaking', payload: { memberId, speaking: isSpeaking } });
      }
    }, 750);
    return () => clearInterval(timer);
  }, [state.memberId, state.roomId]);

  // ── Value ────────────────────────────────────────────────────────────────

  const registerBarSlot = useCallback(() => {
    setBarSlotCount((n) => n + 1);
    return () => setBarSlotCount((n) => Math.max(0, n - 1));
  }, []);

  const open = useCallback(() => {
    const code = stateRef.current.roomCode;
    if (code) navigate(`/transcribe/${code}`);
  }, [navigate]);

  const value = useMemo<RoomCaptureContextValue>(() => ({
    phase: state.phase,
    roomId: state.roomId,
    roomCode: state.roomCode ?? null,
    eventId: state.eventId ?? null,
    memberId: state.memberId ?? null,
    barVisible:
      (state.phase === 'capturing' || state.phase === 'stalled' || state.phase === 'observing') && !pauseLocation,
    startCapture,
    endMyCapture,
    open,
    holdPause,
    isCapturingForEvent: (eventId: string) => state.eventId === eventId && LIVE_PHASES.has(state.phase),
    speakingMemberIds: new Set(speaking.keys()),
    registerBarSlot,
    barSlotCount,
  }), [state, pauseLocation, startCapture, endMyCapture, open, holdPause, speaking, registerBarSlot, barSlotCount]);

  return <RoomCaptureContext.Provider value={value}>{children}</RoomCaptureContext.Provider>;
}
