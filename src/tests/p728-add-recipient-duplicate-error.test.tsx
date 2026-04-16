/**
 * @file p728-add-recipient-duplicate-error.test.tsx
 * @description P728 canary: adding a recipient who is already invited must show a
 * user-friendly message, not the raw Postgres constraint error string.
 *
 * Bug: addRecipientToSealed throws `Error("Failed to add recipient: duplicate key value
 * violates unique constraint 'idx_letter_deliveries_unique_email'")`. The modal
 * propagates this string verbatim as the emailError hint on the row.
 *
 * Canary gate:
 *   Before fix: raw constraint error string shown in the row.
 *   After fix:  "This person has already been invited to this letter." shown instead.
 */

import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { LetterReceiverModal } from '@/app/components/letters/letter-receiver-modal';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/auth', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: { id: 'user-p728', email: 'sender@example.com' },
  }),
}));

vi.mock('@/app/data/letters-service', () => ({
  addRecipientToSealed: vi.fn(),
}));

vi.mock('@/app/data/agreements-service', () => ({
  agreementsService: {
    lookupUserByEmail: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@/lib/letter-emails', () => ({
  invokeLetterEmails: vi.fn(),
}));

vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const RAW_CONSTRAINT_ERROR =
  "Failed to add recipient: duplicate key value violates unique constraint 'idx_letter_deliveries_unique_email'";

const FRIENDLY_MESSAGE = 'This person has already been invited to this letter.';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('P728: Add recipient duplicate error must show friendly message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // it.fails() marks this as an expected failure: passes in suite before fix (bug confirmed),
  // breaks suite after fix (signaling the it.fails wrapper must be removed by /fix).
  it.fails('shows friendly message instead of raw DB constraint error on duplicate email', async () => {
    const { addRecipientToSealed } = await import('@/app/data/letters-service');
    vi.mocked(addRecipientToSealed).mockRejectedValue(new Error(RAW_CONSTRAINT_ERROR));

    const onRecipientAdded = vi.fn();

    render(
      <LetterReceiverModal
        mode="add-recipient"
        open={true}
        onOpenChange={vi.fn()}
        letterId="letter-p728"
        onRecipientAdded={onRecipientAdded}
      />
    );

    // Fill in email
    const emailInput = screen.getByRole('textbox', { name: /email address for recipient 1/i });
    await act(async () => {
      fireEvent.change(emailInput, { target: { value: 'alice@example.com' } });
    });

    // Fill in name
    const nameInput = screen.getByRole('textbox', { name: /full name for recipient 1/i });
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Alice Example' } });
    });

    // Submit
    const sendButton = screen.getByRole('button', { name: /send invitation/i });
    await act(async () => {
      fireEvent.click(sendButton);
    });

    // CANARY ASSERTION: friendly message must be shown.
    // Before fix: RAW_CONSTRAINT_ERROR string shown → this assertion fails.
    // After fix:  FRIENDLY_MESSAGE shown → passes.
    await waitFor(() => {
      expect(screen.getByText(FRIENDLY_MESSAGE)).toBeInTheDocument();
    });

    // Raw constraint error must NOT be shown to the user
    expect(screen.queryByText(RAW_CONSTRAINT_ERROR)).not.toBeInTheDocument();
  });
});
