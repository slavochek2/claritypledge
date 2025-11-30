import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { ClarityNavigation } from "@/polymet/components/clarity-navigation";

// Mock useUser to simulate logged-out state
vi.mock("@/auth", () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    signOut: vi.fn(),
  }),
}));

// Helper component to display current location
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-display">{location.pathname}</div>;
}

describe("Auth Navigation", () => {
  it("navigates to /login when 'Log In' is clicked", async () => {
    const user = userEvent.setup();
    
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={
            <>
              <ClarityNavigation />
              <LocationDisplay />
            </>
          } />
          <Route path="/login" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    );

    const loginLink = screen.getByRole("link", { name: /log in/i });
    await user.click(loginLink);

    await waitFor(() => {
      expect(screen.getByTestId("location-display")).toHaveTextContent("/login");
    });
  });

  it("navigates to /sign-pledge when 'Take the Pledge' is clicked", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={
            <>
              <ClarityNavigation />
              <LocationDisplay />
            </>
          } />
          <Route path="/sign-pledge" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    );

    // Get all links that match 'Take the Pledge' (might include mobile menu)
    const pledgeLinks = screen.getAllByRole("link", { name: /take the pledge/i });
    
    // Click the first one (typically the visible CTA in header)
    await user.click(pledgeLinks[0]);

    await waitFor(() => {
      expect(screen.getByTestId("location-display")).toHaveTextContent("/sign-pledge");
    });
  });
});
