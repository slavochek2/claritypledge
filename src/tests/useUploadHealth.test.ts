/**
 * @file useUploadHealth.test.ts
 * Unit tests for src/hooks/use-upload-health.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUploadHealth } from '../hooks/use-upload-health';
import type { ChunkUploadQueue, UploadHealth } from '@/lib/chunk-upload-queue';

function makeQueue(): ChunkUploadQueue {
  return {
    onHealthChange: null,
    onProgress: null,
  } as unknown as ChunkUploadQueue;
}

describe('useUploadHealth', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 1. Initial state
  it('returns defaults on initial render', () => {
    const queue = makeQueue();
    const { result } = renderHook(() => useUploadHealth(queue));

    expect(result.current.uploadHealth).toBe('healthy');
    expect(result.current.pendingChunks).toBe(0);
    expect(result.current.totalChunks).toBe(0);
    expect(result.current.isUploadComplete).toBe(false);
    expect(result.current.isUploadStalled).toBe(false);
  });

  // 2. Null queue — no crash
  it('handles null queue without crashing', () => {
    const { result } = renderHook(() => useUploadHealth(null));

    expect(result.current.uploadHealth).toBe('healthy');
    expect(result.current.pendingChunks).toBe(0);
    expect(result.current.totalChunks).toBe(0);
    expect(result.current.isUploadComplete).toBe(false);
    expect(result.current.isUploadStalled).toBe(false);
  });

  // 3. Health change callback
  it('updates uploadHealth when onHealthChange is called with degraded', () => {
    const queue = makeQueue();
    const { result } = renderHook(() => useUploadHealth(queue));

    act(() => {
      queue.onHealthChange!('degraded' as UploadHealth);
    });

    expect(result.current.uploadHealth).toBe('degraded');
  });

  it('updates uploadHealth when onHealthChange is called with failed', () => {
    const queue = makeQueue();
    const { result } = renderHook(() => useUploadHealth(queue));

    act(() => {
      queue.onHealthChange!('failed' as UploadHealth);
    });

    expect(result.current.uploadHealth).toBe('failed');
  });

  // 4. Progress callback — partial upload
  it('updates pendingChunks and totalChunks from onProgress', () => {
    const queue = makeQueue();
    const { result } = renderHook(() => useUploadHealth(queue));

    act(() => {
      queue.onProgress!({ uploaded: 5, total: 10 });
    });

    expect(result.current.pendingChunks).toBe(5);
    expect(result.current.totalChunks).toBe(10);
    expect(result.current.isUploadComplete).toBe(false);
  });

  // 5. Upload complete
  it('sets isUploadComplete=true and pendingChunks=0 when all chunks uploaded', () => {
    const queue = makeQueue();
    const { result } = renderHook(() => useUploadHealth(queue));

    act(() => {
      queue.onProgress!({ uploaded: 10, total: 10 });
    });

    expect(result.current.pendingChunks).toBe(0);
    expect(result.current.totalChunks).toBe(10);
    expect(result.current.isUploadComplete).toBe(true);
    expect(result.current.isUploadStalled).toBe(false);
  });

  // 6. Stall detection — advance 5 minutes with pending chunks
  it('sets isUploadStalled=true after 5 minutes with pending chunks', () => {
    const queue = makeQueue();
    const { result } = renderHook(() => useUploadHealth(queue));

    act(() => {
      queue.onProgress!({ uploaded: 3, total: 10 });
    });

    expect(result.current.isUploadStalled).toBe(false);

    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });

    expect(result.current.isUploadStalled).toBe(true);
  });

  it('does not stall before 5 minutes', () => {
    const queue = makeQueue();
    const { result } = renderHook(() => useUploadHealth(queue));

    act(() => {
      queue.onProgress!({ uploaded: 3, total: 10 });
    });

    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000 - 1);
    });

    expect(result.current.isUploadStalled).toBe(false);
  });

  // 7. Stall reset on new progress
  it('resets stall timer when new progress arrives before timeout', () => {
    const queue = makeQueue();
    const { result } = renderHook(() => useUploadHealth(queue));

    act(() => {
      queue.onProgress!({ uploaded: 3, total: 10 });
    });

    // Advance almost to stall threshold
    act(() => {
      vi.advanceTimersByTime(4 * 60 * 1000);
    });

    // New progress resets the timer
    act(() => {
      queue.onProgress!({ uploaded: 5, total: 10 });
    });

    expect(result.current.isUploadStalled).toBe(false);

    // Advance another 4 min — still shouldn't stall (timer was reset)
    act(() => {
      vi.advanceTimersByTime(4 * 60 * 1000);
    });

    expect(result.current.isUploadStalled).toBe(false);

    // Now advance past the full 5 min from the last progress event
    act(() => {
      vi.advanceTimersByTime(60 * 1000 + 1);
    });

    expect(result.current.isUploadStalled).toBe(true);
  });

  it('clears isUploadStalled immediately when progress resets it', () => {
    const queue = makeQueue();
    const { result } = renderHook(() => useUploadHealth(queue));

    act(() => {
      queue.onProgress!({ uploaded: 3, total: 10 });
    });

    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });

    expect(result.current.isUploadStalled).toBe(true);

    act(() => {
      queue.onProgress!({ uploaded: 4, total: 10 });
    });

    expect(result.current.isUploadStalled).toBe(false);
  });

  // 8. Complete upload clears stall timer
  it('clears stall timer when upload completes while stall timer is running', () => {
    const queue = makeQueue();
    const { result } = renderHook(() => useUploadHealth(queue));

    act(() => {
      queue.onProgress!({ uploaded: 5, total: 10 });
    });

    // Complete upload before stall fires
    act(() => {
      queue.onProgress!({ uploaded: 10, total: 10 });
    });

    expect(result.current.isUploadComplete).toBe(true);
    expect(result.current.isUploadStalled).toBe(false);

    // Advance past stall threshold — should NOT stall because timer was cleared
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    });

    expect(result.current.isUploadStalled).toBe(false);
  });

  // 9. Cleanup on unmount
  it('sets onHealthChange and onProgress to null on unmount', () => {
    const queue = makeQueue();
    const { unmount } = renderHook(() => useUploadHealth(queue));

    // Callbacks are wired up after mount
    expect(queue.onHealthChange).toBeTypeOf('function');
    expect(queue.onProgress).toBeTypeOf('function');

    unmount();

    expect(queue.onHealthChange).toBeNull();
    expect(queue.onProgress).toBeNull();
  });

  it('clears stall timer on unmount', () => {
    const queue = makeQueue();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { result, unmount } = renderHook(() => useUploadHealth(queue));

    act(() => {
      queue.onProgress!({ uploaded: 3, total: 10 });
    });

    // Timer is now running
    unmount();

    // clearTimeout should have been called to clean up
    expect(clearTimeoutSpy).toHaveBeenCalled();

    // Advancing past stall threshold after unmount should not update any state
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    });

    // result.current reflects state at unmount, not after
    expect(result.current.isUploadStalled).toBe(false);

    clearTimeoutSpy.mockRestore();
  });
});
