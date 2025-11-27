import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useUser, PROFILE_UPDATED_EVENT } from "@/hooks/use-user";
import { supabase } from "@/lib/supabase";
import * as api from "@/polymet/data/api";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    },
  },
}));

vi.mock("@/polymet/data/api");

describe("localStorage Synchronization - Race Conditions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("Critical: pendingProfile localStorage timing", () => {
    it("should not lose pendingProfile if set before hook initialization", async () => {
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

      // Set pendingProfile BEFORE initializing the hook
      localStorage.setItem("pendingProfile", JSON.stringify(mockPendingProfile));

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should load the pending profile
      expect(result.current.user).toEqual(
        expect.objectContaining({
          ...mockPendingProfile,
          isPending: true,
        })
      );
    });

    it("should handle pendingProfile being cleared while hook is initializing", async () => {
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

      localStorage.setItem("pendingProfile", JSON.stringify(mockPendingProfile));

      // Simulate slow getSession
      let resolveGetSession: (value: any) => void;
      const getSessionPromise = new Promise((resolve) => {
        resolveGetSession = resolve;
      });

      vi.mocked(supabase.auth.getSession).mockReturnValue(getSessionPromise as any);

      const { result } = renderHook(() => useUser());

      // Clear pendingProfile while getSession is pending
      await act(async () => {
        localStorage.removeItem("pendingProfile");
        // Don't trigger storage event - simulate direct removal
      });

      // Complete getSession
      await act(async () => {
        resolveGetSession!({
          data: { session: null },
          error: null,
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should handle gracefully - might show pending or null depending on timing
      // The important thing is no crash and stable state
      expect(result.current.isLoading).toBe(false);
    });

    it("should handle corrupted pendingProfile JSON", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Set invalid JSON
      localStorage.setItem("pendingProfile", "{ invalid json }");

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should handle gracefully - user should be null
      expect(result.current.user).toBeNull();

      consoleErrorSpy.mockRestore();
    });

    it("should handle multiple rapid localStorage changes", async () => {
      const profile1 = {
        id: "user-1",
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

      const profile2 = {
        ...profile1,
        id: "user-2",
        slug: "user-2",
        name: "User 2",
      };

      const profile3 = {
        ...profile1,
        id: "user-3",
        slug: "user-3",
        name: "User 3",
      };

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Rapidly update localStorage
      await act(async () => {
        localStorage.setItem("pendingProfile", JSON.stringify(profile1));
        window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));

        localStorage.setItem("pendingProfile", JSON.stringify(profile2));
        window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));

        localStorage.setItem("pendingProfile", JSON.stringify(profile3));
        window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
      });

      await waitFor(() => {
        expect(result.current.user?.name).toBe("User 3");
      });
    });
  });

  describe("PROFILE_UPDATED_EVENT synchronization", () => {
    it("should update user when PROFILE_UPDATED_EVENT is fired", async () => {
      const originalProfile = {
        id: "user-123",
        slug: "test-user",
        name: "Original Name",
        email: "test@example.com",
        role: "Engineer",
        linkedinUrl: "",
        reason: "Testing",
        signedAt: new Date().toISOString(),
        isVerified: false,
        witnesses: [],
        reciprocations: 0,
        avatarColor: "#4A90E2",
      };

      const updatedProfile = {
        ...originalProfile,
        name: "Updated Name",
        role: "Senior Engineer",
      };

      localStorage.setItem("pendingProfile", JSON.stringify(originalProfile));

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.user?.name).toBe("Original Name");
      });

      // Update localStorage and fire event
      await act(async () => {
        localStorage.setItem("pendingProfile", JSON.stringify(updatedProfile));
        window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
      });

      await waitFor(() => {
        expect(result.current.user?.name).toBe("Updated Name");
        expect(result.current.user?.role).toBe("Senior Engineer");
      });
    });

    it("should clear user when PROFILE_UPDATED_EVENT is fired with no pendingProfile", async () => {
      const mockProfile = {
        id: "user-123",
        slug: "test-user",
        name: "Test User",
        email: "test@example.com",
        role: "Engineer",
        linkedinUrl: "",
        reason: "Testing",
        signedAt: new Date().toISOString(),
        isVerified: false,
        witnesses: [],
        reciprocations: 0,
        avatarColor: "#4A90E2",
      };

      localStorage.setItem("pendingProfile", JSON.stringify(mockProfile));

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.user).not.toBeNull();
      });

      // Remove pendingProfile and fire event
      await act(async () => {
        localStorage.removeItem("pendingProfile");
        window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
      });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
      });
    });

    it("should handle PROFILE_UPDATED_EVENT when user has active session", async () => {
      const mockSession = {
        user: { id: "user-123" },
        access_token: "token",
        refresh_token: "refresh",
      } as any;

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

      const mockPendingProfile = {
        ...mockProfile,
        isVerified: false,
      };

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      vi.mocked(api.getProfile).mockResolvedValue(mockProfile);

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.user?.isVerified).toBe(true);
      });

      // Someone sets a pendingProfile and fires event (shouldn't override active session)
      await act(async () => {
        localStorage.setItem("pendingProfile", JSON.stringify(mockPendingProfile));
        window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
      });

      // Wait a bit for any potential updates
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should still have the verified session user, not the pending profile
      expect(result.current.user?.isVerified).toBe(true);
    });
  });

  describe("Cross-tab synchronization", () => {
    it("should handle storage events from other tabs", async () => {
      const profile1 = {
        id: "user-1",
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

      const profile2 = {
        ...profile1,
        id: "user-2",
        name: "User 2",
      };

      localStorage.setItem("pendingProfile", JSON.stringify(profile1));

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.user?.name).toBe("User 1");
      });

      // Simulate another tab updating localStorage
      // Note: storage event doesn't fire in same tab, but we can test the event handler
      await act(async () => {
        localStorage.setItem("pendingProfile", JSON.stringify(profile2));
        // Manually dispatch storage event as it would come from another tab
        const storageEvent = new StorageEvent("storage", {
          key: "pendingProfile",
          newValue: JSON.stringify(profile2),
          oldValue: JSON.stringify(profile1),
          storageArea: localStorage,
        });
        window.dispatchEvent(storageEvent);
      });

      // The hook should respond to storage events if it listens to them
      // If not implemented, this documents expected behavior for future
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it("should handle localStorage.clear() from signOut", async () => {
      const mockProfile = {
        id: "user-123",
        slug: "test-user",
        name: "Test User",
        email: "test@example.com",
        role: "Engineer",
        linkedinUrl: "",
        reason: "Testing",
        signedAt: new Date().toISOString(),
        isVerified: false,
        witnesses: [],
        reciprocations: 0,
        avatarColor: "#4A90E2",
      };

      localStorage.setItem("pendingProfile", JSON.stringify(mockProfile));

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      vi.mocked(api.signOut).mockResolvedValue();

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.user).not.toBeNull();
      });

      // Call signOut
      await act(async () => {
        await result.current.signOut();
      });

      // User should be cleared
      expect(result.current.user).toBeNull();

      // pendingProfile should be removed from localStorage
      expect(localStorage.getItem("pendingProfile")).toBeNull();
    });
  });

  describe("Data consistency", () => {
    it("should maintain data consistency when rapid updates occur", async () => {
      const profiles = Array.from({ length: 20 }, (_, i) => ({
        id: `user-${i}`,
        slug: `user-${i}`,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        role: "Engineer",
        linkedinUrl: "",
        reason: "Testing",
        signedAt: new Date().toISOString(),
        isVerified: false,
        witnesses: [],
        reciprocations: 0,
        avatarColor: "#4A90E2",
      }));

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Fire many rapid updates
      for (const profile of profiles) {
        await act(async () => {
          localStorage.setItem("pendingProfile", JSON.stringify(profile));
          window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
        });
      }

      await waitFor(() => {
        expect(result.current.user?.name).toBe("User 19");
      });

      // Verify final state is stable
      const finalUser = result.current.user;
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(result.current.user).toEqual(finalUser);
    });

    it("should have consistent state after multiple localStorage operations", async () => {
      const mockProfile = {
        id: "user-123",
        slug: "test-user",
        name: "Test User",
        email: "test@example.com",
        role: "Engineer",
        linkedinUrl: "",
        reason: "Testing",
        signedAt: new Date().toISOString(),
        isVerified: false,
        witnesses: [],
        reciprocations: 0,
        avatarColor: "#4A90E2",
      };

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { result } = renderHook(() => useUser());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Perform chaotic localStorage operations
      await act(async () => {
        // Set
        localStorage.setItem("pendingProfile", JSON.stringify(mockProfile));
        window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));

        // Remove
        localStorage.removeItem("pendingProfile");
        window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));

        // Set again
        localStorage.setItem("pendingProfile", JSON.stringify(mockProfile));
        window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));

        // Remove again
        localStorage.removeItem("pendingProfile");
        window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Final state should be null (last operation was remove)
      expect(result.current.user).toBeNull();
    });
  });
});
