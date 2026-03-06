/**
 * @file p481-revoke-confirm-dialog.test.tsx
 * @description Unit tests for P481: Revoke Invitation — Replace Inline Confirm with Dialog.
 *
 * Tests that clicking "Revoke" on a pending invitation row opens a ConfirmDialog
 * (Drawer) instead of the old inline Keep/Cancel swap. Verifies dialog content,
 * dismiss behavior, confirm behavior (API call + row removal), loading state,
 * and toast messages.
 *
 * The CancelButton component is internal to agreement-row.tsx, so we test it
 * through the exported AgreementRow component with `cancelable={true}`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AgreementRow } from '@/app/components/agreements/agreement-row';
import type { ClarityAgreement } from '@/app/data/agreements-service.interface';

// ─── Mock agreementsService ──────────────────────────────────────────────────

const mockCancelInvitation = vi.fn();

vi.mock('@/app/data/agreements-service', () => ({
  agreementsService: {
    cancelInvitation: (...args: unknown[]) => mockCancelInvitation(...args),
    resendInvitation: vi.fn().mockResolvedValue(true),
  },
}));

// ─── Mock sonner toast ───────────────────────────────────────────────────────

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    info: vi.fn(),
  },
}));

// ─── Fixture ─────────────────────────────────────────────────────────────────

const OWNER_PROFILE_ID = 'owner-123';

function makePendingAgreement(overrides: Partial<ClarityAgreement> = {}): ClarityAgreement {
  return {
    id: 'agreement-pending-1',
    displayId: 'A-0001',
    creatorProfileId: OWNER_PROFILE_ID,
    partnerProfileId: null,
    partnerEmail: 'karl@example.com',
    partnerDisplayName: 'Karl Marx',
    termsText: 'We commit to monthly check-ins.',
    status: 'pending',
    visibility: 'private',
    invitationToken: 'token-abc',
    invitationExpiresAt: '2099-01-01T00:00:00Z',
    createdAt: '2026-03-04T00:00:00Z',
    partnerSignedAt: null,
    terminatedAt: null,
    terminatedBy: null,
    creator: null,
    partner: null,
    ...overrides,
  };
}

function renderRow(
  agreement: ClarityAgreement = makePendingAgreement(),
  props: Partial<Parameters<typeof AgreementRow>[0]> = {},
) {
  const onCancelled = props.onCancelled ?? vi.fn();
  return {
    onCancelled,
    ...render(
      <BrowserRouter>
        <AgreementRow
          agreement={agreement}
          currentProfileId={OWNER_PROFILE_ID}
          cancelable={true}
          onCancelled={onCancelled}
          {...props}
        />
      </BrowserRouter>,
    ),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('P481: Revoke invitation confirm dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCancelInvitation.mockResolvedValue(true);
  });

  // ── AC: Clicking "Revoke" opens a dialog ──────────────────────────────────

  describe('Opening the dialog', () => {
    it('shows a "Revoke" button on pending cancelable rows', () => {
      renderRow();
      expect(screen.getByRole('button', { name: /revoke/i })).toBeInTheDocument();
    });

    it('opens a dialog when "Revoke" is clicked', () => {
      renderRow();
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }));

      // Dialog title should appear
      expect(screen.getByText('Revoke invitation?')).toBeInTheDocument();
    });
  });

  // ── AC: Dialog shows partner name in description ──────────────────────────

  describe('Dialog content', () => {
    it('displays partner name from partnerDisplayName', () => {
      renderRow(makePendingAgreement({ partnerDisplayName: 'Karl Marx' }));
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }));

      expect(
        screen.getByText(/Karl Marx will no longer be able to accept this invite/i),
      ).toBeInTheDocument();
    });

    it('displays partner name from partner.name when partnerDisplayName is null', () => {
      renderRow(
        makePendingAgreement({
          partnerDisplayName: null,
          partner: {
            profileId: 'p-456',
            name: 'Friedrich Engels',
            slug: 'friedrich',
            avatarColor: '#000',
            avatarUrl: null,
            hasPledged: false,
          },
        }),
      );
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }));

      expect(
        screen.getByText(/Friedrich Engels will no longer be able to accept this invite/i),
      ).toBeInTheDocument();
    });

    it('falls back to "Invited party" when no name is available', () => {
      renderRow(makePendingAgreement({ partnerDisplayName: null, partner: null }));
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }));

      expect(
        screen.getByText(/Invited party will no longer be able to accept this invite/i),
      ).toBeInTheDocument();
    });
  });

  // ── AC: "Keep" dismisses the dialog without action ────────────────────────

  describe('Keep (dismiss)', () => {
    it('"Keep" button dismisses the dialog', async () => {
      renderRow();
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }));

      // Dialog is open
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('data-state', 'open');

      // Click Keep
      fireEvent.click(screen.getByRole('button', { name: /keep/i }));

      // Dialog should close — Vaul Drawer keeps DOM but sets data-state="closed"
      await waitFor(() => {
        expect(dialog).toHaveAttribute('data-state', 'closed');
      });
    });

    it('"Keep" does not call cancelInvitation', () => {
      renderRow();
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }));
      fireEvent.click(screen.getByRole('button', { name: /keep/i }));

      expect(mockCancelInvitation).not.toHaveBeenCalled();
    });
  });

  // ── AC: "Revoke" in dialog cancels the invitation and removes the row ─────

  describe('Confirm revoke', () => {
    it('calls cancelInvitation with the agreement ID', async () => {
      renderRow(makePendingAgreement({ id: 'agreement-42' }));
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }));

      // Click the confirm "Revoke" in the dialog (there are now two buttons with "Revoke")
      const dialogButtons = screen.getAllByRole('button', { name: /revoke/i });
      const confirmButton = dialogButtons[dialogButtons.length - 1];
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockCancelInvitation).toHaveBeenCalledWith('agreement-42');
      });
    });

    it('calls onCancelled callback on success', async () => {
      const onCancelled = vi.fn();
      renderRow(makePendingAgreement({ id: 'agreement-42' }), { onCancelled });
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }));

      const dialogButtons = screen.getAllByRole('button', { name: /revoke/i });
      fireEvent.click(dialogButtons[dialogButtons.length - 1]);

      await waitFor(() => {
        expect(onCancelled).toHaveBeenCalledWith('agreement-42');
      });
    });
  });

  // ── AC: Toast messages ────────────────────────────────────────────────────

  describe('Toast messages', () => {
    it('shows success toast on successful cancel', async () => {
      mockCancelInvitation.mockResolvedValue(true);
      renderRow();
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }));

      const dialogButtons = screen.getAllByRole('button', { name: /revoke/i });
      fireEvent.click(dialogButtons[dialogButtons.length - 1]);

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('Invitation cancelled.');
      });
    });

    it('shows error toast when API returns false', async () => {
      mockCancelInvitation.mockResolvedValue(false);
      renderRow();
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }));

      const dialogButtons = screen.getAllByRole('button', { name: /revoke/i });
      fireEvent.click(dialogButtons[dialogButtons.length - 1]);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Failed to cancel. Try again.');
      });
    });

    it('shows error toast when API throws', async () => {
      mockCancelInvitation.mockRejectedValue(new Error('Network error'));
      renderRow();
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }));

      const dialogButtons = screen.getAllByRole('button', { name: /revoke/i });
      fireEvent.click(dialogButtons[dialogButtons.length - 1]);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Failed to cancel. Try again.');
      });
    });

    it('does not call onCancelled when API fails', async () => {
      mockCancelInvitation.mockResolvedValue(false);
      const onCancelled = vi.fn();
      renderRow(makePendingAgreement(), { onCancelled });
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }));

      const dialogButtons = screen.getAllByRole('button', { name: /revoke/i });
      fireEvent.click(dialogButtons[dialogButtons.length - 1]);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalled();
      });
      expect(onCancelled).not.toHaveBeenCalled();
    });
  });

  // ── AC: Loading state during API call ─────────────────────────────────────

  describe('Loading state', () => {
    it('shows loading text on Revoke button while API call is in flight', async () => {
      // Make the API call hang
      let resolveCancel: (value: boolean) => void;
      mockCancelInvitation.mockImplementation(
        () => new Promise<boolean>((resolve) => { resolveCancel = resolve; }),
      );

      renderRow();
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }));

      const dialogButtons = screen.getAllByRole('button', { name: /revoke/i });
      fireEvent.click(dialogButtons[dialogButtons.length - 1]);

      // Loading indicator should appear (the ConfirmDialog shows "Please wait...")
      await waitFor(() => {
        expect(screen.getByText(/please wait|\.{3}/i)).toBeInTheDocument();
      });

      // Resolve to clean up
      resolveCancel!(true);
    });
  });

  // ── AC: Inline Keep/Cancel no longer appears (regression) ─────────────────

  describe('Regression: no inline confirm', () => {
    it('does not show inline Keep/Cancel buttons after clicking Revoke', () => {
      renderRow();
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }));

      // The old inline pattern had a role="group" div with Keep and Cancel text buttons
      // in the same row. With the dialog pattern, there should be no role="group" in the row.
      expect(screen.queryByRole('group')).not.toBeInTheDocument();
    });

    it('does not render a "Cancel" text button inline (old pattern)', () => {
      renderRow();
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }));

      // In the old pattern, clicking Revoke would show a "Cancel" button inline.
      // Now "Cancel" should not appear — the dialog uses "Keep" as the dismiss label.
      // The only buttons with "Revoke" text should be in the dialog.
      const cancelButtons = screen.queryAllByRole('button', { name: /^cancel$/i });
      expect(cancelButtons).toHaveLength(0);
    });
  });

  // ── Edge: non-cancelable rows don't show Revoke ───────────────────────────

  describe('Non-cancelable rows', () => {
    it('does not show Revoke when cancelable is false', () => {
      render(
        <BrowserRouter>
          <AgreementRow
            agreement={makePendingAgreement()}
            currentProfileId={OWNER_PROFILE_ID}
            cancelable={false}
          />
        </BrowserRouter>,
      );

      expect(screen.queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument();
    });

    it('does not show Revoke on active agreements even when cancelable', () => {
      render(
        <BrowserRouter>
          <AgreementRow
            agreement={makePendingAgreement({ status: 'active' })}
            currentProfileId={OWNER_PROFILE_ID}
            cancelable={true}
          />
        </BrowserRouter>,
      );

      expect(screen.queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument();
    });
  });
});
