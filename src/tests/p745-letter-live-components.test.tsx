import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LetterLiveBanner } from '@/app/components/letters/letter-live-banner';
import { LetterLiveOverlay } from '@/app/components/letters/letter-live-overlay';
import type { OpenLiveInvite } from '@/app/hooks/useOpenLiveInvite';

const invite: OpenLiveInvite = {
  sessionId: 'session-p745',
  code: 'ABC123',
  authorName: 'Alice',
  storyTitle: 'Story',
  closedAt: null,
  inviterPhotoUrl: null,
  inviterAvatarColor: null,
  inviterIsPledger: false,
  deliveryId: 'delivery-p745',
};

// ─── LetterLiveBanner — Join only, no Later ───────────────────────────────────

describe('P745: LetterLiveBanner — Join only, no Later button', () => {
  it('renders Join button', () => {
    render(
      <MemoryRouter>
        <LetterLiveBanner invite={invite} onJoin={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /join/i })).toBeInTheDocument();
  });

  it('does NOT render Later button when onLater is not passed', () => {
    render(
      <MemoryRouter>
        <LetterLiveBanner invite={invite} onJoin={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: /later/i })).toBeNull();
  });
});

// ─── LetterLiveOverlay — z-index stacks above FixedBottomBar (z-50) ──────────

describe('P745: LetterLiveOverlay — z-[60] stacks above FixedBottomBar z-50', () => {
  it('overlay dialog has z-[60], not z-50', () => {
    const { container } = render(
      <MemoryRouter>
        <LetterLiveOverlay sessionCode="TESTCODE" />
      </MemoryRouter>
    );
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.className).toContain('z-[60]');
    expect(dialog?.className).not.toContain('z-50');
  });
});
