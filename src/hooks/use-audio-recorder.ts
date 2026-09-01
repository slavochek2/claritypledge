/**
 * @file use-audio-recorder.ts
 * @description P28.1/P566: Audio recording hook for ML training data capture
 *
 * Uses MediaRecorder API to capture user's microphone input during live sessions.
 * Records in webm/opus format (native browser format) for efficient storage.
 *
 * Supports two modes:
 * 1. Single-file mode (default): Records entire session, uploads on stop
 * 2. Chunked mode: Produces 5-second chunks for IndexedDB persistence + queued upload
 */
import { useState, useRef, useCallback, useEffect } from 'react';

/** Callback type for chunk uploads (legacy — kept for backward compat) */
export type ChunkUploadCallback = (
  chunkBlob: Blob,
  chunkNumber: number,
  isLastChunk: boolean
) => Promise<void>;

/** P566: Synchronous callback when a chunk is produced (no async — just persist + enqueue) */
export type ChunkProducedCallback = (
  blob: Blob,
  chunkNumber: number,
  isLastChunk: boolean
) => void;

/** Maximum recording duration: 90 minutes (180 chunks at 30s each) */
const MAX_RECORDING_DURATION_MS = 90 * 60 * 1000;

interface UseAudioRecorderOptions {
  /** If provided, enables chunked upload mode with 30s intervals (legacy) */
  onChunkReady?: ChunkUploadCallback;
  /** P566: Synchronous chunk produced callback (preferred over onChunkReady) */
  onChunkProduced?: ChunkProducedCallback;
  /** Chunk interval in milliseconds (default: 5000 = 5 seconds) */
  chunkIntervalMs?: number;
  /** Maximum recording duration in ms (default: 90 minutes) */
  maxDurationMs?: number;
}

interface UseAudioRecorderReturn {
  /** Whether recording is currently active */
  isRecording: boolean;
  /** Start recording from user's microphone */
  startRecording: () => Promise<void>;
  /** Stop recording and return the audio blob (or null if using chunked mode) */
  stopRecording: () => Promise<Blob | null>;
  /** Error message if recording failed */
  error: string | null;
  /** Current chunk number (for chunked mode) */
  chunkNumber: number;
  /** P566: Force an immediate chunk flush (e.g., on visibilitychange) */
  requestImmediateFlush: () => void;
}

/**
 * Hook for recording audio from the user's microphone.
 *
 * Usage (chunked mode with P566 queue):
 * ```tsx
 * const onChunkProduced = (blob, chunkNum, isLast) => {
 *   store.saveChunk(key, blob, metadata);
 *   queue.enqueue(key);
 * };
 *
 * const { isRecording, startRecording, stopRecording, requestImmediateFlush } = useAudioRecorder({
 *   onChunkProduced,
 *   chunkIntervalMs: 5000,
 * });
 * ```
 */
