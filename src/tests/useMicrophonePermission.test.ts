/**
 * @file useMicrophonePermission.test.ts
 * @description TDD tests for P40: Microphone Permission Handling hook
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMicrophonePermission } from '@/hooks/useMicrophonePermission';

// Mock navigator.mediaDevices
const mockGetUserMedia = vi.fn();
const mockStopTrack = vi.fn();

const createMockStream = () => ({
  getTracks: () => [{ stop: mockStopTrack }],
});

describe('useMicrophonePermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default mock
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('starts with unknown status', () => {
      const { result } = renderHook(() => useMicrophonePermission());

      expect(result.current.status).toBe('unknown');
      expect(result.current.error).toBeNull();
      expect(result.current.attemptCount).toBe(0);
    });
  });

  describe('requestPermission - success', () => {
    it('returns true and sets granted status when permission is granted', async () => {
      mockGetUserMedia.mockResolvedValueOnce(createMockStream());

      const { result } = renderHook(() => useMicrophonePermission());

      let granted: boolean | undefined;
      await act(async () => {
        granted = await result.current.requestPermission();
      });

      expect(granted).toBe(true);
      expect(result.current.status).toBe('granted');
      expect(result.current.error).toBeNull();
    });

    it('stops the media stream tracks after getting permission', async () => {
      mockGetUserMedia.mockResolvedValueOnce(createMockStream());

      const { result } = renderHook(() => useMicrophonePermission());

      await act(async () => {
        await result.current.requestPermission();
      });

      expect(mockStopTrack).toHaveBeenCalled();
    });

    it('increments attemptCount on each request', async () => {
      mockGetUserMedia.mockResolvedValue(createMockStream());

      const { result } = renderHook(() => useMicrophonePermission());

      await act(async () => {
        await result.current.requestPermission();
      });
      expect(result.current.attemptCount).toBe(1);

      await act(async () => {
        await result.current.requestPermission();
      });
      expect(result.current.attemptCount).toBe(2);
    });

    it('sets status to checking while requesting', async () => {
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockGetUserMedia.mockReturnValueOnce(pendingPromise);

      const { result } = renderHook(() => useMicrophonePermission());

      // Start the request but don't await it
      act(() => {
        result.current.requestPermission();
      });

      // Should be checking while waiting
      expect(result.current.status).toBe('checking');

      // Resolve to clean up
      await act(async () => {
        resolvePromise!(createMockStream());
      });
    });
  });

  describe('requestPermission - errors', () => {
    it('handles NotAllowedError (permission denied)', async () => {
      const error = new DOMException('Permission denied', 'NotAllowedError');
      mockGetUserMedia.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useMicrophonePermission());

      let granted: boolean | undefined;
      await act(async () => {
        granted = await result.current.requestPermission();
      });

      expect(granted).toBe(false);
      expect(result.current.status).toBe('denied');
      expect(result.current.error).toBe('Microphone access was blocked');
    });

    it('handles PermissionDeniedError (legacy permission denied)', async () => {
      const error = new DOMException('Permission denied', 'PermissionDeniedError');
      mockGetUserMedia.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useMicrophonePermission());

      await act(async () => {
        await result.current.requestPermission();
      });

      expect(result.current.status).toBe('denied');
      expect(result.current.error).toBe('Microphone access was blocked');
    });

    it('handles NotFoundError (no microphone)', async () => {
      const error = new DOMException('No device found', 'NotFoundError');
      mockGetUserMedia.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useMicrophonePermission());

      await act(async () => {
        await result.current.requestPermission();
      });

      expect(result.current.status).toBe('denied');
      expect(result.current.error).toBe('No microphone detected on this device');
    });

    it('handles NotReadableError (mic in use)', async () => {
      const error = new DOMException('Device in use', 'NotReadableError');
      mockGetUserMedia.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useMicrophonePermission());

      await act(async () => {
        await result.current.requestPermission();
      });

      expect(result.current.status).toBe('denied');
      expect(result.current.error).toBe(
        'Microphone is in use by another app. Close Zoom, Teams, or other apps and try again.'
      );
    });

    it('handles OverconstrainedError', async () => {
      const error = new DOMException('Constraints error', 'OverconstrainedError');
      mockGetUserMedia.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useMicrophonePermission());

      await act(async () => {
        await result.current.requestPermission();
      });

      expect(result.current.status).toBe('denied');
      expect(result.current.error).toBe('No microphone matches the requirements');
    });

    it('handles unknown errors with default message', async () => {
      const error = new Error('Some unknown error');
      mockGetUserMedia.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useMicrophonePermission());

      await act(async () => {
        await result.current.requestPermission();
      });

      expect(result.current.status).toBe('denied');
      expect(result.current.error).toBe('Unable to access microphone. Please try again.');
    });
  });

  describe('browser support', () => {
    it('returns unsupported status when mediaDevices is not available', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useMicrophonePermission());

      let granted: boolean | undefined;
      await act(async () => {
        granted = await result.current.requestPermission();
      });

      expect(granted).toBe(false);
      expect(result.current.status).toBe('unsupported');
      expect(result.current.error).toBe(
        'Your browser does not support microphone access. Try Chrome, Safari, or Firefox.'
      );
    });

    it('returns unsupported status when getUserMedia is not available', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {},
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useMicrophonePermission());

      let granted: boolean | undefined;
      await act(async () => {
        granted = await result.current.requestPermission();
      });

      expect(granted).toBe(false);
      expect(result.current.status).toBe('unsupported');
    });
  });

  describe('reset', () => {
    it('resets all state to initial values', async () => {
      const error = new DOMException('Permission denied', 'NotAllowedError');
      mockGetUserMedia.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useMicrophonePermission());

      // First, get into an error state
      await act(async () => {
        await result.current.requestPermission();
      });

      expect(result.current.status).toBe('denied');
      expect(result.current.error).not.toBeNull();
      expect(result.current.attemptCount).toBe(1);

      // Now reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.status).toBe('unknown');
      expect(result.current.error).toBeNull();
      expect(result.current.attemptCount).toBe(0);
    });
  });

  describe('multiple attempts', () => {
    it('clears previous error on new request', async () => {
      // First request fails
      const error = new DOMException('Permission denied', 'NotAllowedError');
      mockGetUserMedia.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useMicrophonePermission());

      await act(async () => {
        await result.current.requestPermission();
      });

      expect(result.current.error).not.toBeNull();

      // Second request succeeds
      mockGetUserMedia.mockResolvedValueOnce(createMockStream());

      await act(async () => {
        await result.current.requestPermission();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.status).toBe('granted');
    });

    it('tracks attempt count through failures and successes', async () => {
      const error = new DOMException('Permission denied', 'NotAllowedError');

      const { result } = renderHook(() => useMicrophonePermission());

      // Fail twice
      mockGetUserMedia.mockRejectedValueOnce(error);
      await act(async () => {
        await result.current.requestPermission();
      });
      expect(result.current.attemptCount).toBe(1);

      mockGetUserMedia.mockRejectedValueOnce(error);
      await act(async () => {
        await result.current.requestPermission();
      });
      expect(result.current.attemptCount).toBe(2);

      // Succeed on third
      mockGetUserMedia.mockResolvedValueOnce(createMockStream());
      await act(async () => {
        await result.current.requestPermission();
      });
      expect(result.current.attemptCount).toBe(3);
    });
  });
});
