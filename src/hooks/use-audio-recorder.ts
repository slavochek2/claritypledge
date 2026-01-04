/**
 * @file use-audio-recorder.ts
 * @description P28.1: Audio recording hook for ML training data capture
 *
 * Uses MediaRecorder API to capture user's microphone input during live sessions.
 * Records in webm/opus format (native browser format) for efficient storage.
 */
import { useState, useRef, useCallback } from 'react';

interface UseAudioRecorderReturn {
  /** Whether recording is currently active */
  isRecording: boolean;
  /** Start recording from user's microphone */
  startRecording: () => Promise<void>;
  /** Stop recording and return the audio blob */
  stopRecording: () => Promise<Blob | null>;
  /** Error message if recording failed */
  error: string | null;
}

/**
 * Hook for recording audio from the user's microphone.
 *
 * Usage:
 * ```tsx
 * const { isRecording, startRecording, stopRecording, error } = useAudioRecorder();
 *
 * // On session start
 * await startRecording();
 *
 * // On session end
 * const audioBlob = await stopRecording();
 * if (audioBlob) {
 *   await uploadSessionRecording(sessionCode, userName, audioBlob, events, metadata);
 * }
 * ```
 */
export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    // Reset state
    setError(null);
    audioChunksRef.current = [];

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

      console.log('[AudioRecorder] Recording started with mime type:', mimeType);
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
  }, []);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    const mediaRecorder = mediaRecorderRef.current;
    const stream = streamRef.current;

    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      console.warn('[AudioRecorder] No active recording to stop');
      return null;
    }

    return new Promise((resolve) => {
      mediaRecorder.onstop = () => {
        // Combine all chunks into a single blob
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType,
        });

        console.log('[AudioRecorder] Recording stopped. Size:', audioBlob.size, 'bytes');

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
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    error,
  };
}
