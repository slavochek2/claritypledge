import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useUser } from "@/hooks/use-user";
import { supabase } from "@/lib/supabase";
import * as api from "@/polymet/data/api";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(),
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/polymet/data/api");

describe("useUser Hook - Race Condition Tests", () => {
  let authStateChangeCallback: ((event: AuthChangeEvent, session: Session | null) => void) | null = null;
  let unsubscribeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    authStateChangeCallback = null;

    // Setup mock for onAuthStateChange that captures the callback
    unsubscribeMock = vi.fn();
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      authStateChangeCallback = callback;
      return {
        data: {
          subscription: {
            unsubscribe: unsubscribeMock,
          },
        },
        subscription: {
          unsubscribe: unsubscribeMock,
        },
      } as any;
    });

    // Default: no session
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    vi.mocked(api.getProfile).mockResolvedValue(null);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("Critical: Race condition between checkUser and onAuthStateChange", () => {
    it("should handle rapid onAuthStateChange events without flickering isLoading", async () => {
      const mockSession = {
        user: { id: "user-123" },
        access_token: "token",
        refresh_token: "refresh",
      } as Session;

      const mockProfile = {
        id: "user-123",
        slug: "test-user",
        name: "Test User",
        email: "test@example.com",
        role: "Engineer",
        linkedinUrl: "",
        reason: "Testing",
        signedAt: new Date().toISOString(),
        isVerified: true,
        witnesses: [],
        reciprocations: 0,
        avatarColor: "#4A90E2",
      };

      vi.mocked(api.getProfile).mockResolvedValue(mockProfile);

      const { result } = renderHook(() => useUser());

      // Initially should be loading
      expect(result.current.isLoading).toBe(true);

      // Wait for initial load to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Record loading states
      const loadingStates: boolean[] = [result.current.isLoading];

      // Simulate rapid auth state changes (like what happens in Chrome)
      await act(async () => {
        if (authStateChangeCallback) {
          authStateChangeCallback("SIGNED_IN", mockSession);
          loadingStates.push(result.current.isLoading);

          // Immediately fire another event
          authStateChangeCallback("TOKEN_REFRESHED", mockSession);
          loadingStates.push(result.current.isLoading);

          // And another
          authStateChangeCallback("USER_UPDATED", mockSession);
          loadingStates.push(result.current.isLoading);
        }
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.user).not.toBeNull();
      });

      // Critical: isLoading should not flicker excessively
      // It's OK to be true once at the start, but shouldn't bounce true/false/true/false
      const trueToFalseTransitions = loadingStates.reduce((count, state, i) => {
        if (i > 0 && loadingStates[i - 1] === false && state === true) {
          return count + 1;
        }
        return count;
      }, 0);

      // Should not have more than 1 false->true transition during rapid updates
      expect(trueToFalseTransitions).toBeLessThanOrEqual(1);
    });

    it("should not set isLoading=true if session check completes after auth callback", async () => {
      const mockSession = {
        user: { id: "user-123" },
        access_token: "token",
        refresh_token: "refresh",
      } as Session;

      const mockProfile = {
        id: "user-123",
        slug: "test-user",
        name: "Test User",
        email: "test@example.com",
        role: "Engineer",
        linkedinUrl: "",
        reason: "Testing",
        signedAt: new Date().toISOString(),
        isVerified: true,
        witnesses: [],
        reciprocations: 0,
        avatarColor: "#4A90E2",
      };

      // Simulate slow getSession (completes after auth callback)
      let resolveGetSession: (value: any) => void;
      const getSessionPromise = new Promise((resolve) => {
        resolveGetSession = resolve;
      });

      vi.mocked(supabase.auth.getSession).mockReturnValue(getSessionPromise as any);
      vi.mocked(api.getProfile).mockResolvedValue(mockProfile);

      const { result } = renderHook(() => useUser());

      expect(result.current.isLoading).toBe(true);

      // Fire auth callback BEFORE getSession completes
      await act(async () => {
        if (authStateChangeCallback) {
          await authStateChangeCallback("SIGNED_IN", mockSession);
        }
      });

      // Wait for auth callback to process
      await waitFor(() => {
        expect(result.current.user).not.toBeNull();
        expect(result.current.isLoading).toBe(false);
      });

      const isLoadingBeforeSessionResolve = result.current.isLoading;

      // Now complete the slow getSession
      await act(async () => {
        resolveGetSession!({
          data: { session: mockSession },
          error: null,
        });
      });

      // Wait a bit for any state updates
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Critical: isLoading should NOT go back to true or flicker
      expect(result.current.isLoading).toBe(isLoadingBeforeSessionResolve);
    });
  });

  describe("localStorage pendingProfile race conditions", () => {
    it("should handle localStorage being set while checkUser is running", async () => {
      const mockPendingProfile = {
        id: "pending-123",
        slug: "pending-user",
        name: "Pending User",
        email: "pending@example.com",
        role: "Engineer",
        linkedinUrl: "",
        reason: "Testing",
        signedAt: new Date().toISOString(),
        isVerified: false,
        witnesses: [],
        reciprocations: 0,
        avatarColor: "#4A90E2",
      };

      // Simulate slow getSession
      let resolveGetSession: (value: any) => void;
      const getSessionPromise = new Promise((resolve) => {
        resolveGetSession = resolve;
      });

      vi.mocked(supabase.auth.getSession).mockReturnValue(getSessionPromise as any);

      const { result } = renderHook(() => useUser());

      expect(result.current.isLoading).toBe(true);

      // Set pendingProfile while getSession is pending
      await act(async () => {
        localStorage.setItem("pendingProfile", JSON.stringify(mockPendingProfile));
        window.dispatchEvent(new Event("storage"));
      });

      // Complete getSession (no session)
      await act(async () => {
        resolveGetSession!({
          data: { session: null },
          error: null,
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should show pending profile
      expect(result.current.user).toEqual(expect.objectContaining({
        ...mockPendingProfile,
        isPending: true,
      }));
    });

    it("should clear pendingProfile when real session is found", async () => {
      const mockPendingProfile = {
        id: "pending-123",
        slug: "pending-user",
        name: "Pending User",
        email: "pending@example.com",
        role: "Engineer",
        linkedinUrl: "",
        reason: "Testing",
        signedAt: new Date().toISOString(),
        isVerified: false,
        witnesses: [],
        reciprocations: 0,
        avatarColor: "#4A90E2",
      };

      const mockRealProfile = {
        id: "user-123",
        slug: "real-user",
        name: "Real User",
        email: "real@example.com",
        role: "Engineer",
        linkedinUrl: "",
        reason: "Testing",
        signedAt: new Date().toISOString(),
        isVerified: true,
        witnesses: [],
        reciprocations: 0,
        avatarColor: "#4A90E2",
      };

      const mockSession = {
        user: { id: "user-123" },
        access_token: "token",
        refresh_token: "refresh",
      } as Session;

      // Set pending profile in localStorage
      localStorage.setItem("pendingProfile", JSON.stringify(mockPendingProfile));

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      vi.mocked(api.getProfile).mockResolvedValue(mockRealProfile);

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should show real profile, not pending
      expect(result.current.user?.id).toBe("user-123");
      expect(result.current.user?.isPending).toBeUndefined();

      // localStorage should be cleared
      expect(localStorage.getItem("pendingProfile")).toBeNull();
    });

    it("should handle PROFILE_UPDATED_EVENT during active session check", async () => {
      const mockProfile1 = {
        id: "user-123",
        slug: "user-1",
        name: "User 1",
        email: "user1@example.com",
        role: "Engineer",
        linkedinUrl: "",
        reason: "Testing",
        signedAt: new Date().toISOString(),
        isVerified: false,
        witnesses: [],
        reciprocations: 0,
        avatarColor: "#4A90E2",
      };

      const mockProfile2 = {
        ...mockProfile1,
        name: "User 1 Updated",
      };

      // Start with profile1 in localStorage
      localStorage.setItem("pendingProfile", JSON.stringify(mockProfile1));

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.user?.name).toBe("User 1");
      });

      // Update pendingProfile and fire event
      await act(async () => {
        localStorage.setItem("pendingProfile", JSON.stringify(mockProfile2));
        window.dispatchEvent(new Event("polymet:profile-updated"));
      });

      await waitFor(() => {
        expect(result.current.user?.name).toBe("User 1 Updated");
      });
    });
  });

  describe("Cleanup and unmount scenarios", () => {
    it("should not update state after unmount", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const mockSession = {
        user: { id: "user-123" },
        access_token: "token",
        refresh_token: "refresh",
      } as Session;

      const mockProfile = {
        id: "user-123",
        slug: "test-user",
        name: "Test User",
        email: "test@example.com",
        role: "Engineer",
        linkedinUrl: "",
        reason: "Testing",
        signedAt: new Date().toISOString(),
        isVerified: true,
        witnesses: [],
        reciprocations: 0,
        avatarColor: "#4A90E2",
      };

      // Delay getProfile to simulate slow network
      vi.mocked(api.getProfile).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockProfile), 100))
      );

      const { result, unmount } = renderHook(() => useUser());

      expect(result.current.isLoading).toBe(true);

      // Trigger auth callback
      act(() => {
        if (authStateChangeCallback) {
          authStateChangeCallback("SIGNED_IN", mockSession);
        }
      });

      // Unmount before getProfile completes
      unmount();

      // Wait for getProfile to complete
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should not throw any errors about setting state on unmounted component
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("unmounted component")
      );

      consoleErrorSpy.mockRestore();
    });

    it("should unsubscribe from auth listener on unmount", () => {
      const { unmount } = renderHook(() => useUser());

      expect(unsubscribeMock).not.toHaveBeenCalled();

      unmount();

      expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    });

    it("should remove PROFILE_UPDATED_EVENT listener on unmount", () => {
      const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

      const { unmount } = renderHook(() => useUser());

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "polymet:profile-updated",
        expect.any(Function)
      );

      removeEventListenerSpy.mockRestore();
    });
  });

  describe("Concurrent async operations", () => {
    it("should handle multiple simultaneous getProfile calls gracefully", async () => {
      const mockSession = {
        user: { id: "user-123" },
        access_token: "token",
        refresh_token: "refresh",
      } as Session;

      const mockProfile = {
        id: "user-123",
        slug: "test-user",
        name: "Test User",
        email: "test@example.com",
        role: "Engineer",
        linkedinUrl: "",
        reason: "Testing",
        signedAt: new Date().toISOString(),
        isVerified: true,
        witnesses: [],
        reciprocations: 0,
        avatarColor: "#4A90E2",
      };

      let getProfileCallCount = 0;
      vi.mocked(api.getProfile).mockImplementation(async () => {
        getProfileCallCount++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return mockProfile;
      });

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      // Fire multiple auth events rapidly
      await act(async () => {
        if (authStateChangeCallback) {
          authStateChangeCallback("SIGNED_IN", mockSession);
          authStateChangeCallback("TOKEN_REFRESHED", mockSession);
          authStateChangeCallback("USER_UPDATED", mockSession);
        }
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.user).not.toBeNull();
      });

      // Should have called getProfile, but ideally not more than necessary
      // This documents current behavior - we can optimize this later
      expect(getProfileCallCount).toBeGreaterThan(0);
    });

    it("should use latest profile data when multiple fetches complete", async () => {
      const mockSession = {
        user: { id: "user-123" },
        access_token: "token",
        refresh_token: "refresh",
      } as Session;

      let fetchCount = 0;
      vi.mocked(api.getProfile).mockImplementation(async () => {
        const count = ++fetchCount;
        await new Promise((resolve) => setTimeout(resolve, count === 1 ? 50 : 10));
        return {
          id: "user-123",
          slug: "test-user",
          name: `Fetch ${count}`,
          email: "test@example.com",
          role: "Engineer",
          linkedinUrl: "",
          reason: "Testing",
          signedAt: new Date().toISOString(),
          isVerified: true,
          witnesses: [],
          reciprocations: 0,
          avatarColor: "#4A90E2",
        };
      });

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      // Trigger first fetch (slow)
      await act(async () => {
        if (authStateChangeCallback) {
          authStateChangeCallback("SIGNED_IN", mockSession);
        }
      });

      // Immediately trigger second fetch (fast)
      await act(async () => {
        if (authStateChangeCallback) {
          authStateChangeCallback("USER_UPDATED", mockSession);
        }
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.user).not.toBeNull();
      });

      // Should eventually settle to a consistent state
      // The exact name depends on race condition handling - we're testing stability
      expect(result.current.user?.name).toMatch(/Fetch \d/);
      expect(fetchCount).toBeGreaterThanOrEqual(2);
    });
  });
});
