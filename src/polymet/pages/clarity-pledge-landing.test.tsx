import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { ClarityPledgeLanding } from './clarity-pledge-landing';

// Mock the useUser hook
vi.mock('@/auth', () => ({
  useAuth: () => ({
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
  it('has "Take the Pledge" links that navigate to /sign-pledge', async () => {
    render(
      <MemoryRouter>
        <ClarityPledgeLanding />
      </MemoryRouter>
    );

    // Find all "Take the Pledge" links (navigation, hero section, CTA section)
    const pledgeLinks = screen.getAllByRole('link', { name: /Take the Pledge/i });
    expect(pledgeLinks.length).toBeGreaterThan(0);

    // Verify they all link to /sign-pledge
    pledgeLinks.forEach(link => {
      expect(link).toHaveAttribute('href', '/sign-pledge');
    });
  });
});