export function useAudioRecorder(options: UseAudioRecorderOptions = {}): UseAudioRecorderReturn {
  const { onChunkReady, onChunkProduced, chunkIntervalMs = 5000, maxDurationMs = MAX_RECORDING_DURATION_MS } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chunkNumber, setChunkNumber] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const maxDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mimeTypeRef = useRef<string>('audio/webm');
  const currentChunkRef = useRef<number>(0);
  const stopRecordingRef = useRef<(() => Promise<Blob | null>) | null>(null);

  // Determine which callback to use (P566 onChunkProduced takes priority)
  const isChunkedMode = !!(onChunkProduced || onChunkReady);

  // Function to flush current chunks and dispatch
  const flushAndUploadChunk = useCallback((isLastChunk: boolean) => {
    if (!isChunkedMode || audioChunksRef.current.length === 0) return;

    const chunkBlob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
    const chunkNum = currentChunkRef.current;

    // Clear chunks immediately to avoid double-upload
    audioChunksRef.current = [];
    currentChunkRef.current++;
    setChunkNumber(currentChunkRef.current);

    // P566: Use synchronous onChunkProduced if available
    if (onChunkProduced) {
      onChunkProduced(chunkBlob, chunkNum, isLastChunk);
    } else if (onChunkReady) {
      // Legacy path: fire-and-forget async upload
      onChunkReady(chunkBlob, chunkNum, isLastChunk).catch((err) => {
        console.error(`[AudioRecorder] Failed to upload chunk ${chunkNum}:`, err);
      });
    }
  }, [isChunkedMode, onChunkProduced, onChunkReady]);

  const requestImmediateFlush = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      // requestData() triggers ondataavailable with buffered data
      mediaRecorder.requestData();
      // Flush after a small delay to let ondataavailable fire
      setTimeout(() => {
        flushAndUploadChunk(false);
      }, 100);
    }
  }, [flushAndUploadChunk]);

  const startRecording = useCallback(async () => {
    // Reset state
    setError(null);
    audioChunksRef.current = [];
    currentChunkRef.current = 0;
    setChunkNumber(0);

    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // Determine best supported mime type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'; // Fallback for Safari

      mimeTypeRef.current = mimeType;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000, // 128 kbps - good balance of quality and size
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('[AudioRecorder] MediaRecorder error:', event);
        setError('Recording error occurred');
        setIsRecording(false);
      };

      mediaRecorderRef.current = mediaRecorder;

      // Start recording with 1-second chunks for more reliable data capture
      mediaRecorder.start(1000);
      setIsRecording(true);

      // If in chunked mode, set up periodic flushes
      if (isChunkedMode) {
        chunkIntervalRef.current = setInterval(() => {
          flushAndUploadChunk(false);
        }, chunkIntervalMs);
      }

      // Set up max duration auto-stop (default 90 minutes)
      if (maxDurationMs > 0) {
        maxDurationTimeoutRef.current = setTimeout(() => {
          if (stopRecordingRef.current) {
            stopRecordingRef.current();
          }
        }, maxDurationMs);
      }
    } catch (err) {
      console.error('[AudioRecorder] Failed to start recording:', err);

      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          setError('Microphone access denied. Please allow microphone access to record.');
        } else if (err.name === 'NotFoundError') {
          setError('No microphone found. Please connect a microphone.');
        } else {
          setError(`Microphone error: ${err.message}`);
        }
      } else {
        setError('Failed to start recording');
      }
    }
  }, [isChunkedMode, chunkIntervalMs, flushAndUploadChunk, maxDurationMs]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    const mediaRecorder = mediaRecorderRef.current;
    const stream = streamRef.current;

    // Clear chunk upload interval
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }

    // Clear max duration timeout
    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }

    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      console.warn('[AudioRecorder] No active recording to stop');
      return null;
    }

    return new Promise((resolve) => {
      mediaRecorder.onstop = () => {
        // In chunked mode, flush remaining data as final chunk
        if (isChunkedMode && audioChunksRef.current.length > 0) {
          flushAndUploadChunk(true);
          // Clean up
          audioChunksRef.current = [];
          mediaRecorderRef.current = null;
          setIsRecording(false);

          // Stop all tracks to release microphone
          if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          }

          resolve(null); // No blob in chunked mode
          return;
        }

        // Single-file mode: combine all chunks into a single blob
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType,
        });

        // Clean up
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        setIsRecording(false);

        // Stop all tracks to release microphone
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        resolve(audioBlob);
      };

      mediaRecorder.stop();
    });
  }, [isChunkedMode, flushAndUploadChunk]);

  // Keep stopRecording ref updated for max duration timeout
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  // Cleanup on unmount (handles tab close / navigation)
  useEffect(() => {
    return () => {
      if (chunkIntervalRef.current) {
        clearInterval(chunkIntervalRef.current);
      }
      if (maxDurationTimeoutRef.current) {
        clearTimeout(maxDurationTimeoutRef.current);
      }
      // P566: No unmount upload — the queue + IndexedDB handles persistence
      // Release microphone
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    error,
    chunkNumber,
    requestImmediateFlush,
  };
}
