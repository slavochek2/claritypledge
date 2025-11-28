import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { SimpleNavigation } from "@/polymet/components/simple-navigation";
import { UserProvider } from "@/polymet/contexts/user-context";
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
    ALLOW_DUPLICATE_EMAILS: true
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

describe("Auth Menu Stability", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("does NOT auto-login when pledge is signed (stability check)", async () => {
    // 1. Initial State: Logged out
    const { container } = render(
      <UserProvider>
        <MemoryRouter>
          <SimpleNavigation />
          <TestPledgeForm />
        </MemoryRouter>
      </UserProvider>
    );

    // Verify "Log In" is present (guest menu)
    await waitFor(() => {
      expect(screen.getByText("Log In")).toBeInTheDocument();
    });
    
    // 2. Sign the pledge (simulates form submission)
    const nameInput = screen.getByPlaceholderText("Name");
    const emailInput = screen.getByPlaceholderText("Email");
    const submitBtn = screen.getByText("Submit Pledge");

    const { fireEvent } = await import("@testing-library/react");
    
    fireEvent.change(nameInput, { target: { value: "Test User" } });
    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    
    await act(async () => {
      fireEvent.click(submitBtn);
    });
    
    // 3. Verify "Log In" is STILL present (we are waiting for email verification)
    // The menu should NOT update to "View My Pledge" or "Dashboard"
    await waitFor(() => {
        expect(screen.getByText("Log In")).toBeInTheDocument();
    });

    // Ensure NO user menu trigger is present
    const userMenuTrigger = container.querySelector('button[aria-haspopup="menu"]');
    expect(userMenuTrigger).not.toBeInTheDocument();
  });
});
