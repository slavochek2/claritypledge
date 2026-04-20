/**
 * P762 Canary — Symptom 3: LetterLiveOverlay must not render a redundant ✕ close button.
 * LiveSessionBanner's "End Session" is the single exit path.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LetterLiveOverlay } from '@/app/components/letters/letter-live-overlay';

// Prevent iframe navigation errors in jsdom
vi.stubGlobal('HTMLIFrameElement', class extends HTMLElement {});

describe('P762: LetterLiveOverlay — no redundant X button', () => {
  it('renders no close button — End Session is the only exit', () => {
    render(<LetterLiveOverlay sessionCode="ABC123" />);
    expect(screen.queryByRole('button', { name: /close live session/i })).toBeNull();
  });

  it('renders only the iframe — no interactive controls in the overlay chrome', () => {
    render(<LetterLiveOverlay sessionCode="ABC123" />);
    // Only the iframe should be present; no overlay-level buttons
    expect(screen.queryByRole('button')).toBeNull();
  });
});
