/**
 * @file useVerificationGate.test.ts
 * @description Unit tests for P273: useVerificationGate hook
 *
 * Tests the hook's core contract:
 * - checkVerified() returns true for verified users (no toast)
 * - checkVerified() returns false for unverified users (shows toast with action label)
 * - checkVerified() returns false when user is null
 * - The action label appears in the toast message
 * - Multiple calls work independently (no stale closure)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock sonner toast before importing the hook
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

// Mock useAuth
vi.mock('@/auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { useVerificationGate } from '@/app/hooks/useVerificationGate';

const mockUseAuth = vi.mocked(useAuth);

describe('useVerificationGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkVerified — verified user', () => {
    it('returns true and shows no toast', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-1', isVerified: true } as any,
        isLoading: false,
        sessionChecked: true,
      } as any);

      const { result } = renderHook(() => useVerificationGate());
      let allowed!: boolean;

      act(() => {
        allowed = result.current.checkVerified('create a story');
      });

      expect(allowed).toBe(true);
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe('checkVerified — unverified user', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-1', isVerified: false } as any,
        isLoading: false,
        sessionChecked: true,
      } as any);
    });

    it('returns false', () => {
      const { result } = renderHook(() => useVerificationGate());
      let allowed!: boolean;

      act(() => {
        allowed = result.current.checkVerified('create a story');
      });

      expect(allowed).toBe(false);
    });

    it('shows an error toast', () => {
      const { result } = renderHook(() => useVerificationGate());

      act(() => {
        result.current.checkVerified('create a story');
      });

      expect(toast.error).toHaveBeenCalledTimes(1);
    });

    it('includes the action label in the toast message', () => {
      const { result } = renderHook(() => useVerificationGate());

      act(() => {
        result.current.checkVerified('set a position on this point');
      });

      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('set a position on this point')
      );
    });

    it('uses the exact message format from the spec', () => {
      const { result } = renderHook(() => useVerificationGate());

      act(() => {
        result.current.checkVerified('create a story');
      });

      expect(toast.error).toHaveBeenCalledWith(
        'Verify your email to create a story — check your inbox or resend below.'
      );
    });

    it('works correctly for multiple calls with different action labels', () => {
      const { result } = renderHook(() => useVerificationGate());

      act(() => {
        result.current.checkVerified('do action A');
        result.current.checkVerified('do action B');
      });

      expect(toast.error).toHaveBeenCalledTimes(2);
      expect(toast.error).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('do action A')
      );
      expect(toast.error).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('do action B')
      );
    });
  });

  describe('checkVerified — unauthenticated user (null)', () => {
    it('returns false and shows a toast', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isLoading: false,
        sessionChecked: true,
      } as any);

      const { result } = renderHook(() => useVerificationGate());
      let allowed!: boolean;

      act(() => {
        allowed = result.current.checkVerified('set a position');
      });

      expect(allowed).toBe(false);
      expect(toast.error).toHaveBeenCalledTimes(1);
    });
  });
});
