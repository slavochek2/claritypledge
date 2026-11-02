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
 *   - The microphone stream, the PCM tap that feeds both the 30 s WAV archive and the 13 s live slices. The mic is
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
import type { SliceDestination } from '@/app/data/transcribe-slice-destination';
import { uploadRoomAudioChunk } from '@/app/data/api';
import {
  CAPTURE_STORAGE_KEY,
  clearStoredCapture,
  isHardStopError,
  readStoredCapture,
  writeStoredCapture,
  type StoredCapture,
} from './room-capture-storage';
import { createSerialSender, createSliceRecorder, type SliceRecorder } from '@/lib/audio/slice-recorder';
import { openCapturedRoom } from '@/app/data/event-chat-path';
import { endGraceMs } from '@/lib/audio-upload-budget';
import { startTapWithRetry, stillResuming } from './room-capture-tap';
import { pumpUploadQueue, useExpiringFlag, type UploadJob } from './room-capture-uploads';
import { isImmersiveLetterRoute } from '@/app/layouts/immersive-letter-route';
import {
  CAPTURE_CAP_MINUTES,
  INITIAL_CAPTURE_STATE,
  LIVE_PHASES,
  PAUSED_HEARTBEAT_INTERVAL_MS,
  SILENCE_RMS_FLOOR,
  SILENCE_WARN_AFTER_MS,
  acquireCaptureLock,
  captureReducer,
  decidePauseTransition,
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

/** Failed archive uploads are retried from a bounded queue, never dropped silently. */
const UPLOAD_QUEUE_LIMIT = 10;
/** Speaking cue: input level above this within the last SPEAKING_HOLD_MS reads as speaking. */
const SPEAKING_RMS_THRESHOLD = 0.02;
const SPEAKING_HOLD_MS = 1_500;
/** A broadcast "speaking" state that is not refreshed expires, so a closed tab's "…" clears. */
const SPEAKING_EXPIRY_MS = 4_000;
/** How often an observing tab re-tries the lock, and a paused capture re-checks /live. */
const OBSERVE_RETRY_MS = 15_000;
const PAUSE_RECHECK_MS = 5_000;
/** P1388: how long the bar says the microphone changed after an unplug. */
const MIC_SWITCHED_NOTICE_MS = 8_000;

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
  /** P1592: where the server last said it posted this person's words. Null until a line is
   *  stored in this page session, and again after a restored capture. Never the client's own
   *  reading of the seating. */
  destination: SliceDestination | null;
  /** True when the bar should be on screen for this person on the current route. */
  barVisible: boolean;
  /** Joins (switch on + Continue) and starts capture. See CaptureStartResult. */
  startCapture: (options: StartCaptureOptions) => Promise<CaptureStartResult>;
  /** Ends THIS person's capture. Never the room. */
  endMyCapture: (roomId: string) => Promise<void>;
  open: () => void;
  /** Explain-back and any future microphone user: pause room capture while held. */
  holdPause: (reason: string) => () => void;
  /** P1388: the recorder's own Pause / Resume. Pause stops the recorder writing; it is not hidden. */
  manualPaused: boolean;
  pauseMine: () => void;
  resumeMine: () => void;
  /** P1388: live input level (RMS 0..1), pushed outside React so a meter never re-renders the tree. */
  subscribeLevel: (listener: (rms: number) => void) => () => void;
  /** P1388: no sound has reached the recording for a while — a muted, locked or dead input. */
  inputSilent: boolean;
  /** P1388: the microphone's source ended (unplugged) and could not be re-opened. */
  micLost: boolean;
  /** P1388: the source ended and capture moved to the default input — shown briefly. */
  micSwitched: boolean;
  /** P1388: Stop was tapped. The mic is already off; the last chunk is still uploading. */
  stopping: boolean;
  /** P1388: paused only because a /live record exists (no /live page, no explain-back) — the
   *  one automatic pause the person may need to see and undo, since the record can be stale. */
  pausedByLiveRecord: boolean;
  /** P1388: re-open the default mic after it was lost — only on the person's tap. */
  reconnectMic: () => Promise<void>;
  /** P1596: the microphone is open but the audio tap could not start (after retries): nothing is being recorded. */
  tapDown: boolean;
  /** P1596: at least one archive chunk could not be saved (dropped after its retries, or shed from a full queue). */
  audioLost: boolean;
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
  destination: null,
  barVisible: false,
  startCapture: () => Promise.resolve({ started: false, reason: 'join' }),
  endMyCapture: () => Promise.resolve(),
  open: noop,
  holdPause: () => noop,
  manualPaused: false,
  pauseMine: noop,
  resumeMine: noop,
  subscribeLevel: () => noop,
  inputSilent: false,
  micLost: false,
  micSwitched: false,
  stopping: false,
  reconnectMic: () => Promise.resolve(),
  tapDown: false,
  audioLost: false,
  pausedByLiveRecord: false,
  isCapturingForEvent: () => false,
  speakingMemberIds: new Set(),
  registerBarSlot: () => noop,
  barSlotCount: 0,
});

