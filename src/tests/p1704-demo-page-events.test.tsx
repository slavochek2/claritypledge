/**
 * P1704 — page-level event wiring. With a demo video set, each of the six real pages sends
 * demo_video_seen and demo_video_play with ITS OWN location (catches a page passing another
 * page's location, which a section-only test cannot). The content module is mocked so
 * every page has a film, /hospitals included (it ships with none until its own film exists).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactElement } from 'react';

const track = vi.fn();
const motion = { inView: false };
vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: (...a: unknown[]) => track(...a) } }));
vi.mock('@/app/components/landing/social-proof', () => ({
  PledgerAvatarStack: () => <div data-testid="pledgers" />,
  ScrollIndicator: ({ label }: { label?: string }) => <button type="button">{label ?? 'cue'}</button>,
}));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/hooks/useNextWebinar', () => ({ useNextWebinar: () => ({ nextEvent: null, loading: false }) }));
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
  useInView: () => motion.inView,
}));
vi.mock('@/app/content/how-it-works-demo', async (orig) => {
  const real = await orig<typeof import('@/app/content/how-it-works-demo')>();
  const video = {
    src: 'https://storage.googleapis.com/claritypledge-story-images/demo/test.mp4',
    poster: 'https://storage.googleapis.com/claritypledge-story-images/demo/test.jpg',
    posterAlt: 'A poster',
    playLabel: 'Play the product demo',
  };
  // Every page gets a film here (including /hospitals, which ships with none), so the wiring of each location is tested.
  return { ...real, DEMO_VIDEO: video, DEMO_BY_PAGE: Object.fromEntries(Object.keys(real.DEMO_BY_PAGE).map((k) => [k, video])) };
});

import { ProgramPage } from '@/app/pages/program-page';
import { CoachPartnershipPage } from '@/app/pages/coach-partnership-page';
import { OldLanding2Page } from '@/app/pages/old-landing-2';
import { HospitalsPage } from '@/app/pages/hospitals-page';
import { BuildRightThingLanding } from '@/app/pages/build-right-thing-landing';
import { ChangeManagersPage } from '@/app/pages/change-managers-page';
import type { UseCaseLocation } from '@/app/content/how-it-works-demo';

const PAGES: [UseCaseLocation, () => ReactElement][] = [
  ['builders', () => <BuildRightThingLanding />],
  ['change-managers', () => <ChangeManagersPage />],
  ['hiring', () => <ProgramPage />],
  ['founder', () => <OldLanding2Page />],
  ['hospitals', () => <HospitalsPage />],
  ['coach', () => <CoachPartnershipPage />],
];

const calls = (name: string) => track.mock.calls.filter((c) => c[0] === name);

beforeEach(() => {
  cleanup();
  track.mockClear();
  motion.inView = false;
});

describe('P1704 each page reports the demo with its own location', () => {
  it.each(PAGES)('%s: one video player, seen once and play once with its own location', (loc, page) => {
    motion.inView = true;
    const { container } = render(
      <MemoryRouter>
        <Routes>
          <Route path="*" element={page()} />
        </Routes>
      </MemoryRouter>,
    );
    // Exactly one play button on the page: the demo (the founder clip is gone).
    const plays = screen.getAllByRole('button', { name: /^play /i });
    expect(plays).toHaveLength(1);
    expect(plays[0]).toHaveAccessibleName('Play the product demo');
    expect(calls('demo_video_seen')).toEqual([['demo_video_seen', { location: loc }]]);
    fireEvent.click(plays[0]!);
    expect(calls('demo_video_play')).toEqual([['demo_video_play', { location: loc }]]);
    expect(container.querySelectorAll('video')).toHaveLength(1);
  });
});
