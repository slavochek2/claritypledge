import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ClarityChampionsPage } from "./clarity-champions-page";
import * as api from "@/polymet/data/api";
import * as supabase from "@/lib/supabase";

// Mock the api module
vi.mock("@/polymet/data/api", () => ({
  getVerifiedProfiles: vi.fn(),
}));

// Mock the supabase client
const supabaseMock = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn(),
};
vi.mock("@/lib/supabase", () => ({
  supabase: supabaseMock,
}));

// Mock data
const mockProfiles: api.Profile[] = [
  {
    id: "1",
    name: "John Doe",
    role: "Software Engineer",
    reason: "To build a better future.",
    witnesses: [],
    reciprocations: 5,
    signedAt: new Date().toISOString(),
    avatarColor: "#ff0000",
    email: "john@doe.com",
    isVerified: true,
  },
  {
    id: "2",
    name: "Jane Smith",
    role: "Product Manager",
    reason: "Clarity is key.",
    witnesses: [],
    reciprocations: 10,
    signedAt: new Date().toISOString(),
    avatarColor: "#00ff00",
    email: "jane@smith.com",
    isVerified: true,
  },
];

describe("ClarityChampionsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.getVerifiedProfiles).mockResolvedValue(mockProfiles);
  });

  it("should display a loading spinner initially", () => {
    vi.mocked(api.getVerifiedProfiles).mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter>
        <ClarityChampionsPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId("loader")).toBeInTheDocument();
  });

  it("should display profiles when data is fetched successfully", async () => {
    supabaseMock.from.mockReturnThis();
    supabaseMock.select.mockResolvedValue({ data: [], count: mockProfiles.length });

    render(
      <MemoryRouter>
        <ClarityChampionsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByTestId("loader")).not.toBeInTheDocument();
    });

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    expect(
      screen.getByText((content, element) => {
        const hasText = (node) => node.textContent === `Showing ${mockProfiles.length} verified Clarity Champions`;
        const elementHasText = hasText(element);
        const childrenDontHaveText = Array.from(element.children).every(
          (child) => !hasText(child)
        );
        return elementHasText && childrenDontHaveText;
      })
    ).toBeInTheDocument();
  });

  it("should display an empty state message when no profiles are found", async () => {
    vi.mocked(api.getVerifiedProfiles).mockResolvedValue([]);
    supabaseMock.from.mockReturnThis();
    supabaseMock.select.mockResolvedValue({ data: [], count: 0 });

    render(
      <MemoryRouter>
        <ClarityChampionsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByTestId("loader")).not.toBeInTheDocument();
    });

    expect(screen.getByText("No Verified Champions Yet")).toBeInTheDocument();
  });

  it("should display the admin note in development when there are unverified profiles", async () => {
    const originalDev = import.meta.env.DEV;
    import.meta.env.DEV = true;

    supabaseMock.from.mockReturnThis();
    supabaseMock.select.mockResolvedValue({ data: [], count: mockProfiles.length + 1 });

    render(
      <MemoryRouter>
        <ClarityChampionsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText((content, element) => {
          const hasText = (node) => node.textContent === `Admin Note: There are 1 unverified profiles in the database. Go to Test DB page to verify them.`;
          const elementHasText = hasText(element);
          const childrenDontHaveText = Array.from(element.children).every(
            (child) => !hasText(child)
          );
          return elementHasText && childrenDontHaveText;
        })
      ).toBeInTheDocument();
    });

    import.meta.env.DEV = originalDev;
  });

  it("should not display the admin note in production", async () => {
    const originalDev = import.meta.env.DEV;
    import.meta.env.DEV = false;

    supabaseMock.from.mockReturnThis();
    supabaseMock.select.mockResolvedValue({ data: [], count: mockProfiles.length + 1 });

    render(
      <MemoryRouter>
        <ClarityChampionsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByTestId("loader")).not.toBeInTheDocument();
    });

    expect(
      screen.queryByText(/Admin Note:/i)
    ).not.toBeInTheDocument();

    import.meta.env.DEV = originalDev;
  });
});
