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
import { HowItWorksDemoSection, WatchDemoLink } from '@/app/components/landing/how-it-works-demo';
import { DEMO_BY_PAGE, DEMO_VIDEO, HOW_IT_WORKS, type DemoVideo, type UseCaseLocation } from '@/app/content/how-it-works-demo';

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

  it('every page but /hospitals shows the shared demo until its own film exists', () => {
    for (const loc of LOCATIONS) expect(DEMO_BY_PAGE[loc]).toBe(loc === 'hospitals' ? null : DEMO_VIDEO);
  });

  it('no [FOUNDER DECISION placeholder is left in the wording', () => {
    expect(JSON.stringify(HOW_IT_WORKS)).not.toContain('FOUNDER DECISION');
  });

  it.each(LOCATIONS)('%s: #how-it-works sits near the top (after the stat band, before the numbered argument), unnumbered, with a heading, 3-5 steps and one demo player', (loc) => {
    const { container } = renderPage(PAGES[loc]);
    const section = container.querySelector('#how-it-works')!;
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByRole('heading', { level: 2, name: HOW_IT_WORKS.heading })).toBeInTheDocument();
    const items = within(section as HTMLElement).getAllByRole('listitem');
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.length).toBeLessThanOrEqual(5);
    // Same order on every page: hero, its stat band, then the film (/coach has no stat band: hero, then the film).
    const prev = section.previousElementSibling as HTMLElement;
    if (loc === 'coach') expect(prev.querySelector('h1')).not.toBeNull();
    else {
      expect(prev.id).toBe('stakes');
      expect(prev.previousElementSibling?.querySelector('h1')).not.toBeNull();
    }
    // Before every numbered section, and carries no number itself.
    expect(container.querySelectorAll('#how-it-works')).toHaveLength(1);
    // Section numbers only (the mono number beside each h2), as P1674's numbering test reads them.
    const numbered = [...container.querySelectorAll('h2')].map((h) => h.closest('.grid')?.querySelector('.font-mono')).filter((n): n is Element => !!n && /^0\d$/.test(n.textContent ?? ''));
    expect(numbered.length).toBeGreaterThan(0);
    // The argument's numbers run 01, 02, ... with no gap or repeat, and each page keeps its count.
    const COUNT: Record<UseCaseLocation, number> = { builders: 5, 'change-managers': 3, hiring: 4, founder: 4, hospitals: 4, coach: 4 };
    expect(numbered.map((n) => n.textContent)).toEqual(Array.from({ length: COUNT[loc] }, (_, i) => `0${i + 1}`));
    for (const n of numbered) expect(section.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(section as HTMLElement).queryByText(/^0\d$/)).toBeNull();
    // One player on the page (none on /hospitals); nothing loads until Play.
    expect(container.querySelectorAll('video').length).toBe(0);
    expect(screen.queryAllByRole('button', { name: /^play /i })).toHaveLength(loc === 'hospitals' ? 0 : 1);
  });

  it('/communities has no How it works section and no founder photo', () => {
    const { container } = renderPage(<CommunitiesPage />);
    expect(container.querySelector('#how-it-works')).toBeNull();
    expect(screen.queryByRole('img', { name: /founder of Clarity Pledge/i })).toBeNull();
  });
});

