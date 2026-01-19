import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProfilePage } from "./profile-page";
import * as auth from "@/auth";
import * as api from "@/app/data/api";
import type { Profile } from "@/app/types";

vi.mock("@/auth");
vi.mock("@/app/data/api");

// Helper to create properly typed auth mocks
// Uses ReturnType to infer the correct type from useAuth
const createAuthMock = (overrides: {
  user?: Profile | null;
  sessionUserId?: string | null;
  isLoading?: boolean;
  sessionChecked?: boolean;
} = {}): ReturnType<typeof auth.useAuth> => ({
  session: overrides.sessionUserId
    ? ({ user: { id: overrides.sessionUserId } } as ReturnType<typeof auth.useAuth>["session"])
    : null,
  user: overrides.user ?? null,
  isLoading: overrides.isLoading ?? false,
  sessionChecked: overrides.sessionChecked ?? true, // Default to true for tests
  signOut: vi.fn(),
  refreshProfile: vi.fn(),
});

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
    hasPledged: true, // P50: Required for profile/pledge separation
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

      // Mock useAuth to simulate loading state
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ isLoading: true })
      );

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      // Should show loading state, NOT "Profile Not Found"
      await waitFor(() => {
        expect(screen.getByText(/Loading profile.../i)).toBeInTheDocument();
        expect(screen.queryByText(/Profile Not Found/i)).not.toBeInTheDocument();
      });
    });

    it("should show profile when user loads after initial public profile fetch fails", async () => {
      // This test simulates the complete flow:
      // 1. Public profile fetch completes with 404
      // 2. User auth resolves with profile
      // 3. Component should show "Profile Not Found" since profile doesn't exist in DB

      // Mock the API to return null initially
      vi.mocked(api.getProfileBySlug).mockResolvedValue(null);
      vi.mocked(api.getProfile).mockResolvedValue(null);

      // Start with user loading
      const useUserSpy = vi.spyOn(auth, "useAuth");
      useUserSpy.mockReturnValue(createAuthMock({ isLoading: true }));

      const { rerender } = render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      // Initially should show loading
      expect(screen.getByText(/Loading profile.../i)).toBeInTheDocument();

      // Simulate user auth completing (profile still doesn't exist in DB)
      useUserSpy.mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );

      // Force re-render with new user state
      rerender(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      // Should show "Profile Not Found" since profile doesn't exist in DB
      await waitFor(() => {
        expect(screen.getByText(/Profile Not Found/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it("should NOT show 'Profile Not Found' while profile is fetching for guest user", async () => {
      // Create a promise that we can control
      let resolveProfile: (value: Profile | null) => void;
      const profilePromise = new Promise<Profile | null>((resolve) => {
        resolveProfile = resolve;
      });

      vi.mocked(api.getProfileBySlug).mockImplementation(() => profilePromise);
      vi.mocked(api.getProfile).mockReturnValue(Promise.resolve(null));

      // User is NOT loading (guest)
      vi.spyOn(auth, "useAuth").mockReturnValue(createAuthMock());

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      // Should initially show loading
      expect(screen.getByText(/Loading profile.../i)).toBeInTheDocument();
      
      // Crucially: Should NOT show "Profile Not Found" yet
      expect(screen.queryByText(/Profile Not Found/i)).not.toBeInTheDocument();

      // Now resolve the profile
      await act(async () => {
          resolveProfile!(mockProfile);
      });

      // Should show profile - new ProfilePage structure
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: mockProfile.name })).toBeInTheDocument();
      });
    });
  });

  describe("Normal Profile Loading", () => {
    it("should load and display a verified profile by slug", async () => {
      vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile);
      vi.spyOn(auth, "useAuth").mockReturnValue(createAuthMock());

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
      vi.spyOn(auth, "useAuth").mockReturnValue(createAuthMock());

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
      vi.spyOn(auth, "useAuth").mockReturnValue(createAuthMock());

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

  describe("Owner vs Visitor Views", () => {
    it("should show owner preview banner for verified profile owner", async () => {
      vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile);
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );

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
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: otherUser, sessionUserId: otherUser.id })
      );

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
    // P50: Welcome dialog moved to PledgePage - test deleted as obsolete
    it("should not show welcome dialog for visitors", async () => {
      const otherUser: Profile = {
        ...mockProfile,
        id: "other-user-id",
      };

      vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile);
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: otherUser, sessionUserId: otherUser.id })
      );

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
      vi.spyOn(auth, "useAuth").mockReturnValue(createAuthMock());

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

      vi.spyOn(auth, "useAuth").mockReturnValue(createAuthMock());

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

  describe("P75: Compact Profile Card Layout", () => {
    it("should display profile in compact horizontal layout with avatar on left", async () => {
      vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile);
      vi.spyOn(auth, "useAuth").mockReturnValue(createAuthMock());

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        // Should have the profile card with data-testid
        expect(screen.getByTestId("compact-profile-card")).toBeInTheDocument();
      }, { timeout: 3000 });

      // P76: Avatar is now rendered via GravatarAvatar component
      // Avatar container should be present
      const avatarContainer = screen.getByTestId("avatar-container");
      expect(avatarContainer).toBeInTheDocument();
    });

    it("should show share button with accessible label", async () => {
      vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile);
      vi.spyOn(auth, "useAuth").mockReturnValue(createAuthMock());

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /share profile/i })).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it("should copy profile URL to clipboard when share button is clicked", async () => {
      vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile);
      vi.spyOn(auth, "useAuth").mockReturnValue(createAuthMock());

      // Mock clipboard API
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: mockWriteText },
      });

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /share profile/i })).toBeInTheDocument();
      }, { timeout: 3000 });

      const shareButton = screen.getByRole("button", { name: /share profile/i });
      await act(async () => {
        shareButton.click();
      });

      expect(mockWriteText).toHaveBeenCalledWith(
        expect.stringContaining("/p/test-user")
      );
    });

    it("should handle clipboard error gracefully", async () => {
      vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile);
      vi.spyOn(auth, "useAuth").mockReturnValue(createAuthMock());

      // Mock clipboard API to reject
      const mockWriteText = vi.fn().mockRejectedValue(new Error("Clipboard access denied"));
      Object.assign(navigator, {
        clipboard: { writeText: mockWriteText },
      });

      // Mock console.error to avoid test noise (component doesn't log, but just in case)
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /share profile/i })).toBeInTheDocument();
      }, { timeout: 3000 });

      const shareButton = screen.getByRole("button", { name: /share profile/i });

      // Should not throw - error is handled gracefully
      await act(async () => {
        shareButton.click();
      });

      expect(mockWriteText).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    // P76: Updated tests to check for GravatarAvatar pledger ring distinction
    it("should show pledger ring for pledgers", async () => {
      vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile);
      vi.spyOn(auth, "useAuth").mockReturnValue(createAuthMock());

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        // P76: GravatarAvatar shows blue ring for pledgers
        const avatar = screen.getByTestId("gravatar-avatar");
        expect(avatar.className).toMatch(/ring-(blue-500|\[3px\]|3)/);
      }, { timeout: 3000 });
    });

    it("should NOT show pledger ring for non-pledgers", async () => {
      const nonPledgerProfile = { ...mockProfile, hasPledged: false };
      vi.mocked(api.getProfileBySlug).mockResolvedValue(nonPledgerProfile);
      vi.spyOn(auth, "useAuth").mockReturnValue(createAuthMock());

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId("compact-profile-card")).toBeInTheDocument();
      }, { timeout: 3000 });

      // P76: Non-pledgers should NOT have the pledger ring
      const avatar = screen.getByTestId("gravatar-avatar");
      expect(avatar.className).not.toMatch(/ring-blue-500/);
    });

    it("should show 'View My Pledge' button for owner who has pledged", async () => {
      vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile);
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("link", { name: /view my pledge/i })).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it("should show 'Take the Pledge' button for owner who has NOT pledged", async () => {
      const nonPledgerProfile = { ...mockProfile, hasPledged: false };
      vi.mocked(api.getProfileBySlug).mockResolvedValue(nonPledgerProfile);
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: nonPledgerProfile, sessionUserId: nonPledgerProfile.id })
      );

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("link", { name: /take the pledge/i })).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it("should show 'View their pledge' link for visitor viewing pledger", async () => {
      const otherUser: Profile = {
        ...mockProfile,
        id: "other-user-id",
        slug: "other-user",
      };
      vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile);
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: otherUser, sessionUserId: otherUser.id })
      );

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("link", { name: /view their pledge/i })).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it("should NOT show pledge section for visitor viewing non-pledger", async () => {
      const nonPledgerProfile = { ...mockProfile, hasPledged: false };
      const otherUser: Profile = {
        ...mockProfile,
        id: "other-user-id",
        slug: "other-user",
      };
      vi.mocked(api.getProfileBySlug).mockResolvedValue(nonPledgerProfile);
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: otherUser, sessionUserId: otherUser.id })
      );

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId("compact-profile-card")).toBeInTheDocument();
      }, { timeout: 3000 });

      // Should NOT show any pledge-related content
      expect(screen.queryByRole("link", { name: /view their pledge/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /take the pledge/i })).not.toBeInTheDocument();
    });

    it("should show profile image when avatarUrl is provided", async () => {
      const profileWithPhoto = {
        ...mockProfile,
        avatarUrl: "https://example.com/photo.jpg",
      };
      vi.mocked(api.getProfileBySlug).mockResolvedValue(profileWithPhoto);
      vi.spyOn(auth, "useAuth").mockReturnValue(createAuthMock());

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId("compact-profile-card")).toBeInTheDocument();
      }, { timeout: 3000 });

      // Should show img element with the avatarUrl
      const avatarImg = screen.getByRole("img", { name: /test user/i });
      expect(avatarImg).toBeInTheDocument();
      expect(avatarImg).toHaveAttribute("src", "https://example.com/photo.jpg");
    });

    it("should show initials fallback when avatarUrl is NOT provided", async () => {
      // mockProfile doesn't have avatarUrl
      vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile);
      vi.spyOn(auth, "useAuth").mockReturnValue(createAuthMock());

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId("compact-profile-card")).toBeInTheDocument();
      }, { timeout: 3000 });

      // P76: GravatarAvatar shows initials "TU" for "Test User" via getInitials utility
      expect(screen.getByText("TU")).toBeInTheDocument();
      // Should NOT have an img element with the user's name
      expect(screen.queryByRole("img", { name: /test user/i })).not.toBeInTheDocument();
    });
  });

  describe("Events Section", () => {
    it("should show events section with upcoming events when profile hosts events", async () => {
      const profileWithEvents = {
        ...mockProfile,
        upcomingEvents: [
          {
            id: "event-1",
            slug: "test-event",
            title: "Test Event",
            datetime: new Date(Date.now() + 86400000).toISOString(), // tomorrow
            hostId: mockProfile.id,
          },
        ],
      };

      vi.mocked(api.getProfileBySlug).mockResolvedValue(profileWithEvents);
      vi.spyOn(auth, "useAuth").mockReturnValue(createAuthMock());

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /events/i })).toBeInTheDocument();
        expect(screen.getByText("Test Event")).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it("should show 'No upcoming events' with 'Host an event' link for owner with no events", async () => {
      vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile);
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /events/i })).toBeInTheDocument();
        expect(screen.getByText(/no upcoming events/i)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /host an event/i })).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it("should show 'No upcoming events' WITHOUT 'Host an event' link for visitors", async () => {
      const otherUser: Profile = {
        ...mockProfile,
        id: "other-user-id",
        slug: "other-user",
      };

      vi.mocked(api.getProfileBySlug).mockResolvedValue(mockProfile);
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: otherUser, sessionUserId: otherUser.id })
      );

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /events/i })).toBeInTheDocument();
        expect(screen.getByText(/no upcoming events/i)).toBeInTheDocument();
      }, { timeout: 3000 });

      // Visitor should NOT see the "Host an event" link
      expect(screen.queryByRole("link", { name: /host an event/i })).not.toBeInTheDocument();
    });
  });

  describe("Resend Verification Email", () => {
    it("should call createProfile with correct parameters when resending verification", async () => {
      // P50: Unverified owner viewing their profile sees resend button
      const unverifiedProfile: Profile = {
        ...mockProfile,
        isVerified: false,
      };

      vi.mocked(api.getProfileBySlug).mockResolvedValue(unverifiedProfile);
      vi.mocked(api.createProfile).mockResolvedValue();
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: unverifiedProfile, sessionUserId: unverifiedProfile.id })
      );

      render(
        <MemoryRouter initialEntries={["/p/test-user"]}>
          <Routes>
            <Route path="/p/:id" element={<ProfilePage />} />
          </Routes>
        </MemoryRouter>
      );

      // Should show verification prompt for unverified owner
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /Verify Your Email/i })).toBeInTheDocument();
      });

      // Click resend button
      const resendButton = screen.getByRole("button", { name: /Resend Verification Email/i });
      await act(async () => {
        resendButton.click();
      });

      // Verify createProfile was called with ALL required parameters (not just email)
      await waitFor(() => {
        expect(api.createProfile).toHaveBeenCalledWith(
          unverifiedProfile.name,
          unverifiedProfile.email,
          unverifiedProfile.role,
          unverifiedProfile.linkedinUrl,
          unverifiedProfile.reason
        );
      });
    });
  });
});
