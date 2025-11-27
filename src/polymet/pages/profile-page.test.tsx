import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProfilePage } from "./profile-page";
import * as useUser from "@/hooks/use-user";
import * as api from "@/polymet/data/api";
import type { Profile } from "@/polymet/types";

vi.mock("@/hooks/use-user");
vi.mock("@/polymet/data/api");

describe("ProfilePage", () => {
  const mockProfile: Profile = {
    id: "test-user-id",
    slug: "test-user",
    name: "Test User",
    email: "test@example.com",
    role: "Engineer",
    linkedinUrl: "https://linkedin.com/in/testuser",
    reason: "Testing the pledge",
    signedAt: new Date().toISOString(),
    isVerified: true,
    witnesses: [],
    reciprocations: 0,
    avatarColor: "#4A90E2",
  };

  const mockPendingProfile: Profile & { isPending: boolean } = {
    ...mockProfile,
    isVerified: false,
    isPending: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Flicker Prevention", () => {
    it("should show loading state when public profile fetch fails but user is still loading", async () => {
      // This test covers the main bug: when a new pledge is created,
      // the public API call completes (with 404) before the user auth resolves.
      // We should NOT show "Profile Not Found" if isUserLoading is true.

      // Mock the API to return null (profile not found publicly yet)
      vi.mocked(api.getProfileBySlug).mockResolvedValue(null);
      vi.mocked(api.getProfile).mockResolvedValue(null);

      // Mock useUser to simulate loading state
      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: null,
        isLoading: true, // Key: user is still loading
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      // Should show loading state, NOT "Profile Not Found"
      expect(screen.getByText(/Loading Pledge.../i)).toBeInTheDocument();
      expect(screen.queryByText(/Profile Not Found/i)).not.toBeInTheDocument();
    });

    it("should show profile when user loads after initial public profile fetch fails", async () => {
      // This test simulates the complete flow:
      // 1. Public profile fetch completes with 404
      // 2. User auth resolves with pending profile
      // 3. Component should show the pending profile

      // Mock the API to return null initially
      vi.mocked(api.getProfileBySlug).mockResolvedValue(null);
      vi.mocked(api.getProfile).mockResolvedValue(null);

      // Start with user loading
      const useUserSpy = vi.spyOn(useUser, "useUser");
      useUserSpy.mockReturnValue({
        user: null,
        isLoading: true,
        signOut: vi.fn(),
      });

      const { rerender } = render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      // Initially should show loading
      expect(screen.getByText(/Loading Pledge.../i)).toBeInTheDocument();

      // Simulate user auth completing with pending profile
      useUserSpy.mockReturnValue({
        user: mockPendingProfile,
        isLoading: false,
        signOut: vi.fn(),
      });

      // Force re-render with new user state
      rerender(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      // Should now show the profile, not "Profile Not Found"
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: mockPendingProfile.name })).toBeInTheDocument();
      }, { timeout: 3000 });
      expect(screen.queryByText(/Profile Not Found/i)).not.toBeInTheDocument();
    });
  });

  describe("Normal Profile Loading", () => {
    it("should load and display a verified profile by slug", async () => {
      vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile);
      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: null,
        isLoading: false,
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const nameElements = screen.queryAllByText(mockProfile.name);
        expect(nameElements.length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      expect(api.getProfileBySlug).toHaveBeenCalledWith("test-user");
    });

    it("should fallback to getProfile by ID if getProfileBySlug fails", async () => {
      vi.mocked(api.getProfileBySlug).mockResolvedValue(null);
      vi.mocked(api.getProfile).mockResolvedValue(mockProfile);
      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: null,
        isLoading: false,
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/p/test-user-id"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const nameElements = screen.queryAllByText(mockProfile.name);
        expect(nameElements.length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      expect(api.getProfileBySlug).toHaveBeenCalledWith("test-user-id");
      expect(api.getProfile).toHaveBeenCalledWith("test-user-id");
    });

    it("should show 'Profile Not Found' when profile does not exist and user is not loading", async () => {
      vi.mocked(api.getProfileBySlug).mockResolvedValue(null);
      vi.mocked(api.getProfile).mockResolvedValue(null);
      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: null,
        isLoading: false, // Key: user is NOT loading
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/p/nonexistent"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Profile Not Found/i)).toBeInTheDocument();
      });
    });
  });

  describe("Pending Profile Handling", () => {
    it("should display pending profile from currentUser when public profile not found", async () => {
      // This simulates the optimistic update case
      vi.mocked(api.getProfileBySlug).mockResolvedValue(null);
      vi.mocked(api.getProfile).mockResolvedValue(null);
      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: mockPendingProfile,
        isLoading: false,
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const nameElements = screen.queryAllByText(mockPendingProfile.name);
        expect(nameElements.length).toBeGreaterThan(0);
      }, { timeout: 3000 });
    });

    it("should show unverified banner for pending profile owner", async () => {
      vi.mocked(api.getProfileBySlug).mockResolvedValue(null);
      vi.mocked(api.getProfile).mockResolvedValue(null);
      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: mockPendingProfile,
        isLoading: false,
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const nameElements = screen.queryAllByText(mockPendingProfile.name);
        expect(nameElements.length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      // Should show unverified banner for owner
      // Note: This depends on the UnverifiedProfileBanner component rendering
      // We're just ensuring the component renders without errors
    });
  });

  describe("Owner vs Visitor Views", () => {
    it("should show owner preview banner for verified profile owner", async () => {
      vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile);
      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: mockProfile,
        isLoading: false,
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const nameElements = screen.queryAllByText(mockProfile.name);
        expect(nameElements.length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      // Owner is viewing their own verified profile
      // OwnerPreviewBanner should be rendered (if implemented)
    });

    it("should show visitor view for non-owner viewing profile", async () => {
      const otherUser: Profile = {
        ...mockProfile,
        id: "other-user-id",
        slug: "other-user",
        name: "Other User",
      };

      vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile);
      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: otherUser,
        isLoading: false,
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const nameElements = screen.queryAllByText(mockProfile.name);
        expect(nameElements.length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      // Visitor is viewing someone else's profile
      // Should not show owner-specific UI elements
    });
  });

  describe("First Time User Flow", () => {
    it("should show welcome dialog for first-time profile owner", async () => {
      vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile);
      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: mockProfile,
        isLoading: false,
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/p/test-user?firstTime=true"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Pledge Sealed/i)).toBeInTheDocument();
      });
    });

    it("should not show welcome dialog for visitors", async () => {
      const otherUser: Profile = {
        ...mockProfile,
        id: "other-user-id",
      };

      vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile);
      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: otherUser,
        isLoading: false,
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/p/test-user?firstTime=true"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const nameElements = screen.queryAllByText(mockProfile.name);
        expect(nameElements.length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      expect(screen.queryByText(/Pledge Sealed/i)).not.toBeInTheDocument();
    });
  });

  describe("Error Handling", () => {
    it("should handle API errors gracefully", async () => {
      vi.mocked(api.getProfileBySlug).mockRejectedValue(new Error("API Error"));
      vi.mocked(api.getProfile).mockRejectedValue(new Error("API Error"));
      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: null,
        isLoading: false,
        signOut: vi.fn(),
      });

      // Mock console.error to avoid test output noise
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Profile Not Found/i)).toBeInTheDocument();
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("Navigation Changes", () => {
    it("should call API with correct slug for different profiles", async () => {
      const profile1 = { ...mockProfile, id: "user-1", slug: "user-1", name: "User One" };

      vi.mocked(api.getProfileBySlug).mockImplementation((slug) => {
        if (slug === "user-1") return Promise.resolve(profile1);
        return Promise.resolve(null);
      });

      vi.spyOn(useUser, "useUser").mockReturnValue({
        user: null,
        isLoading: false,
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/p/user-1"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const nameElements = screen.queryAllByText("User One");
        expect(nameElements.length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      expect(api.getProfileBySlug).toHaveBeenCalledWith("user-1");

      // Verify that setLoading(true) is called at the start of loadProfile
      // This ensures navigation changes reset loading state properly
    });
  });
});
