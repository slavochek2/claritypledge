/**
 * @file use-transcript.ts
 * @description The /sessions transcript read, shared by the session and transcribe-room views.
 * P1586: `retry` re-runs the read when the section wait passes its deadline.
 */
import { useCallback, useEffect, useState } from 'react';

export function useTranscript<T>(id: string, fetchTranscript: (id: string) => Promise<T | null>) {
  const [transcript, setTranscript] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  // Bumped by Retry: the effect runs again, and the cleanup drops the stalled read's late answer.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTranscript(id).then((data) => {
      if (!cancelled) {
        setTranscript(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [id, fetchTranscript, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { transcript, loading, retry };
}