describe('P1704 a page with no film', () => {
  it('shows the heading and steps, no frame, no button, and fires no events when on screen', () => {
    motion.inView = true;
    const { container } = render(<HowItWorksDemoSection location="hospitals" />);
    expect(screen.getByRole('heading', { level: 2, name: HOW_IT_WORKS.heading })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(HOW_IT_WORKS.steps.length);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    // No frame at all: the steps follow the heading directly.
    expect(container.querySelector('.aspect-video')).toBeNull();
    expect(container.querySelector('#how-it-works ol')?.previousElementSibling).toBeInstanceOf(HTMLHeadingElement);
    expect(seenAndPlay()).toEqual([]);
  });
});

describe('P1704 events with the video set', () => {
  it.each(LOCATIONS)('%s: seen once on screen, play once on click', (loc) => {
    motion.inView = true;
    const { rerender } = render(<HowItWorksDemoSection location={loc} video={VIDEO} />);
    rerender(<HowItWorksDemoSection location={loc} video={VIDEO} />);
    expect(track.mock.calls.filter((c) => c[0] === 'demo_video_seen')).toEqual([['demo_video_seen', { location: loc }]]);
    const play = screen.getByRole('button', { name: 'Play the product demo' });
    fireEvent.click(play);
    expect(track.mock.calls.filter((c) => c[0] === 'demo_video_play')).toEqual([['demo_video_play', { location: loc }]]);
    expect(track.mock.calls.filter((c) => c[0] === 'demo_video_seen')).toHaveLength(1);
  });

  it('pressing Play hands keyboard focus to the player', () => {
    const focus = vi.spyOn(HTMLMediaElement.prototype, 'focus');
    render(<HowItWorksDemoSection location="builders" video={VIDEO} />);
    const play = screen.getByRole('button', { name: 'Play the product demo' });
    play.focus();
    fireEvent.click(play);
    expect(focus).toHaveBeenCalledTimes(1);
    focus.mockRestore();
  });

  it('a scripted click (the button never had focus) does not move focus', () => {
    const focus = vi.spyOn(HTMLMediaElement.prototype, 'focus');
    render(<HowItWorksDemoSection location="builders" video={VIDEO} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play the product demo' }));
    expect(focus).not.toHaveBeenCalled();
    focus.mockRestore();
  });

  it('does not report seen while off screen', () => {
    render(<HowItWorksDemoSection location="coach" video={VIDEO} />);
    expect(track.mock.calls.filter((c) => c[0] === 'demo_video_seen')).toEqual([]);
  });

  it('a failed load after play shows the error line, not a black box', () => {
    const { container } = render(<HowItWorksDemoSection location="hiring" video={VIDEO} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play the product demo' }));
    fireEvent.error(container.querySelector('video')!);
    expect(screen.getByText(HOW_IT_WORKS.errorLine)).toBeInTheDocument();
    expect(container.querySelector('video')).toBeNull();
  });
});

describe('P1704 the hero link "Watch the product demo"', () => {
  it('sends demo_link_clicked, brings the film into view and starts it', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { container } = render(
      <>
        <WatchDemoLink location="hiring" />
        <HowItWorksDemoSection location="hiring" video={VIDEO} />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Watch the product demo' }));
    expect(track.mock.calls.filter((c) => c[0] === 'demo_link_clicked')).toEqual([['demo_link_clicked', { location: 'hiring' }]]);
    expect(track.mock.calls.filter((c) => c[0] === 'demo_video_play')).toEqual([['demo_video_play', { location: 'hiring' }]]);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(container.querySelector('video')).not.toBeNull();
  });

  it('only the named page\'s film answers the link', () => {
    Element.prototype.scrollIntoView = vi.fn();
    const { container } = render(
      <>
        <WatchDemoLink location="hiring" />
        <div id="other"><HowItWorksDemoSection location="coach" video={VIDEO} /></div>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Watch the product demo' }));
    expect(container.querySelector('#other video')).toBeNull();
    expect(track.mock.calls.filter((c) => c[0] === 'demo_video_play')).toEqual([]);
  });

  it('is not offered where the page has no film: /hospitals keeps the pledge link', () => {
    renderPage(<HospitalsPage />);
    expect(screen.queryByRole('button', { name: 'Watch the product demo' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Take the Pledge' })).toHaveAttribute('href', '/sign-pledge');
  });
});

describe('P1704 the hero link, edge cases', () => {
  it('a second click after the film has started resumes the player instead of doing nothing', () => {
    Element.prototype.scrollIntoView = vi.fn();
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    render(
      <>
        <WatchDemoLink location="hiring" />
        <HowItWorksDemoSection location="hiring" video={VIDEO} />
      </>,
    );
    const link = screen.getByRole('button', { name: 'Watch the product demo' });
    fireEvent.click(link);
    play.mockClear();
    fireEvent.click(link);
    expect(play).toHaveBeenCalledTimes(1);
    play.mockRestore();
  });

  it('renders nothing for a page with no film', () => {
    const { container } = render(<WatchDemoLink location="hospitals" />);
    expect(container).toBeEmptyDOMElement();
  });
});
