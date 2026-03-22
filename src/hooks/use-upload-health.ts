/**
 * @file use-upload-health.ts
 * @description P566: React hook for monitoring upload queue health and progress.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChunkUploadQueue, UploadHealth } from '@/lib/chunk-upload-queue';

interface UseUploadHealthReturn {
  uploadHealth: UploadHealth;
  pendingChunks: number;
  totalChunks: number;
  isUploadComplete: boolean;
  isUploadStalled: boolean;
}

/** Stall timeout: no progress for 5 minutes with pending chunks */
const STALL_TIMEOUT_MS = 5 * 60 * 1000;

export function useUploadHealth(queue: ChunkUploadQueue | null): UseUploadHealthReturn {
  const [uploadHealth, setUploadHealth] = useState<UploadHealth>('healthy');
  const [pendingChunks, setPendingChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [isUploadStalled, setIsUploadStalled] = useState(false);

  const stallTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastProgressRef = useRef<number>(Date.now());

  const resetStallTimer = useCallback(() => {
    lastProgressRef.current = Date.now();
    setIsUploadStalled(false);

    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
    }
    stallTimerRef.current = setTimeout(() => {
      setIsUploadStalled(true);
    }, STALL_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    if (!queue) return;

    const handleHealthChange = (health: UploadHealth) => {
      setUploadHealth(health);
    };

    const handleProgress = (progress: { uploaded: number; total: number }) => {
      const pending = progress.total - progress.uploaded;
      setPendingChunks(pending);
      setTotalChunks(progress.total);

      if (pending > 0) {
        resetStallTimer();
      } else {
        // All done — clear stall timer
        if (stallTimerRef.current) {
          clearTimeout(stallTimerRef.current);
          stallTimerRef.current = null;
        }
        setIsUploadStalled(false);
      }
    };

    queue.onHealthChange = handleHealthChange;
    queue.onProgress = handleProgress;

    return () => {
      queue.onHealthChange = null;
      queue.onProgress = null;
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
    };
  }, [queue, resetStallTimer]);

  const isUploadComplete = totalChunks > 0 && pendingChunks === 0;

  return {
    uploadHealth,
    pendingChunks,
    totalChunks,
    isUploadComplete,
    isUploadStalled,
  };
}
