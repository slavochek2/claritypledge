/**
 * @file useVerificationGate.test.ts
 * @description Unit tests for useVerificationGate hook (updated for P396)
 *
 * P396 contract (two-state model):
 * - checkVerified() returns true for any authenticated user (!!user — verified by definition)
 * - checkVerified() returns false for unauthenticated user (user === null)
 * - Toast message is "Sign in to {actionLabel}." (was "Verify your email to...")
 * - The action label appears in the toast message
 * - Multiple calls work independently (no stale closure)
 *
 * Removed: "unverified user" test block — unverified-profile state is eliminated by P396.
 * In the two-state model, any authenticated user IS verified.
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

  describe('checkVerified — authenticated user', () => {
    it('returns true and shows no toast', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-1' } as any, // any truthy user = authenticated = verified
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

  describe('checkVerified — unauthenticated user (null)', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: null,
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

    it('uses the exact message format: "Sign in to {actionLabel}."', () => {
      const { result } = renderHook(() => useVerificationGate());

      act(() => {
        result.current.checkVerified('create a story');
      });

      expect(toast.error).toHaveBeenCalledWith('Sign in to create a story.');
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
});
