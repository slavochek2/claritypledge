/**
 * P1704 — the "How it works" section with the product demo on the six use-case pages.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
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

import { ProgramPage } from '@/app/pages/program-page';
import { CoachPartnershipPage } from '@/app/pages/coach-partnership-page';
import { OldLanding2Page } from '@/app/pages/old-landing-2';
import { HospitalsPage } from '@/app/pages/hospitals-page';
import { CommunitiesPage } from '@/app/pages/communities-page';
import { BuildRightThingLanding } from '@/app/pages/build-right-thing-landing';
import { ChangeManagersPage } from '@/app/pages/change-managers-page';
import { HowItWorksDemoSection } from '@/app/components/landing/how-it-works-demo';
import { DEMO_VIDEO, HOW_IT_WORKS, type DemoVideo, type UseCaseLocation } from '@/app/content/how-it-works-demo';

const PAGES: Record<UseCaseLocation, ReactElement> = {
  builders: <BuildRightThingLanding />,
  'change-managers': <ChangeManagersPage />,
  hiring: <ProgramPage />,
  founder: <OldLanding2Page />,
  hospitals: <HospitalsPage />,
  coach: <CoachPartnershipPage />,
};
const LOCATIONS = Object.keys(PAGES) as UseCaseLocation[];

const VIDEO: DemoVideo = {
  src: 'https://storage.googleapis.com/claritypledge-story-images/demo/test.mp4',
  poster: 'https://storage.googleapis.com/claritypledge-story-images/demo/test.jpg',
  posterAlt: 'A poster',
  playLabel: 'Play the product demo',
};

const renderPage = (el: ReactElement) =>
  render(
    <MemoryRouter>
      <Routes>
        <Route path="*" element={el} />
      </Routes>
    </MemoryRouter>,
  );
const seenAndPlay = () => track.mock.calls.filter((c) => c[0] === 'demo_video_seen' || c[0] === 'demo_video_play');

beforeEach(() => {
  cleanup();
  track.mockClear();
  motion.inView = false;
});

describe('P1704 the section on each of the six pages', () => {
  it('the demo constant points at the uploaded film and poster in the media bucket', () => {
    expect(DEMO_VIDEO).not.toBeNull();
    expect(DEMO_VIDEO!.src).toMatch(/^https:\/\/storage\.googleapis\.com\/claritypledge-story-images\/demo\/.+\.mp4$/);
    expect(DEMO_VIDEO!.poster).toMatch(/\/demo\/.+\.jpg$/);
    expect(DEMO_VIDEO!.playLabel).toBe('Play the product demo');
  });

  it('no [FOUNDER DECISION placeholder is left in the wording', () => {
    expect(JSON.stringify(HOW_IT_WORKS)).not.toContain('FOUNDER DECISION');
  });

  it.each(LOCATIONS)('%s: #how-it-works sits immediately before the Group Terms, numbered one before it, with a heading, 3-5 steps and one demo player', (loc) => {
    const { container } = renderPage(PAGES[loc]);
    const section = container.querySelector('#how-it-works')!;
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByRole('heading', { level: 2 })).toBeInTheDocument();
    const items = within(section as HTMLElement).getAllByRole('listitem');
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.length).toBeLessThanOrEqual(5);
    // The next section after it is the dark Group Terms band.
    const next = section.nextElementSibling as HTMLElement;
    expect(next.tagName).toBe('SECTION');
    expect(next.className).toContain('bg-slate-950');
    // Numbered like its neighbours: the Group Terms carry the next number.
    const num = (el: Element) => Number(el.querySelector('[aria-hidden].font-mono')?.textContent);
    expect(num(section)).toBeGreaterThan(0);
    expect(num(next)).toBe(num(section) + 1);
    // One player on the page, the demo; nothing loads until Play.
    expect(container.querySelectorAll('video').length).toBe(0);
    expect(screen.getAllByRole('button', { name: /^play /i }).map((b) => b.getAttribute('aria-label') ?? b.textContent)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Play the product demo' })).toBeInTheDocument();
  });

  it('/communities has no How it works section and no founder photo', () => {
    const { container } = renderPage(<CommunitiesPage />);
    expect(container.querySelector('#how-it-works')).toBeNull();
    expect(screen.queryByRole('img', { name: /founder of Clarity Pledge/i })).toBeNull();
  });
});

describe('P1704 placeholder state', () => {
  it('shows the placeholder with no play button, and fires no events when on screen', () => {
    motion.inView = true;
    render(<HowItWorksDemoSection location="builders" index="04" video={null} />);
    expect(screen.getByText(HOW_IT_WORKS.placeholder)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(seenAndPlay()).toEqual([]);
  });
});

describe('P1704 events with the video set', () => {
  it.each(LOCATIONS)('%s: seen once on screen, play once on click', (loc) => {
    motion.inView = true;
    const { rerender } = render(<HowItWorksDemoSection location={loc} index="04" video={VIDEO} />);
    rerender(<HowItWorksDemoSection location={loc} index="04" video={VIDEO} />);
    expect(track.mock.calls.filter((c) => c[0] === 'demo_video_seen')).toEqual([['demo_video_seen', { location: loc }]]);
    const play = screen.getByRole('button', { name: 'Play the product demo' });
    fireEvent.click(play);
    expect(track.mock.calls.filter((c) => c[0] === 'demo_video_play')).toEqual([['demo_video_play', { location: loc }]]);
    expect(track.mock.calls.filter((c) => c[0] === 'demo_video_seen')).toHaveLength(1);
  });

  it('pressing Play hands keyboard focus to the player', () => {
    const focus = vi.spyOn(HTMLMediaElement.prototype, 'focus');
    render(<HowItWorksDemoSection location="builders" index="04" video={VIDEO} />);
    const play = screen.getByRole('button', { name: 'Play the product demo' });
    play.focus();
    fireEvent.click(play);
    expect(focus).toHaveBeenCalledTimes(1);
    focus.mockRestore();
  });

  it('a scripted click (the button never had focus) does not move focus', () => {
    const focus = vi.spyOn(HTMLMediaElement.prototype, 'focus');
    render(<HowItWorksDemoSection location="builders" index="04" video={VIDEO} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play the product demo' }));
    expect(focus).not.toHaveBeenCalled();
    focus.mockRestore();
  });

  it('does not report seen while off screen', () => {
    render(<HowItWorksDemoSection location="coach" index="04" video={VIDEO} />);
    expect(track.mock.calls.filter((c) => c[0] === 'demo_video_seen')).toEqual([]);
  });

  it('a failed load after play shows the error line, not a black box', () => {
    const { container } = render(<HowItWorksDemoSection location="hiring" index="04" video={VIDEO} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play the product demo' }));
    fireEvent.error(container.querySelector('video')!);
    expect(screen.getByText(HOW_IT_WORKS.errorLine)).toBeInTheDocument();
    expect(container.querySelector('video')).toBeNull();
  });
});
