/**
 * @file p492-guest-post-session-ui.test.tsx
 * @description Tests for P492: Guest post-session UI improvements
 *
 * PartnerLeftScreen component should:
 * - Hide "Start New Session" button for guest users
 * - Show improved CTA copy for guest users ("Keep your session insights")
 * - Show "Start New Session" button for registered users
 * - NOT show guest CTA for registered users
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { PartnerLeftScreen } from '@/app/components/partners/live-mode-view';

const renderPartnerLeft = (props: Partial<Parameters<typeof PartnerLeftScreen>[0]> = {}) => {
  return render(
    <BrowserRouter>
      <PartnerLeftScreen
        partnerName="Alice"
        sessionEnded={false}
        onStartNew={vi.fn()}
        {...props}
      />
    </BrowserRouter>
  );
};

describe('P492: PartnerLeftScreen guest vs registered user', () => {
  describe('Guest user (isGuest=true)', () => {
    it('does NOT render "Start New Session" button', () => {
      renderPartnerLeft({ isGuest: true });

      expect(screen.queryByRole('button', { name: /start new session/i })).not.toBeInTheDocument();
    });

    it('shows improved CTA heading "Keep your session insights"', () => {
      renderPartnerLeft({ isGuest: true });

      expect(screen.getByText(/keep your session insights/i)).toBeInTheDocument();
    });

    it('shows improved body text mentioning calibrated communication', () => {
      renderPartnerLeft({ isGuest: true });

      expect(screen.getByText(/you just practiced calibrated communication/i)).toBeInTheDocument();
    });

    it('shows "Create Free Account" link', () => {
      renderPartnerLeft({ isGuest: true });

      expect(screen.getByRole('link', { name: /create free account/i })).toBeInTheDocument();
    });
  });

  describe('Registered user (isGuest=false or undefined)', () => {
    it('renders "Start New Session" button', () => {
      renderPartnerLeft({ isGuest: false });

      expect(screen.getByRole('button', { name: /start new session/i })).toBeInTheDocument();
    });

    it('does NOT show guest CTA', () => {
      renderPartnerLeft({ isGuest: false });

      expect(screen.queryByText(/keep your session insights/i)).not.toBeInTheDocument();
    });

    it('defaults to registered behavior when isGuest is omitted', () => {
      renderPartnerLeft({});

      expect(screen.getByRole('button', { name: /start new session/i })).toBeInTheDocument();
      expect(screen.queryByText(/keep your session insights/i)).not.toBeInTheDocument();
    });
  });

  describe('Session ended messaging', () => {
    it('shows "Session ended" when sessionEnded=true', () => {
      renderPartnerLeft({ sessionEnded: true, isGuest: true });

      expect(screen.getByText('Session ended')).toBeInTheDocument();
    });

    it('shows partner name in title when partner left', () => {
      renderPartnerLeft({ partnerName: 'Bob', sessionEnded: false, isGuest: true });

      expect(screen.getByText('Bob has left')).toBeInTheDocument();
    });
  });
});
