import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ClarityNavigation } from "@/polymet/components/clarity-navigation";
import { usePledgeForm } from "@/hooks/use-pledge-form";

// Mock Supabase and API
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } }
      })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
    },
  },
}));

vi.mock("@/polymet/data/api", () => ({
  getProfile: vi.fn(() => Promise.resolve(null)),
  createProfile: vi.fn(() => Promise.resolve({ 
    slug: "test-slug", 
    isReturningUser: false 
  })),
  checkSlugExists: vi.fn(() => Promise.resolve(false)),
  generateSlug: vi.fn((name) => name.toLowerCase().replace(/\s+/g, "-")),
  signOut: vi.fn(),
}));

// Mock feature flags
vi.mock("@/lib/feature-flags", () => ({
  FEATURES: {
    ALLOW_DUPLICATE_NAMES: false,
  },
}));

// Mock confetti
vi.mock("@/lib/confetti", () => ({
  triggerConfetti: vi.fn(),
}));

// Helper component to trigger the pledge form logic
function TestPledgeForm() {
  const { setters, handleSubmit } = usePledgeForm();
  
  return (
    <div>
        <input 
            placeholder="Name" 
            onChange={e => setters.setName(e.target.value)} 
        />
        <input 
            placeholder="Email" 
            onChange={e => setters.setEmail(e.target.value)} 
        />
        <button onClick={(e) => handleSubmit(e)}>Submit Pledge</button>
    </div>
  );
}

describe("Auth State Updates", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("updates menu immediately when pledge is signed", async () => {
    // 1. Initial State: Logged out
    const { container } = render(
      <MemoryRouter>
        <ClarityNavigation />
        <TestPledgeForm />
      </MemoryRouter>
    );

    // Verify "Log In" is present (guest menu)
    await waitFor(() => {
      expect(screen.getByText("Log In")).toBeInTheDocument();
    });
    expect(screen.queryByText("View My Pledge")).not.toBeInTheDocument();

    // 2. Sign the pledge (simulates form submission)
    const nameInput = screen.getByPlaceholderText("Name");
    const emailInput = screen.getByPlaceholderText("Email");
    const submitBtn = screen.getByText("Submit Pledge");

    // Manually trigger change events to update state
    const { fireEvent } = await import("@testing-library/react");
    
    fireEvent.change(nameInput, { target: { value: "Test User" } });
    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    
    await act(async () => {
      fireEvent.click(submitBtn);
    });
    
    // Wait for menu to update (Guest "Log In" should disappear)
    await waitFor(() => {
        expect(screen.queryByText("Log In")).not.toBeInTheDocument();
    });

    // Verify User Menu trigger is present
    // The presence of this button (aria-haspopup="menu") confirms that `currentUser` is set,
    // causing ClarityNavigation to render UserMenu instead of GuestMenu.
    const userMenuTrigger = container.querySelector('button[aria-haspopup="menu"]');
    expect(userMenuTrigger).toBeInTheDocument();
  });
});

