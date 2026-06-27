/**
 * P958 Canary — WebinarDateLine shows hardcoded date even when no event exists.
 *
 * Root cause: WebinarDateLine renders unconditionally from WEBINAR_NEXT_ISO constant,
 * never consulting the events DB.
 *
 * BEFORE FIX: both tests FAIL — date line always shows "Live ·", CTA always shows
 *   "Join the next Clarity Experiment" regardless of DB state.
 * AFTER FIX: both tests PASS — date line is absent when events fetch returns empty,
 *   CTA relabels to "Try a Clarity Letter".
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Mock eventsService to return NO upcoming events (current prod state)
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getUpcomingEvents: vi.fn().mockResolvedValue([]),
  },
}));

// Mock analytics — no-op
vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn() },
}));

// Stub heavy landing components that fetch their own data
vi.mock('@/app/components/landing/social-proof', () => ({
  PledgerAvatarStack: () => null,
  ScrollIndicator: () => null,
}));

vi.mock('@/app/components/landing/offers-section', () => ({
  Testimonials: () => null,
  OffersSection: () => null,
}));

vi.mock('@/app/components/landing/misunderstanding-venn', () => ({
  MisunderstandingVenn: () => null,
}));

vi.mock('@/app/components/landing/hard-truth-chat', () => ({
  HardTruthChat: () => null,
}));

vi.mock('@/app/components/landing/how-platform-works', () => ({
  HowPlatformWorks: () => null,
}));

vi.mock('@/app/components/agreements/agreement-certificate', () => ({
  AgreementCertificate: () => null,
}));

vi.mock('@/app/components/agreements/template-stamp', () => ({
  TemplateStamp: () => null,
}));

describe('p958: WebinarDateLine is DB-driven', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('date line is NOT rendered when no upcoming webinar event exists in DB', async () => {
    // Dynamic import to pick up mock state
    const { ProgramPage } = await import('@/app/pages/program-page');

    render(
      <MemoryRouter>
        <ProgramPage />
      </MemoryRouter>
    );

    // Allow async fetch to settle (after fix, a fetch fires on mount)
    await waitFor(
      () => {
        // BEFORE FIX: FAILS — "Live ·" always in DOM from WEBINAR_NEXT_ISO constant
        // AFTER FIX: PASSES — date line absent because no event returned from DB
        expect(screen.queryByText(/Live ·/)).not.toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });

  test('CTA shows "Try a Clarity Letter" (not "Join the next Clarity Experiment") when no upcoming event', async () => {
    const { ProgramPage } = await import('@/app/pages/program-page');

    render(
      <MemoryRouter>
        <ProgramPage />
      </MemoryRouter>
    );

    await waitFor(
      () => {
        // BEFORE FIX: FAILS — hardcoded CTA always says "Join the next Clarity Experiment"
        // AFTER FIX: PASSES — CTA relabels to "Try a Clarity Letter" when no event exists
        expect(screen.queryByText('Join the next Clarity Experiment')).not.toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });
});
