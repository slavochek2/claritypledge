import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SettingsPage } from "./settings-page";
import { PwaInstallProvider } from "@/hooks/use-pwa-install";
import * as auth from "@/auth";
import * as api from "@/app/data/api";
import type { Profile } from "@/app/types";

// Mock modules
vi.mock("@/auth");
vi.mock("@/app/data/api");
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Helper to create properly typed auth mocks
const createAuthMock = (
  overrides: {
    user?: Profile | null;
    sessionUserId?: string | null;
    isLoading?: boolean;
  } = {}
): ReturnType<typeof auth.useAuth> => ({
  session: overrides.sessionUserId
    ? ({
        user: { id: overrides.sessionUserId },
      } as ReturnType<typeof auth.useAuth>["session"])
    : null,
  user: overrides.user ?? null,
  isLoading: overrides.isLoading ?? false,
  signOut: vi.fn(),
  refreshProfile: vi.fn(),
});

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("SettingsPage", () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderSettingsPage = () => {
    return render(
      <MemoryRouter initialEntries={["/settings"]}>
        <PwaInstallProvider>
          <Routes>
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/sign-pledge" element={<div>Sign Pledge Page</div>} />
          </Routes>
        </PwaInstallProvider>
      </MemoryRouter>
    );
  };

  describe("Route Protection", () => {
    it("should show loading state while auth is loading", () => {
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ isLoading: true })
      );

      renderSettingsPage();

      // Should show branded loading animation (CSS handles anti-flash delay)
      expect(screen.getByRole('img', { name: 'Loading' })).toBeInTheDocument();
    });

    it("should redirect unauthenticated users to /sign-pledge", async () => {
      vi.spyOn(auth, "useAuth").mockReturnValue(createAuthMock());

      renderSettingsPage();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/sign-pledge");
      });
    });

    it("should render settings form for authenticated users", async () => {
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );

      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
      });
    });
  });

  describe("Form Pre-population", () => {
    it("should pre-populate form with current profile data", async () => {
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );

      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockProfile.name)).toBeInTheDocument();
        expect(screen.getByDisplayValue(mockProfile.role!)).toBeInTheDocument();
        expect(screen.getByDisplayValue(mockProfile.linkedinUrl!)).toBeInTheDocument();
        expect(screen.getByDisplayValue(mockProfile.reason!)).toBeInTheDocument();
      });
    });

    it("should handle empty optional fields", async () => {
      const profileWithoutOptionals: Profile = {
        ...mockProfile,
        role: undefined,
        linkedinUrl: undefined,
        reason: undefined,
      };

      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({
          user: profileWithoutOptionals,
          sessionUserId: profileWithoutOptionals.id,
        })
      );

      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockProfile.name)).toBeInTheDocument();
        // Role input should be empty
        const roleInput = screen.getByLabelText(/role/i);
        expect(roleInput).toHaveValue("");
      });
    });
  });

  describe("Name Field Validation", () => {
    it("should show error when name is empty on submit", async () => {
      const user = userEvent.setup();
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );

      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockProfile.name)).toBeInTheDocument();
      });

      // Clear the name field
      const nameInput = screen.getByLabelText(/name/i);
      await user.clear(nameInput);

      // Submit the form
      const submitButton = screen.getByRole("button", { name: /save changes/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Name is required")).toBeInTheDocument();
      });
    });

    it("should have proper aria attributes for name error", async () => {
      const user = userEvent.setup();
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );

      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockProfile.name)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/name/i);
      await user.clear(nameInput);

      const submitButton = screen.getByRole("button", { name: /save changes/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(nameInput).toHaveAttribute("aria-invalid", "true");
        expect(nameInput).toHaveAttribute("aria-describedby", "name-error");
      });
    });
  });

  describe("LinkedIn URL Validation", () => {
    it("should accept valid LinkedIn URLs", async () => {
      const user = userEvent.setup();
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );
      vi.mocked(api.updateProfile).mockResolvedValue({ error: null });

      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockProfile.linkedinUrl!)).toBeInTheDocument();
      });

      const linkedinInput = screen.getByLabelText(/linkedin/i);
      await user.clear(linkedinInput);
      await user.type(linkedinInput, "https://www.linkedin.com/in/newuser");

      const submitButton = screen.getByRole("button", { name: /save changes/i });
      await user.click(submitButton);

      // Should not show validation error
      await waitFor(() => {
        expect(
          screen.queryByText(/please enter a valid linkedin url/i)
        ).not.toBeInTheDocument();
      });
    });

    it("should reject invalid LinkedIn URLs", async () => {
      const user = userEvent.setup();
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );

      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockProfile.linkedinUrl!)).toBeInTheDocument();
      });

      const linkedinInput = screen.getByLabelText(/linkedin/i);
      await user.clear(linkedinInput);
      await user.type(linkedinInput, "https://notlinkedin.com/in/fake");

      const submitButton = screen.getByRole("button", { name: /save changes/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/please enter a valid linkedin url/i)
        ).toBeInTheDocument();
      });
    });

    it("should reject http:// LinkedIn URLs (require https)", async () => {
      const user = userEvent.setup();
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );

      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockProfile.linkedinUrl!)).toBeInTheDocument();
      });

      const linkedinInput = screen.getByLabelText(/linkedin/i);
      await user.clear(linkedinInput);
      await user.type(linkedinInput, "http://linkedin.com/in/testuser");

      const submitButton = screen.getByRole("button", { name: /save changes/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/please enter a valid linkedin url/i)
        ).toBeInTheDocument();
      });
    });

    it("should reject malicious subdomains like linkedin.com.evil.com", async () => {
      const user = userEvent.setup();
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );

      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockProfile.linkedinUrl!)).toBeInTheDocument();
      });

      const linkedinInput = screen.getByLabelText(/linkedin/i);
      await user.clear(linkedinInput);
      await user.type(linkedinInput, "https://linkedin.com.evil.com/in/fake");

      const submitButton = screen.getByRole("button", { name: /save changes/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/please enter a valid linkedin url/i)
        ).toBeInTheDocument();
      });
    });

    it("should allow empty LinkedIn URL (optional field)", async () => {
      const user = userEvent.setup();
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );
      vi.mocked(api.updateProfile).mockResolvedValue({ error: null });

      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockProfile.linkedinUrl!)).toBeInTheDocument();
      });

      const linkedinInput = screen.getByLabelText(/linkedin/i);
      await user.clear(linkedinInput);

      const submitButton = screen.getByRole("button", { name: /save changes/i });
      await user.click(submitButton);

      // Should not show validation error for empty field
      await waitFor(() => {
        expect(
          screen.queryByText(/please enter a valid linkedin url/i)
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("Save Button State", () => {
    it("should disable save button when no changes made", async () => {
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );

      renderSettingsPage();

      await waitFor(() => {
        const submitButton = screen.getByRole("button", { name: /save changes/i });
        expect(submitButton).toBeDisabled();
      });
    });

    it("should enable save button when changes are made", async () => {
      const user = userEvent.setup();
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );

      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockProfile.name)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, " Updated");

      const submitButton = screen.getByRole("button", { name: /save changes/i });
      expect(submitButton).not.toBeDisabled();
    });

    it("should show 'No changes to save' message when disabled", async () => {
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );

      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByText("No changes to save")).toBeInTheDocument();
      });
    });
  });

  describe("Form Submission", () => {
    it("should call updateProfile API with correct data on submit", async () => {
      const user = userEvent.setup();
      const refreshProfile = vi.fn();
      vi.spyOn(auth, "useAuth").mockReturnValue({
        ...createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id }),
        refreshProfile,
      });
      vi.mocked(api.updateProfile).mockResolvedValue({ error: null });

      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockProfile.name)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/name/i);
      await user.clear(nameInput);
      await user.type(nameInput, "Updated Name");

      const submitButton = screen.getByRole("button", { name: /save changes/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(api.updateProfile).toHaveBeenCalledWith(mockProfile.id, {
          name: "Updated Name",
          role: mockProfile.role,
          linkedin_url: mockProfile.linkedinUrl,
          reason: mockProfile.reason,
          bio: null,
        });
      });
    });

    it("should refresh profile after successful save", async () => {
      const user = userEvent.setup();
      const refreshProfile = vi.fn();
      vi.spyOn(auth, "useAuth").mockReturnValue({
        ...createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id }),
        refreshProfile,
      });
      vi.mocked(api.updateProfile).mockResolvedValue({ error: null });

      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockProfile.name)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, " Updated");

      const submitButton = screen.getByRole("button", { name: /save changes/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(refreshProfile).toHaveBeenCalled();
      });
    });

    it("should show loading state while saving", async () => {
      const user = userEvent.setup();

      // Create a promise that we can control
      let resolveUpdate: (value: { error: null }) => void;
      const updatePromise = new Promise<{ error: null }>((resolve) => {
        resolveUpdate = resolve;
      });

      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );
      vi.mocked(api.updateProfile).mockReturnValue(updatePromise);

      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockProfile.name)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, " Updated");

      const submitButton = screen.getByRole("button", { name: /save changes/i });
      await user.click(submitButton);

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText("Saving...")).toBeInTheDocument();
      });

      // Resolve the promise and wait for component to process it
      resolveUpdate!({ error: null });

      // Wait for loading state to clear (component processes the resolution)
      await waitFor(() => {
        expect(screen.queryByText("Saving...")).not.toBeInTheDocument();
      });
    });

    it("should handle API errors gracefully", async () => {
      const user = userEvent.setup();
      const { toast } = await import("sonner");

      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );
      vi.mocked(api.updateProfile).mockResolvedValue({
        error: new Error("Network error"),
      });

      renderSettingsPage();

      await waitFor(() => {
        expect(screen.getByDisplayValue(mockProfile.name)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, " Updated");

      const submitButton = screen.getByRole("button", { name: /save changes/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "Failed to save changes. Please try again."
        );
      });
    });
  });

  describe("Navigation", () => {
    it("should have back to dashboard link", async () => {
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );

      renderSettingsPage();

      await waitFor(() => {
        const backLink = screen.getByRole("link", { name: /back/i });
        expect(backLink).toHaveAttribute("href", "/events");
      });
    });
  });

  // P520: self-serve account deletion
  describe("Account Deletion (P520)", () => {
    const openDeletePanel = async () => {
      const user = userEvent.setup();
      renderSettingsPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Delete my account" })).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: "Delete my account" }));
      return user;
    };

    it("opens a confirmation panel that names what is erased and what is kept", async () => {
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );

      await openDeletePanel();

      expect(screen.getByText("Delete your account?")).toBeInTheDocument();
      expect(screen.getByText(/Erased:/)).toBeInTheDocument();
      expect(screen.getByText(/Kept, without your name:/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Type your name to confirm/)).toBeInTheDocument();
      // No guilt language, no feedback demand.
      expect(screen.queryByText(/sorry to see you go|why are you leaving|feedback/i)).not.toBeInTheDocument();
      // The confirm button is live from the start — never a disabled decoration (P955).
      expect(screen.getByRole("button", { name: /Delete my account/ })).toBeEnabled();
    });

    it("refuses to delete when the typed name does not match, and calls nothing", async () => {
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );
      vi.mocked(api.eraseMyAccount).mockResolvedValue({ counts: {}, error: null });

      const user = await openDeletePanel();
      await user.type(screen.getByLabelText(/Type your name to confirm/), "Someone Else");
      await user.click(screen.getByRole("button", { name: /Delete my account/ }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Type your name exactly as shown to confirm.");
      expect(api.eraseMyAccount).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("erases, signs out locally, and leaves when the typed name matches", async () => {
      const signOut = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(auth, "useAuth").mockReturnValue({
        ...createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id }),
        signOut,
      });
      vi.mocked(api.eraseMyAccount).mockResolvedValue({
        counts: { auth_user_deleted: true }, error: null,
      });

      const user = await openDeletePanel();
      await user.type(screen.getByLabelText(/Type your name to confirm/), mockProfile.name);
      await user.click(screen.getByRole("button", { name: /Delete my account/ }));

      await waitFor(() => {
        expect(api.eraseMyAccount).toHaveBeenCalledTimes(1);
        expect(signOut).toHaveBeenCalledWith({ scope: "local" });
        expect(mockNavigate).toHaveBeenCalledWith("/");
      });
      // Order matters: the RPC first, then the local sign-out, then the redirect.
      const erased = vi.mocked(api.eraseMyAccount).mock.invocationCallOrder[0];
      const signedOut = signOut.mock.invocationCallOrder[0];
      const navigated = mockNavigate.mock.invocationCallOrder[0];
      expect(erased).toBeLessThan(signedOut);
      expect(signedOut).toBeLessThan(navigated);
    });

    it("keeps the session and the panel when the RPC fails — nothing was erased", async () => {
      const signOut = vi.fn();
      vi.spyOn(auth, "useAuth").mockReturnValue({
        ...createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id }),
        signOut,
      });
      vi.mocked(api.eraseMyAccount).mockResolvedValue({
        counts: null, error: new Error("boom"),
      });
      const { toast } = await import("sonner");

      const user = await openDeletePanel();
      await user.type(screen.getByLabelText(/Type your name to confirm/), mockProfile.name);
      await user.click(screen.getByRole("button", { name: /Delete my account/ }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "Couldn't delete your account — nothing was changed. Please try again."
        );
      });
      expect(signOut).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: /Delete my account/ })).toBeEnabled();
    });
  });
});
