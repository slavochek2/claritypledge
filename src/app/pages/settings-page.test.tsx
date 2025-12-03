import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SettingsPage } from "./settings-page";
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
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/sign-pledge" element={<div>Sign Pledge Page</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  describe("Route Protection", () => {
    it("should show loading state while auth is loading", () => {
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ isLoading: true })
      );

      renderSettingsPage();

      // Should show loading spinner
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();
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

      // Resolve the promise
      resolveUpdate!({ error: null });
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
    it("should have back to profile link", async () => {
      vi.spyOn(auth, "useAuth").mockReturnValue(
        createAuthMock({ user: mockProfile, sessionUserId: mockProfile.id })
      );

      renderSettingsPage();

      await waitFor(() => {
        const backLink = screen.getByRole("link", { name: /back to profile/i });
        expect(backLink).toHaveAttribute("href", `/p/${mockProfile.slug}`);
      });
    });
  });
});
