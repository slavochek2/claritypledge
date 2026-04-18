/**
 * @file p492-guest-post-session-ui.test.tsx
 * @description Tests for PartnerLeftScreen (P492 base, updated for P584 redesign)
 *
 * PartnerLeftScreen component should:
 * - Show unified "Start a Clarity Session" CTA for all logged-in users (host & participant)
 * - Show "Create Free Account" for guest users
 * - Hide CTA while upload is in progress
 * - Show transcript notification only when completedRounds > 0
 * - Show upload progress for ALL users (including guests)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { PartnerLeftScreen } from '@/app/components/partners/live-mode-view';

// Mock usePwaInstall — P493 added InstallBanner to PartnerLeftScreen
vi.mock('@/hooks/use-pwa-install', () => ({
  usePwaInstall: () => ({
    isInstalled: false,
    canPrompt: false,
    isIOS: false,
    isDismissed: false,
    isDesktop: true,
    promptInstall: vi.fn(),
  }),
}));

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

describe('P584: PartnerLeftScreen redesign', () => {
  describe('Guest user (isGuest=true)', () => {
    it('does NOT render "Start a Clarity Session" link', () => {
      renderPartnerLeft({ isGuest: true });

      expect(screen.queryByRole('link', { name: /start a clarity session/i })).not.toBeInTheDocument();
    });

    it('shows "Create Free Account" link', () => {
      renderPartnerLeft({ isGuest: true });

      expect(screen.getByRole('link', { name: /create free account/i })).toBeInTheDocument();
    });

    it('shows "Already have an account? Log in" link', () => {
      renderPartnerLeft({ isGuest: true });

      expect(screen.getByText(/already have an account\? log in/i)).toBeInTheDocument();
    });

    it('shows guest transcript message when completedRounds > 0', () => {
      renderPartnerLeft({ isGuest: true, completedRounds: 2 });

      expect(screen.getByText(/your session was recorded/i)).toBeInTheDocument();
      expect(screen.getByText(/create an account to access your transcript and ai insights/i)).toBeInTheDocument();
    });

    it('does NOT show transcript message when completedRounds is 0', () => {
      renderPartnerLeft({ isGuest: true, completedRounds: 0 });

      expect(screen.queryByText(/your session was recorded/i)).not.toBeInTheDocument();
    });
  });

  describe('Registered user (isGuest=false or undefined)', () => {
    it('renders "Start a Clarity Session" link for creator', () => {
      renderPartnerLeft({ isGuest: false, isCreator: true });

      expect(screen.getByRole('link', { name: /start a clarity session/i })).toBeInTheDocument();
    });

    it('renders same "Start a Clarity Session" link for joiner (unified CTA)', () => {
      renderPartnerLeft({ isGuest: false, isCreator: false });

      expect(screen.getByRole('link', { name: /start a clarity session/i })).toBeInTheDocument();
    });

    it('does NOT show guest CTA', () => {
      renderPartnerLeft({ isGuest: false });

      expect(screen.queryByRole('link', { name: /create free account/i })).not.toBeInTheDocument();
    });

    it('defaults to registered behavior when isGuest is omitted', () => {
      renderPartnerLeft({ isCreator: true });

      expect(screen.getByRole('link', { name: /start a clarity session/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /create free account/i })).not.toBeInTheDocument();
    });

    it('shows transcript notification when completedRounds > 0', () => {
      renderPartnerLeft({ isGuest: false, completedRounds: 3 });

      expect(screen.getByText(/your transcript is being generated/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /session history/i })).toBeInTheDocument();
    });

    it('does NOT show transcript notification when completedRounds is 0', () => {
      renderPartnerLeft({ isGuest: false, completedRounds: 0 });

      expect(screen.queryByText(/your transcript is being generated/i)).not.toBeInTheDocument();
    });
  });

  describe('Upload progress (P584: shown for ALL users)', () => {
    it('shows upload progress for guests during upload', () => {
      renderPartnerLeft({
        isGuest: true,
        uploadProgress: { status: 'uploading', pending: 3, total: 10 },
      });

      expect(screen.getByText(/uploading chunk 8 of 10/i)).toBeInTheDocument();
      expect(screen.getByText("Don't close this tab yet.")).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('shows upload progress for registered users during upload', () => {
      renderPartnerLeft({
        isGuest: false,
        uploadProgress: { status: 'uploading', pending: 5, total: 20 },
      });

      expect(screen.getByText(/uploading chunk 16 of 20/i)).toBeInTheDocument();
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('hides CTA while uploading (registered)', () => {
      renderPartnerLeft({
        isGuest: false,
        uploadProgress: { status: 'uploading', pending: 1, total: 5 },
      });

      expect(screen.queryByRole('link', { name: /start a clarity session/i })).not.toBeInTheDocument();
    });

    it('hides CTA while uploading (guest)', () => {
      renderPartnerLeft({
        isGuest: true,
        uploadProgress: { status: 'uploading', pending: 1, total: 5 },
      });

      expect(screen.queryByRole('link', { name: /create free account/i })).not.toBeInTheDocument();
    });

    it('shows CTA after upload completes', () => {
      renderPartnerLeft({
        isGuest: false,
        uploadProgress: { status: 'complete', pending: 0, total: 5 },
      });

      expect(screen.getByRole('link', { name: /start a clarity session/i })).toBeInTheDocument();
    });

    it('shows upload failure message', () => {
      renderPartnerLeft({
        isGuest: false,
        uploadProgress: { status: 'failed', pending: 2, total: 5 },
      });

      expect(screen.getByText(/recording could not be saved/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /start a clarity session/i })).toBeInTheDocument();
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
