import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProfilePage } from "@/polymet/pages/profile-page";
import { ClarityNavigation } from "@/polymet/components/clarity-navigation";
import { ClarityLandingLayout } from "@/polymet/layouts/clarity-landing-layout";
import * as useUser from "@/hooks/use-user";
import * as api from "@/polymet/data/api";

vi.mock("@/hooks/use-user");
vi.mock("@/polymet/data/api");

describe("Unauthenticated User Viewing Shared Profile Link", () => {
  const mockProfile = {
    id: "profile-123",
    slug: "john-doe",
    name: "John Doe",
    email: "john@example.com",
    role: "Software Engineer",
    linkedinUrl: "https://linkedin.com/in/johndoe",
    reason: "I believe in clear communication",
    signedAt: new Date("2024-01-15").toISOString(),
    isVerified: true,
    witnesses: [],
    reciprocations: 0,
    avatarColor: "#4A90E2",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the API to return a profile
    vi.spyOn(api, "getProfileBySlug").mockResolvedValue(mockProfile);
    vi.spyOn(api, "getProfile").mockResolvedValue(mockProfile);
  });

  describe("Critical: Unauthenticated user should see profile without auth delay", () => {
    it("should show public menu immediately when user is not logged in", async () => {
      // Simulate unauthenticated user (finished loading, no user)
      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: null,
        isLoading: false,
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/"]}>
          <ClarityNavigation />
        </MemoryRouter>
      );

      // Public menu should be visible immediately
      await waitFor(() => {
        expect(screen.getByText("Manifesto")).toBeInTheDocument();
        expect(screen.getByText("Clarity Champions")).toBeInTheDocument();
        expect(screen.getByText("Our Services")).toBeInTheDocument();
        expect(screen.getByText("Log In")).toBeInTheDocument();
        expect(screen.getByText("Take the Pledge")).toBeInTheDocument();
      });
    });

    it("should load and display profile without waiting for auth when user is not logged in", async () => {
      // Simulate unauthenticated user
      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: null,
        isLoading: false,
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/p/john-doe"]}>
          <Routes>
            <Route
              path="/p/:id"
              element={
                <ClarityLandingLayout>
                  <ProfilePage />
                </ClarityLandingLayout>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      // Should NOT show "Loading Pledge..." indefinitely
      // Profile should load and display
      await waitFor(
        () => {
          expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );

      // Should not see loading state
      expect(screen.queryByText("Loading Pledge...")).not.toBeInTheDocument();
    });

    it("should show public menu while viewing someone else's profile (not logged in)", async () => {
      // Simulate unauthenticated user
      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: null,
        isLoading: false,
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/p/john-doe"]}>
          <Routes>
            <Route
              path="/p/:id"
              element={
                <ClarityLandingLayout>
                  <ProfilePage />
                </ClarityLandingLayout>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      // Wait for profile to load
      await waitFor(() => {
        expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
      });

      // Public menu should be visible
      expect(screen.getByText("Manifesto")).toBeInTheDocument();
      expect(screen.getByText("Log In")).toBeInTheDocument();
      expect(screen.getByText("Take the Pledge")).toBeInTheDocument();
    });
  });

  describe("Edge case: Menu behavior during loading transitions", () => {
    it("should not show public menu during auth loading (prevent flicker)", async () => {
      // Simulate auth is still loading
      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: null,
        isLoading: true,
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/"]}>
          <ClarityNavigation />
        </MemoryRouter>
      );

      // Logo should be visible
      expect(screen.getByText("Clarity Pledge")).toBeInTheDocument();

      // Public menu links should NOT be visible during loading
      // (to prevent flicker when user logs in)
      expect(screen.queryByText("Manifesto")).not.toBeInTheDocument();
      expect(screen.queryByText("Log In")).not.toBeInTheDocument();
    });

    it("should transition from loading to public menu smoothly", async () => {
      const useUserSpy = vi.spyOn(useUser, "useUser");

      // Start with loading
      useUserSpy.mockReturnValue({
        user: null,
        isLoading: true,
        signOut: vi.fn(),
      });

      const { rerender } = render(
        <MemoryRouter initialEntries={["/"]}>
          <ClarityNavigation />
        </MemoryRouter>
      );

      // During loading, public menu should not be visible
      expect(screen.queryByText("Manifesto")).not.toBeInTheDocument();

      // Finish loading - user is not logged in
      useUserSpy.mockReturnValue({
        user: null,
        isLoading: false,
        signOut: vi.fn(),
      });

      rerender(
        <MemoryRouter initialEntries={["/"]}>
          <ClarityNavigation />
        </MemoryRouter>
      );

      // Now public menu should appear
      await waitFor(() => {
        expect(screen.getByText("Manifesto")).toBeInTheDocument();
        expect(screen.getByText("Log In")).toBeInTheDocument();
      });
    });
  });

  describe("Real-world scenario: Sharing profile link to unauthenticated user", () => {
    it("should handle complete flow: user receives link, clicks it, sees profile with public menu", async () => {
      // User is not logged in and auth has finished checking
      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: null,
        isLoading: false,
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/p/john-doe"]}>
          <Routes>
            <Route
              path="/p/:id"
              element={
                <ClarityLandingLayout>
                  <ProfilePage />
                </ClarityLandingLayout>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      // Profile should load quickly
      await waitFor(
        () => {
          expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );

      // Public menu should be visible
      expect(screen.getByText("Manifesto")).toBeInTheDocument();
      expect(screen.getByText("Clarity Champions")).toBeInTheDocument();
      expect(screen.getByText("Log In")).toBeInTheDocument();

      // Should NOT see user menu
      expect(screen.queryByRole("button", { name: /menu/i })).not.toBeInTheDocument();

      // Should see the profile content
      expect(screen.getByText("Software Engineer")).toBeInTheDocument();
      expect(screen.getByText("I believe in clear communication")).toBeInTheDocument();
    });

    it("should not show 'Loading Pledge...' stuck on screen for unauthenticated users", async () => {
      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: null,
        isLoading: false,
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/p/john-doe"]}>
          <Routes>
            <Route
              path="/p/:id"
              element={
                <ClarityLandingLayout>
                  <ProfilePage />
                </ClarityLandingLayout>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      // Should show loading initially (while fetching profile)
      expect(screen.getByText("Loading Pledge...")).toBeInTheDocument();

      // But should resolve quickly and show profile
      await waitFor(
        () => {
          expect(screen.queryByText("Loading Pledge...")).not.toBeInTheDocument();
          expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );
    });
  });
});