// eslint-disable-next-line react-refresh/only-export-components
export function useRoomCapture(): RoomCaptureContextValue {
  return useContext(RoomCaptureContext);
}


/** How long End waits for the final archive chunk to upload before telling the server the
 *  capture ended. gcs-signed-url refuses uploads once capture_ended_at is set, so an end RPC
 *  sent first made the tail — and any queued chunks — undeliverable (external review). */

interface MediaHandles {
  stream: MediaStream | null;
  slices: SliceRecorder | null;
  /** Set only while stopMedia stops the tap: the final archive chunk it emits synchronously is
   *  uploaded (as the last one) for a person's own End, and dropped otherwise. */
  tail: { record: StoredCapture | null; flush: boolean } | null;
  uploadQueue: UploadJob[];
  uploading: boolean;
  lock: CaptureLock | null;
  lastLoudAt: number;
  /** P1388: last time the input carried any signal at all (above SILENCE_RMS_FLOOR). */
  lastSignalAt: number;
}

function emptyHandles(): MediaHandles {
  return {
    stream: null, slices: null, tail: null,
    uploadQueue: [], uploading: false, lock: null, lastLoudAt: 0, lastSignalAt: 0,
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
  const [manualPaused, setManualPaused] = useState(false);
  const [inputSilent, setInputSilent] = useState(false);
  const [micLost, setMicLost] = useState(false);
  const [micSwitched, setMicSwitched] = useState(false);
  /** A Resume the person tapped outranks a leftover /live record (it is not /live, an
   *  explain-back or a letter screen — those still hold the pause). */
  const [userResumed, setUserResumed] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [tapDown, setTapDown] = useState(false);
  const { on: audioLost, mark: markAudioLost, clear: clearAudioLost } = useExpiringFlag(60_000); // a loss is news for a minute
  const [destination, setDestination] = useState<SliceDestination | null>(null);
  const levelListeners = useRef(new Set<(rms: number) => void>());
  /**
   * P1388 review, HIGH 1–3. Every media setup awaits (getUserMedia, AudioContext.resume,
   * addModule) and the world can change during the await. Two latches are re-read AFTER each:
   *   - genRef: bumped by every stop. A setup that started under an older generation closes
   *     what it opened — otherwise a mic opened during recovery outlived Stop transcribing.
   *   - pausedRef: set by pauseMedia, cleared by resumeMedia. A recorder that finishes setting
   *     up mid-pause does not record, and no slice is sent while it is set — otherwise a Pause
   *     tapped during the slice recorder's start-up left live text running under "Paused".
   */
  const genRef = useRef(0);
  /** One mic (re)open at a time — recovery and a tapped Reconnect never overlap. */
  const reconnectingRef = useRef(false);
  const pausedRef = useRef(false);
  const micSwitchedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const media = useRef<MediaHandles>(emptyHandles());
  const stateRef = useRef(state);
  stateRef.current = state;
  const storedRef = useRef<StoredCapture | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Media: archive + live slices ──────────────────────────────────────────

  const hardStopRef = useRef<(reason: string) => void>(noop);

  const pumpUploads = useCallback(() => pumpUploadQueue(media.current, {
    reserve: reserveRoomChunkNumber,
    upload: uploadRoomAudioChunk,
    onHardStop: () => hardStopRef.current('archive refused'),
    onDropped: markAudioLost,
  }), [markAudioLost]);

  /** P1596: one self-contained 16 kHz mono WAV (about 960 KB per 30 s) cut from the live-slice tap. */
  const enqueueChunk = useCallback((wav: Uint8Array, isLast: boolean, record: StoredCapture | null = storedRef.current) => {
    const h = media.current;
    if (!record) return;
    const blob = new Blob([wav as BlobPart], { type: 'audio/wav' });
    if (h.uploadQueue.length >= UPLOAD_QUEUE_LIMIT) {
      // Keep the in-flight head; shed the oldest waiting chunk rather than grow without bound.
      console.error('[room-capture] archive upload queue full — dropping the oldest pending chunk');
      markAudioLost();
      h.uploadQueue.splice(1, 1);
    }
    h.uploadQueue.push({ blob, isLast, attempts: 0, record });
    void pumpUploads();
  }, [pumpUploads, markAudioLost]);

  const startSlices = useCallback(async (roomId: string) => {
    const h = media.current;
    if (!h.stream) return;
    const gen = genRef.current;
    const send = createSerialSender(
      (wav, sequence) => sendAudioSlice(roomId, sequence, wav),
      {
        onSuccess: (_sequence, told) => {
          dispatch({ type: 'SLICE_SUCCEEDED' });
          // P1592: a silent slice (nothing stored) tells nothing, so the last place told stays.
          if (told && genRef.current === gen) setDestination(told);
        },
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
    const slices = await createSliceRecorder(h.stream, {
      // The archive: 30 s WAV chunks and the tail when this recorder stops (pause, unplug, End).
      onArchiveChunk: (wav, isTail) => {
        if (h.tail) {
          if (h.tail.flush && isTail) enqueueChunk(wav, true, h.tail.record);
          return;
        }
        if (genRef.current !== gen) return;
        enqueueChunk(wav, false);
      },
      // Nothing leaves while paused or after this capture ended, whatever the recorder emits.
      onSlice: (wav, sequence) => {
        if (pausedRef.current || genRef.current !== gen) return;
        send(wav, sequence);
      },
      onError: (err) => console.error('[room-capture] slice recorder error:', err), onContextGap: markAudioLost,
      onLevel: (rms) => {
        const now = Date.now();
        if (rms >= SPEAKING_RMS_THRESHOLD) h.lastLoudAt = now;
        if (rms >= SILENCE_RMS_FLOOR) h.lastSignalAt = now;
        for (const listener of levelListeners.current) listener(rms);
      },
    });
    if (pausedRef.current || genRef.current !== gen || h.slices) {
      // Paused, ended, or a newer start won the race while this one was setting up.
      console.warn('[room-capture] slice recorder discarded on arrival', {
        paused: pausedRef.current, ended: genRef.current !== gen, duplicate: !!h.slices,
      });
      slices.stop();
      return;
    }
    h.slices = slices;
    // No level could arrive while the tap was being built; the silence clock starts now.
    h.lastSignalAt = Date.now();
  }, [enqueueChunk, markAudioLost]);

  /**
   * `flushTail`: upload the recording since the last archive chunk. Only a person's own End asks
   * for it. Sign-out, a server refusal (410) and teardown drop the tail: after sign-out no chunk
   * may reach the bucket (AC), and after a 410 the server refuses it anyway.
   */
  /** Stops the tap (its archive tail is emitted synchronously) and releases the microphone. */
  const stopMedia = useCallback(({ flushTail = false }: { flushTail?: boolean } = {}): Promise<void> => {
    const h = media.current;
    // Bound now, synchronously: every caller clears storedRef right after this returns, and the
    // tap's stop flush (bound through h.tail) runs inside stopMedia.
    const record = storedRef.current;
    genRef.current += 1;
    // A getUserMedia that never settles (an unanswered permission prompt) must not leave
    // recovery and Reconnect locked for the rest of the session (adversarial review 2).
    reconnectingRef.current = false;
    pausedRef.current = false;
    // Order matters: the tap stops (flushing its final partial slice and archive tail) before the
    // shared stream's tracks are released.
    h.tail = { record, flush: flushTail };
    try {
      h.slices?.stop();
    } finally {
      h.tail = null;
    }
    h.slices = null;
    const stream = h.stream;
    h.stream = null;
    h.lock?.release();
    h.lock = null;
    stream?.getTracks().forEach((t) => t.stop());
    setTapDown(false); clearAudioLost();
    return Promise.resolve();
  }, [clearAudioLost]);

  /** Resolves when the archive upload queue is empty and nothing is in flight. */
  const uploadsDrained = useCallback(() => new Promise<void>((resolve) => {
    const check = () => {
      const h = media.current;
      if (h.uploadQueue.length === 0 && !h.uploading) resolve();
      else setTimeout(check, 100);
    };
    check();
  }), []);

  const trackEndedRef = useRef<(roomId: string) => void>(noop);

  const startMedia = useCallback(async (roomId: string) => {
    const h = media.current;
    // Plain { audio: true }, never a stored deviceId: after a USB-C mic is unplugged its id is
    // stale, and the OS default (the built-in mic, or the next plugged-in one) is what we want.
    const gen = genRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (genRef.current !== gen || h.stream) {
      // The capture ended (Stop, sign-out, a hard stop) while the mic was being opened — or a
      // concurrent start already installed a stream. Never install a second one: the first
      // would be orphaned, and nothing would ever stop it (adversarial review, BLOCKER).
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    h.stream = stream;
    h.lastSignalAt = Date.now();
    // P1388: a track ENDS when its source disconnects (Media Capture spec), with no fallback.
    // Our own track.stop() does not fire 'ended', so this only ever means the device went away.
    // The stream is audio-only ({ audio: true }), so every track is the microphone.
    for (const track of stream.getTracks()) track.onended = () => trackEndedRef.current(roomId);
    // Opened during a pause (unplug recovery, or Pause tapped while the mic was starting):
    // hold the stream, record nothing. resumeMedia starts the tap.
    if (pausedRef.current) return;
    void prewarmSlicePath(roomId).catch((err) => console.warn('[room-capture] pre-warm failed (non-fatal):', err));
    // The archive is cut from the same tap, so a tap that will not start means nothing is being recorded: retried,
    // then the bar says so (it used to count toward "stalled", which claims the words are still being recorded).
    setTapDown(!(await startTapWithRetry(() => startSlices(roomId), () => genRef.current === gen)));
  }, [startSlices]);

  /** Decision 8 (T3: hold). Only these two functions change if the iPhone measurement flips it. */
  const pauseMedia = useCallback(() => {
    const h = media.current;
    pausedRef.current = true;
    h.slices?.stop();   // emits the archive chunk up to the pause
    h.slices = null;
    setTapDown(false);
  }, []);

  const resumeMedia = useCallback(async (roomId: string) => {
    const h = media.current;
    pausedRef.current = false;
    if (!h.stream) return;
    setTapDown(!(await startTapWithRetry(() => startSlices(roomId), stillResuming(genRef, pausedRef))));
  }, [startSlices]);

  /**
   * P1388 unplug recovery. Keeps the archive so far (the chunk up to the unplug is queued, not
   * dropped), then re-opens the default input and restarts both recorders on it. The Web Lock
   * is kept — this is the same capture, on a new device. If no input can be opened, capture is
   * left stopped and the bar says the microphone is lost; Stop transcribing still works.
   */
  /** The new mic may already have died while it was starting (a flaky Bluetooth / USB-C mic);
   *  its 'ended' fired while reconnectingRef blocked a second recovery. Treat that as lost —
   *  never report "still recording" on a dead track (adversarial review 2, HIGH). */
  const releaseIfDead = useCallback((): boolean => {
    const h = media.current;
    if (!h.stream || h.stream.getTracks().every((t) => t.readyState !== 'ended')) return false;
    h.slices?.stop();
    h.slices = null;
    h.stream.getTracks().forEach((t) => t.stop());
    h.stream = null;
    setMicLost(true);
    return true;
  }, []);

  const recoverFromTrackEnded = useCallback(async (roomId: string) => {
    const h = media.current;
    if (h.stream === null || reconnectingRef.current) return;
    reconnectingRef.current = true;
    setMicLost(true);
    h.slices?.stop();   // the archive chunk up to the unplug is queued by the tap's stop flush
    h.slices = null;
    h.stream?.getTracks().forEach((t) => t.stop());
    h.stream = null;
    const gen = genRef.current;
    if (genRef.current !== gen || storedRef.current?.roomId !== roomId) { // ended meanwhile
      reconnectingRef.current = false;
      return;
    }
    try {
      await startMedia(roomId);
      if (genRef.current !== gen || !h.stream || releaseIfDead()) return;
      setMicLost(false);
      setMicSwitched(true);
      if (micSwitchedTimer.current) clearTimeout(micSwitchedTimer.current);
      micSwitchedTimer.current = setTimeout(() => setMicSwitched(false), MIC_SWITCHED_NOTICE_MS);
    } catch (err) {
      console.error('[room-capture] microphone lost and could not be re-opened:', err);
    } finally {
      reconnectingRef.current = false;
    }
  }, [startMedia, releaseIfDead]);
  trackEndedRef.current = (roomId: string) => void recoverFromTrackEnded(roomId);

  /**
   * After a failed recovery the bar says "nothing is being recorded", so capture must not come
   * back on its own (adversarial review, HIGH: a devicechange — even AirPods connecting —
   * restarted recording with no tap). The person reconnects deliberately.
   */
  const reconnectMic = useCallback(async () => {
    const roomId = storedRef.current?.roomId;
    if (!roomId || reconnectingRef.current) return;
    reconnectingRef.current = true;
    const gen = genRef.current;
    try {
      if (media.current.stream) {   // the mic is open but the tap is not: only the tap is started again
        if (!media.current.slices && !pausedRef.current) setTapDown(!(await startTapWithRetry(() => startSlices(roomId), () => genRef.current === gen)));
        return;
      }
      await startMedia(roomId);
      if (genRef.current === gen && media.current.stream && !releaseIfDead()) setMicLost(false);
    } catch (err) {
      console.warn('[room-capture] mic still unavailable:', err);
    } finally {
      reconnectingRef.current = false;
    }
  }, [startMedia, startSlices, releaseIfDead]);

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
    // P1388: the tap is answered at once. The mic stops on the next line; what takes up to
    // the grace (endGraceMs: the queued bytes at 256 kbit/s) is saving the tail, which must finish before the End RPC.
    setStopping(true);
    // The microphone is released at once — End must never wait on the network to stop
    // recording. The bar stays until the server has recorded the End, so what the person sees
    // disappear is an end that exists, not one that is still in flight.
    const stopped = stopMedia({ flushTail: true });
    const grace = endGraceMs(media.current.uploadQueue.reduce((n, j) => n + j.blob.size, 0));
    clearStoredCapture();
    storedRef.current = null;
    try {
      // The microphone is already released. The server is told only after the final chunk (and
      // any backlog) has uploaded, because once capture_ended_at is set gcs-signed-url refuses
      // the upload. Bounded: a stuck upload never holds End open for more than the grace period.
      await Promise.race([
        stopped.then(uploadsDrained),
        new Promise<void>((resolve) => setTimeout(resolve, grace)),
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
      setStopping(false);
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
    const transition = decidePauseTransition({ phase, pauseLocation, explainBackHolds, liveSessionActive, manualPaused, userResumed });
    // A Resume answers the pause it was tapped on; a later automatic pause (/live, an
    // explain-back) must not inherit it (adversarial review, HIGH).
    if (userResumed && (pauseLocation || explainBackHolds > 0)) setUserResumed(false);
    if (transition === 'pause') {
      dispatch({ type: 'PAUSE_REQUESTED', reason: manualPaused ? 'manual' : pauseLocation ? 'location' : 'explain-back' });
      pauseMedia();
    } else if (transition === 'resume') {
      dispatch({ type: 'RESUME_REQUESTED' });
      void resumeMedia(roomId);
    }
  }, [state, pauseLocation, explainBackHolds, liveSessionActive, manualPaused, userResumed, pauseMedia, resumeMedia]);

  // A manual pause belongs to one capture: when it ends, the next one starts unpaused.
  useEffect(() => {
    if (state.phase === 'idle') {
      setManualPaused(false);
      setUserResumed(false);
      setMicLost(false);
      setInputSilent(false);
    }
  }, [state.phase]);

  // P1388: every silent failure (iOS lock, a muted track, a dead input) writes zeros, never an
  // error. Checked only while actually capturing — a pause is silent on purpose.
  // Keyed on "running", not the phase: a capturing ⇄ stalled flap must not restart the clock,
  // or a flap faster than the threshold would hide a dead input for good.
  const running = state.phase === 'capturing' || state.phase === 'stalled';
  useEffect(() => {
    if (!running) {
      setInputSilent(false);
      return;
    }
    media.current.lastSignalAt = Date.now();
    const timer = setInterval(() => {
      const h = media.current;
      // No tap running (starting up, or live text failed to start) means no level to judge —
      // not silence. Saying "no sound" there would blame a mic that is recording fine.
      if (!h.slices) h.lastSignalAt = Date.now();
      setInputSilent(Date.now() - h.lastSignalAt > SILENCE_WARN_AFTER_MS);
    }, 1_000);
    return () => clearInterval(timer);
  }, [running]);

  const pauseMine = useCallback(() => {
    if (stateRef.current.phase !== 'capturing' && stateRef.current.phase !== 'stalled') return;
    setUserResumed(false);
    setManualPaused(true);
  }, []);
  const resumeMine = useCallback(() => {
    setManualPaused(false);
    setUserResumed(true);
  }, []);
  const subscribeLevel = useCallback((listener: (rms: number) => void) => {
    levelListeners.current.add(listener);
    return () => { levelListeners.current.delete(listener); };
  }, []);

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
    openCapturedRoom(stateRef.current, navigate);
  }, [navigate]);

  // P1592: the place named by the bar belongs to one capture. When capture is gone it goes too,
  // so the next capture (or a restored one) names none until its first stored line.
  useEffect(() => {
    if (state.phase === 'idle') setDestination(null);
  }, [state.phase]);

  const pausedByLiveRecord =
    state.phase === 'paused' && !manualPaused && !pauseLocation && explainBackHolds === 0 && liveSessionActive;

  const value = useMemo<RoomCaptureContextValue>(() => ({
    phase: state.phase,
    roomId: state.roomId,
    roomCode: state.roomCode ?? null,
    eventId: state.eventId ?? null,
    memberId: state.memberId ?? null,
    destination,
    // P1388: a MANUAL pause keeps the bar up (its Resume lives there); an automatic pause on
    // /live or a letter screen still hides it, as P1307 D3/D13 asked.
    barVisible:
      // P1388: a manual pause keeps the bar, and so does a pause held ONLY by a /live record —
      // possibly stale, and otherwise invisible with no way out (adversarial review 2). The
      // other automatic pauses (/live, letters, explain-back) still show nothing, per D3/D13.
      (state.phase === 'capturing' || state.phase === 'stalled' || state.phase === 'observing' ||
        (state.phase === 'paused' && (manualPaused || pausedByLiveRecord))) && !pauseLocation,
    startCapture,
    endMyCapture,
    open,
    holdPause,
    manualPaused,
    pauseMine,
    resumeMine,
    subscribeLevel,
    inputSilent,
    micLost,
    micSwitched,
    stopping,
    reconnectMic,
    tapDown,
    audioLost,
    pausedByLiveRecord,
    isCapturingForEvent: (eventId: string) => state.eventId === eventId && LIVE_PHASES.has(state.phase),
    speakingMemberIds: new Set(speaking.keys()),
    registerBarSlot,
    barSlotCount,
  }), [state, pauseLocation, startCapture, endMyCapture, open, holdPause, manualPaused, pauseMine, resumeMine,
    subscribeLevel, inputSilent, micLost, micSwitched, stopping, reconnectMic, tapDown, audioLost, pausedByLiveRecord, speaking, registerBarSlot, barSlotCount, destination]);

  return <RoomCaptureContext.Provider value={value}>{children}</RoomCaptureContext.Provider>;
}
