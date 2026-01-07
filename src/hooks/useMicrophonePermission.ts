/**
 * @file useMicrophonePermission.ts
 * @description P40: Hook for managing microphone permission requests
 *
 * Provides a clean API for requesting microphone access with:
 * - Human-friendly error messages (never exposes raw JS errors)
 * - Attempt tracking for escalated messaging after repeated failures
 * - Browser support detection
 */
import { useState, useCallback } from 'react';

export type MicrophoneStatus = 'unknown' | 'checking' | 'granted' | 'denied' | 'unsupported';

// Human-friendly error messages (never expose raw JS errors)
const ERROR_MESSAGES: Record<string, string> = {
  NotAllowedError: 'Microphone access was blocked',
  PermissionDeniedError: 'Microphone access was blocked',
  NotFoundError: 'No microphone detected on this device',
  NotReadableError:
    'Microphone is in use by another app. Close Zoom, Teams, or other apps and try again.',
  OverconstrainedError: 'No microphone matches the requirements',
  unsupported:
    'Your browser does not support microphone access. Try Chrome, Safari, or Firefox.',
  default: 'Unable to access microphone. Please try again.',
};

export function useMicrophonePermission() {
  const [status, setStatus] = useState<MicrophoneStatus>('unknown');
  const [error, setError] = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    // Check browser support first
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      setError(ERROR_MESSAGES.unsupported);
      return false;
    }

    setStatus('checking');
    setError(null);
    setAttemptCount((prev) => prev + 1);

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Permission granted - stop the stream immediately (we just needed permission)
      stream.getTracks().forEach((track) => track.stop());

      setStatus('granted');
      return true;
    } catch (err) {
      const e = err as Error;
      const message = ERROR_MESSAGES[e.name] || ERROR_MESSAGES.default;

      setStatus('denied');
      setError(message);
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('unknown');
    setError(null);
    setAttemptCount(0);
  }, []);

  return {
    status,
    error,
    attemptCount,
    requestPermission,
    reset,
  };
}
