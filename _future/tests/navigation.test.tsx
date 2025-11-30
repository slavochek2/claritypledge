import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ClarityLandingLayout } from "../layouts/clarity-landing-layout";
import { ClarityChampionsPage } from "../pages/clarity-champions-page";
import * as useUser from "@/hooks/use-user";
import * as api from "@/polymet/data/api";

vi.mock("@/hooks/use-user");
vi.mock("@/polymet/data/api");

describe("Public Navigation Menu", () => {
  it("should be visible on the Clarity Champions page for logged-out users", async () => {
    // Mock the useUser hook to simulate a logged-out state
    vi.spyOn(useUser, "useUser").mockReturnValue({
      user: null,
      isLoading: false,
      signOut: async () => {},
    });

    // Mock the API call for pledgers to prevent unrelated errors
    vi.mocked(api.getVerifiedProfiles).mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/clarity-champions"]}>
        <ClarityLandingLayout>
          <ClarityChampionsPage />
        </ClarityLandingLayout>
      </MemoryRouter>
    );

    // Use `waitFor` to ensure the component has finished rendering after hooks have settled
    await waitFor(() => {
        // Assert that the public navigation links are visible
        const navLinks = screen.getAllByRole("link");
        const manifestoLink = navLinks.find(link => link.textContent === "Manifesto");
        const championsLink = navLinks.find(link => link.textContent === "Clarity Champions" && link.getAttribute("href") === "/clarity-champions");
        const servicesLink = navLinks.find(link => link.textContent === "Our Services");

        expect(manifestoLink).toBeInTheDocument();
        expect(championsLink).toBeInTheDocument();
        expect(servicesLink).toBeInTheDocument();
    });
  });
});
