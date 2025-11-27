import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ClarityNavigation } from "@/polymet/components/clarity-navigation";
import * as useUser from "@/hooks/use-user";

vi.mock("@/hooks/use-user");

describe("Navigation Loading States - Menu Visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Critical: Menu must never disappear during loading", () => {
    it("should show public menu when loading is true and user is null", async () => {
      // This is the critical case: during initial load, show public menu
      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: null,
        isLoading: true,
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter>
          <ClarityNavigation />
        </MemoryRouter>
      );

      // Public menu links should be visible even during loading
      // We should NOT hide the entire navigation
      await waitFor(() => {
        // Logo should always be visible
        expect(screen.getByText("Clarity Pledge")).toBeInTheDocument();
      });

      // The menu should render SOMETHING - not be completely empty
      const nav = screen.getByRole("navigation");
      expect(nav).toBeInTheDocument();
    });

    it("should maintain menu visibility during rapid loading state changes", async () => {
      // Simulate rapid state changes: loading -> loaded -> loading
      const useUserSpy = vi.spyOn(useUser, "useUser");

      // Start: loading
      useUserSpy.mockReturnValue({
        user: null,
        isLoading: true,
        signOut: vi.fn(),
      });

      const { rerender } = render(
        <MemoryRouter>
          <ClarityNavigation />
        </MemoryRouter>
      );

      // Verify menu exists
      expect(screen.getByText("Clarity Pledge")).toBeInTheDocument();

      // Change to: loaded, no user (show public menu)
      useUserSpy.mockReturnValue({
        user: null,
        isLoading: false,
        signOut: vi.fn(),
      });

      rerender(
        <MemoryRouter>
          <ClarityNavigation />
        </MemoryRouter>
      );

      // Public menu should be visible
      await waitFor(() => {
        expect(screen.getByText("Manifesto")).toBeInTheDocument();
        expect(screen.getByText("Clarity Champions")).toBeInTheDocument();
        expect(screen.getByText("Our Services")).toBeInTheDocument();
      });

      // Change back to: loading again (simulating race condition)
      useUserSpy.mockReturnValue({
        user: null,
        isLoading: true,
        signOut: vi.fn(),
      });

      rerender(
        <MemoryRouter>
          <ClarityNavigation />
        </MemoryRouter>
      );

      // Menu should STILL be visible during this loading state
      expect(screen.getByText("Clarity Pledge")).toBeInTheDocument();

      // Critical: Navigation should not disappear completely
      const nav = screen.getByRole("navigation");
      expect(nav).toBeInTheDocument();
      expect(nav.textContent).not.toBe(""); // Should have content
    });

    it("should handle transition from logged-out to loading to logged-in", async () => {
      const useUserSpy = vi.spyOn(useUser, "useUser");
      const mockUser = {
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

      // Start: logged out
      useUserSpy.mockReturnValue({
        user: null,
        isLoading: false,
        signOut: vi.fn(),
      });

      const { rerender } = render(
        <MemoryRouter>
          <ClarityNavigation />
        </MemoryRouter>
      );

      // Should show public menu
      expect(screen.getByText("Log In")).toBeInTheDocument();

      // Transition to loading
      useUserSpy.mockReturnValue({
        user: null,
        isLoading: true,
        signOut: vi.fn(),
      });

      rerender(
        <MemoryRouter>
          <ClarityNavigation />
        </MemoryRouter>
      );

      // Menu should still be visible during loading
      expect(screen.getByText("Clarity Pledge")).toBeInTheDocument();

      // Transition to logged in
      useUserSpy.mockReturnValue({
        user: mockUser,
        isLoading: false,
        signOut: vi.fn(),
      });

      rerender(
        <MemoryRouter>
          <ClarityNavigation />
        </MemoryRouter>
      );

      // Should show user menu
      await waitFor(() => {
        const menuButton = screen.getByRole("button", { name: /menu/i });
        expect(menuButton).toBeInTheDocument();
      });
    });
  });

  describe("Menu content during different states", () => {
    it("should show public menu when not loading and no user", async () => {
      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: null,
        isLoading: false,
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter>
          <ClarityNavigation />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Manifesto")).toBeInTheDocument();
        expect(screen.getByText("Clarity Champions")).toBeInTheDocument();
        expect(screen.getByText("Our Services")).toBeInTheDocument();
        expect(screen.getByText("Log In")).toBeInTheDocument();
        expect(screen.getByText("Take the Pledge")).toBeInTheDocument();
      });
    });

    it("should show user menu when not loading and user exists", async () => {
      const mockUser = {
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

      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: mockUser,
        isLoading: false,
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter>
          <ClarityNavigation />
        </MemoryRouter>
      );

      await waitFor(() => {
        // Should NOT show public menu
        expect(screen.queryByText("Manifesto")).not.toBeInTheDocument();
        expect(screen.queryByText("Log In")).not.toBeInTheDocument();

        // Should show user menu trigger
        const menuButton = screen.getByRole("button", { name: /menu/i });
        expect(menuButton).toBeInTheDocument();
      });
    });

    it("should handle pending profile correctly", async () => {
      const mockPendingUser = {
        id: "user-123",
        slug: "test-user",
        name: "Test User",
        email: "test@example.com",
        role: "Engineer",
        linkedinUrl: "",
        reason: "Testing",
        signedAt: new Date().toISOString(),
        isVerified: false,
        isPending: true,
        witnesses: [],
        reciprocations: 0,
        avatarColor: "#4A90E2",
      };

      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: mockPendingUser,
        isLoading: false,
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter>
          <ClarityNavigation />
        </MemoryRouter>
      );

      await waitFor(() => {
        // Should show user menu for pending users too
        const menuButton = screen.getByRole("button", { name: /menu/i });
        expect(menuButton).toBeInTheDocument();
      });
    });
  });

  describe("Edge cases and race conditions", () => {
    it("should handle multiple rapid rerenders without losing menu", async () => {
      const useUserSpy = vi.spyOn(useUser, "useUser");

      useUserSpy.mockReturnValue({
        user: null,
        isLoading: true,
        signOut: vi.fn(),
      });

      const { rerender } = render(
        <MemoryRouter>
          <ClarityNavigation />
        </MemoryRouter>
      );

      // Simulate 10 rapid state changes
      for (let i = 0; i < 10; i++) {
        useUserSpy.mockReturnValue({
          user: null,
          isLoading: i % 2 === 0, // Toggle loading state
          signOut: vi.fn(),
        });

        rerender(
          <MemoryRouter>
            <ClarityNavigation />
          </MemoryRouter>
        );

        // Menu should always be present
        expect(screen.getByText("Clarity Pledge")).toBeInTheDocument();
      }
    });

    it("should handle user changing from null to defined to null", async () => {
      const useUserSpy = vi.spyOn(useUser, "useUser");
      const mockUser = {
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

      // Start with user
      useUserSpy.mockReturnValue({
        user: mockUser,
        isLoading: false,
        signOut: vi.fn(),
      });

      const { rerender } = render(
        <MemoryRouter>
          <ClarityNavigation />
        </MemoryRouter>
      );

      expect(screen.getByText("Clarity Pledge")).toBeInTheDocument();

      // Remove user (sign out)
      useUserSpy.mockReturnValue({
        user: null,
        isLoading: false,
        signOut: vi.fn(),
      });

      rerender(
        <MemoryRouter>
          <ClarityNavigation />
        </MemoryRouter>
      );

      // Should show public menu
      await waitFor(() => {
        expect(screen.getByText("Log In")).toBeInTheDocument();
      });

      // Add user back (sign in)
      useUserSpy.mockReturnValue({
        user: mockUser,
        isLoading: false,
        signOut: vi.fn(),
      });

      rerender(
        <MemoryRouter>
          <ClarityNavigation />
        </MemoryRouter>
      );

      // Should show user menu
      await waitFor(() => {
        expect(screen.queryByText("Log In")).not.toBeInTheDocument();
        const menuButton = screen.getByRole("button", { name: /menu/i });
        expect(menuButton).toBeInTheDocument();
      });
    });
  });
});
