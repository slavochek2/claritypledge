import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { ClarityPledgeLanding } from './clarity-pledge-landing';

// Mock the useUser hook
vi.mock('@/hooks/use-user', () => ({
  useUser: () => ({
    user: null,
    isLoading: false,
    signOut: vi.fn(),
  }),
}));

// Mock the usePledgeForm hook to avoid form logic errors during rendering
vi.mock('@/hooks/use-pledge-form', () => ({
  usePledgeForm: () => ({
    formState: {
      name: '',
      email: '',
      role: '',
      linkedinUrl: '',
      reason: '',
      isSubmitting: false,
      isSealing: false,
      error: null,
      nameError: null,
      isCheckingName: false,
    },
    setters: {
      setName: vi.fn(),
      setEmail: vi.fn(),
      setRole: vi.fn(),
      setLinkedinUrl: vi.fn(),
      setReason: vi.fn(),
    },
    handleSubmit: vi.fn((e) => e.preventDefault()),
  }),
}));

// Mock other hooks/components if necessary
// The components rendered are mostly presentational or rely on providers/hooks we can mock or ignore

describe('ClarityPledgeLanding', () => {
  it('opens the pledge modal when "Take the Pledge" is clicked', async () => {
    render(
      <MemoryRouter>
        <ClarityPledgeLanding />
      </MemoryRouter>
    );

    // Find the "Take the Pledge" button. 
    // There are multiple, so we can get all and click the first one, or be specific.
    // The hero section has one.
    const pledgeButtons = screen.getAllByRole('button', { name: /Take the Pledge/i });
    expect(pledgeButtons.length).toBeGreaterThan(0);

    // Click the first one
    fireEvent.click(pledgeButtons[0]);

    // Check if the modal content appears
    // We look for the "Sign the Pledge" button which is inside the form in the modal
    const signButton = await screen.findByRole('button', { name: /Sign the Pledge/i });
    expect(signButton).toBeInTheDocument();
  });
});

