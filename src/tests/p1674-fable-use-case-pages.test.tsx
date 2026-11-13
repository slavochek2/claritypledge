/**
 * P1674 — /hiring, /coach, /founder, /hospitals and /communities render the fable layout. Covered:
 * every event of the spec's Analytics table fired from its action with its exact properties, the
 * untracked actions firing nothing, the invite redirects, each page's hero and closing actions, the
 * locked-copy spot checks, section order, the SEO props, and the hero drawing (picture pages only:
 * five distinct shapes, story for screen readers only, static under reduced motion).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import type { EventWithHost } from '@/app/types';

const track = vi.fn();
const seoProps = vi.fn();
const motion = { reduce: true, inView: false };
const webinar: { nextEvent: EventWithHost | null } = { nextEvent: null };

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: (...a: unknown[]) => track(...a) } }));
vi.mock('@/app/components/landing/social-proof', () => ({
  PledgerAvatarStack: () => <div data-testid="pledgers" />,
  ScrollIndicator: ({ label, targetId }: { label?: string; targetId?: string }) => (
    <button type="button" data-target={targetId ?? ''}>{label ?? 'scroll cue'}</button>
  ),
}));
vi.mock('@/app/components/seo', () => ({ SEO: (p: Record<string, unknown>) => { seoProps(p); return null; } }));
vi.mock('@/app/hooks/useNextWebinar', () => ({ useNextWebinar: () => ({ nextEvent: webinar.nextEvent, loading: false }) }));
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => motion.reduce,
  useInView: () => motion.inView,
}));

import { ProgramPage } from '@/app/pages/program-page';
import { CoachPartnershipPage } from '@/app/pages/coach-partnership-page';
import { OldLanding2Page } from '@/app/pages/old-landing-2';
import { HospitalsPage } from '@/app/pages/hospitals-page';
import { CommunitiesPage } from '@/app/pages/communities-page';
import { HOSPITALS_OG } from '@/app/content/hospitals-og';
import { AGREED_COACH, AGREED_COMMUNITIES, AGREED_FOUNDER, AGREED_HIRING, AGREED_HOSPITALS, COACH_CAST, FOUNDER_CAST, HIRING_CAST } from '@/app/components/landing/fable/fable-content';
import { WEBINAR_CTA_LABEL, WEBINAR_REGISTER_URL } from '@/app/content/webinar';

const CALL = 'Book a 15-min discovery call';
const PAGES = {
  '/hiring': ProgramPage,
  '/coach': CoachPartnershipPage,
  '/founder': OldLanding2Page,
  '/hospitals': HospitalsPage,
  '/communities': CommunitiesPage,
} as const;
type Path = keyof typeof PAGES;

function renderAt(url: string) {
  const path = url.split('?')[0] as Path;
  const Page = PAGES[path];
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path={path} element={<Page />} />
        <Route path="/sign-pledge" element={<div>landed sign-pledge</div>} />
        <Route path="/login" element={<div>landed login</div>} />
        <Route path="*" element={<div>landed elsewhere</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
const calls = () => track.mock.calls.map((c) => [c[0], c[1]]);
/** Renders the page afresh (own container, scoped query), clears the load-time events, clicks one element and returns what that click tracked. */
function clickOn(url: string, target: (scope: ReturnType<typeof within>) => HTMLElement) {
  cleanup(); // unmount any earlier render so only this page's DOM exists
  const { unmount, container } = renderAt(url);
  track.mockClear();
  fireEvent.click(target(within(container)));
  const tracked = calls();
  unmount();
  return tracked;
}
const links = (name: string | RegExp) => screen.getAllByRole('link', { name });
const scopedLinks = (scope: ReturnType<typeof within>, name: string | RegExp) => scope.getAllByRole('link', { name });
const h2s = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

beforeEach(() => {
  track.mockClear();
  seoProps.mockClear();
  motion.reduce = true;
  motion.inView = false;
  webinar.nextEvent = null;
});

describe('P1674 invite redirects (/hiring, /coach, /founder)', () => {
  describe.each(['/hiring', '/coach', '/founder'] as const)('%s', (path) => {
    it.each([
      [`${path}?referrer=x`, 'landed sign-pledge'],
      [`${path}?login=1`, 'landed login'],
      // Precedence: the referrer wins over login.
      [`${path}?referrer=x&login=1`, 'landed sign-pledge'],
    ])('%s lands on the right page', (url, landed) => {
      renderAt(url);
      expect(screen.getByText(landed)).toBeInTheDocument();
    });

    it.each([path, `${path}?referrer=&login=`])('%s stays on the page (empty values are falsy)', (url) => {
      renderAt(url);
      expect(screen.queryByText(/landed/)).toBeNull();
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
  });

  it.each(['/hospitals?referrer=x&login=1', '/communities?referrer=x&login=1'])('%s has no redirect, and none is added', (url) => {
    renderAt(url);
    expect(screen.queryByText(/landed/)).toBeNull();
  });
});

describe('P1674 /hiring: events and actions', () => {
  it('page view once, with variant "program" and the referrer from the query', () => {
    const { unmount } = renderAt('/hiring');
    expect(calls()).toEqual([['landing_page_viewed', { referrer: undefined, variant: 'program' }]]);
    unmount();
    track.mockClear();
    renderAt('/hiring?referrer=abc');
    expect(track.mock.calls.filter((c) => c[0] === 'landing_page_viewed')).toEqual([['landing_page_viewed', { referrer: 'abc', variant: 'program' }]]);
  });

  it('both discovery-call buttons go to /intro and send location "hero"; the pledge link sends nothing', () => {
    renderAt('/hiring');
    const ctas = links(CALL);
    expect(ctas).toHaveLength(2);
    for (const a of ctas) expect(a).toHaveAttribute('href', '/intro');
    expect(links('Take the Pledge')).toHaveLength(1);
    expect(links('Take the Pledge')[0]).toHaveAttribute('href', '/sign-pledge');
    expect(clickOn('/hiring', (s) => scopedLinks(s, CALL)[0]!)).toEqual([['alignment_audit_cta_clicked', { location: 'hero' }]]);
    expect(clickOn('/hiring', (s) => scopedLinks(s, CALL)[1]!)).toEqual([['alignment_audit_cta_clicked', { location: 'hero' }]]);
    expect(clickOn('/hiring', (s) => scopedLinks(s, 'Take the Pledge')[0]!)).toEqual([]);
  });
});

describe('P1674 /coach: events and actions', () => {
  it('page view once, with the referrer and NO variant', () => {
    renderAt('/coach?referrer=&x=1');
    expect(track.mock.calls.map((c) => c[0])).toEqual(['landing_page_viewed']);
    const props = track.mock.calls[0]![1] as Record<string, unknown>;
    expect(Object.keys(props)).toEqual(['referrer']);
    expect(props.referrer).toBeUndefined();
  });

  it('hero and closing each offer the discovery call and the pledge link; none of the four is tracked', () => {
    renderAt('/coach');
    const ctas = links(CALL);
    const pledges = links('Take the Pledge');
    expect(ctas).toHaveLength(2);
    expect(pledges).toHaveLength(2);
    for (const a of ctas) expect(a).toHaveAttribute('href', '/intro');
    for (const a of pledges) expect(a).toHaveAttribute('href', '/sign-pledge');
    // The closing pair lives in #book.
    const book = document.getElementById('book')!;
    expect(within(book).getByRole('link', { name: CALL })).toBe(ctas[1]);
    expect(within(book).getByRole('link', { name: 'Take the Pledge' })).toBe(pledges[1]);
    for (const i of [0, 1]) {
      expect(clickOn('/coach', (s) => scopedLinks(s, CALL)[i]!)).toEqual([]);
      expect(clickOn('/coach', (s) => scopedLinks(s, 'Take the Pledge')[i]!)).toEqual([]);
    }
  });

  it('the hero cue is the untargeted arrow', () => {
    renderAt('/coach');
    const cue = screen.getByRole('button', { name: 'scroll cue' });
    expect(cue.dataset.target).toBe('');
  });
});

describe('P1674 /founder: events and actions', () => {
  it('page view once, with variant "old-landing-2" and the referrer', () => {
    renderAt('/founder');
    expect(calls()).toEqual([['landing_page_viewed', { referrer: undefined, variant: 'old-landing-2' }]]);
  });

  it('with no upcoming event: both buttons are the discovery call, location "hero", has_event false, no date line', () => {
    renderAt('/founder');
    const ctas = links(CALL);
    expect(ctas).toHaveLength(2);
    for (const a of ctas) expect(a).toHaveAttribute('href', '/intro');
    expect(screen.queryByText(WEBINAR_CTA_LABEL)).toBeNull();
    expect(screen.queryByText(/Live ·/)).toBeNull();
    for (const i of [0, 1]) expect(clickOn('/founder', (s) => scopedLinks(s, CALL)[i]!)).toEqual([['webinar_cta_clicked', { location: 'hero', has_event: false }]]);
  });

  it('with an upcoming event: both buttons are the next experiment, location "hero", has_event true, with the date line', () => {
    webinar.nextEvent = { datetime: '2030-03-04T10:00:00Z' } as EventWithHost;
    renderAt('/founder');
    const ctas = links(WEBINAR_CTA_LABEL);
    expect(ctas).toHaveLength(2);
    for (const a of ctas) expect(a).toHaveAttribute('href', WEBINAR_REGISTER_URL);
    expect(screen.queryByRole('link', { name: CALL })).toBeNull();
    expect(screen.getAllByText(/^Live · /)).toHaveLength(2);
    for (const i of [0, 1]) expect(clickOn('/founder', (s) => scopedLinks(s, WEBINAR_CTA_LABEL)[i]!)).toEqual([['webinar_cta_clicked', { location: 'hero', has_event: true }]]);
  });

  it('the hero pledge link goes to /sign-pledge and sends nothing', () => {
    renderAt('/founder');
    expect(links('Take the Pledge')).toHaveLength(1);
    expect(links('Take the Pledge')[0]).toHaveAttribute('href', '/sign-pledge');
    expect(clickOn('/founder', (s) => scopedLinks(s, 'Take the Pledge')[0]!)).toEqual([]);
  });

  it('keeps the testimonials\' external links', () => {
    renderAt('/founder');
    const external = screen.getAllByRole('link').filter((a) => a.getAttribute('target') === '_blank');
    expect(external.length).toBeGreaterThan(0);
    for (const a of external) expect(a.getAttribute('rel')).toContain('noopener');
  });
});

describe('P1674 /hospitals: events and actions', () => {
  it('page view, the discovery call by location, the tracked pledge link', () => {
    const { unmount } = renderAt('/hospitals');
    expect(calls()).toEqual([['landing_page_viewed', { variant: 'hospitals' }]]);
    expect(links(CALL)).toHaveLength(2);
    unmount();
    expect(clickOn('/hospitals', (s) => scopedLinks(s, CALL)[0]!)).toEqual([['hospitals_cta_clicked', { location: 'hero' }]]);
    expect(clickOn('/hospitals', (s) => scopedLinks(s, CALL)[1]!)).toEqual([['hospitals_cta_clicked', { location: 'closing' }]]);
    expect(clickOn('/hospitals', (s) => s.getByRole('link', { name: 'Take the Pledge' }))).toEqual([['hospitals_pledge_clicked', undefined]]);
  });
});

describe('P1674 /communities: events and actions', () => {
  it('page view, "Learn how it works" → /prepare by location, the manifesto link, and no pledge link', () => {
    const { unmount } = renderAt('/communities');
    expect(calls()).toEqual([['landing_page_viewed', { variant: 'communities' }]]);
    const learn = links('Learn how it works');
    expect(learn).toHaveLength(2);
    for (const a of learn) expect(a).toHaveAttribute('href', '/prepare');
    expect(screen.getByRole('link', { name: 'read the manifesto' })).toHaveAttribute('href', '/manifesto');
    expect(screen.queryByRole('link', { name: /Take the Pledge/ })).toBeNull();
    expect(screen.queryByRole('link', { name: CALL })).toBeNull();
    unmount();
    expect(clickOn('/communities', (s) => scopedLinks(s, 'Learn how it works')[0]!)).toEqual([['communities_cta_clicked', { location: 'hero' }]]);
    expect(clickOn('/communities', (s) => scopedLinks(s, 'Learn how it works')[1]!)).toEqual([['communities_cta_clicked', { location: 'closing' }]]);
    expect(clickOn('/communities', (s) => s.getByRole('link', { name: 'read the manifesto' }))).toEqual([['communities_manifesto_clicked', undefined]]);
  });
});

describe('P1674 the gap exchange on every page: its own view event, once, with no properties', () => {
  it.each([
    ['/hiring', 'hiring_exchange_viewed', 'Teammate'],
    ['/coach', 'coach_exchange_viewed', 'Client'],
    ['/founder', 'founder_exchange_viewed', 'Co-founder'],
    ['/hospitals', 'hospitals_exchange_viewed', 'Ward doctor'],
    ['/communities', 'communities_exchange_viewed', 'Member'],
  ] as const)('%s → %s; the other person is the %s', (path, event, role) => {
    motion.inView = true;
    renderAt(path);
    expect(track.mock.calls.filter((c) => c[0] === event)).toEqual([[event]]);
    expect(within(screen.getByTestId('exchange-visual')).getByText(role)).toBeInTheDocument();
    // "How the platform works" and its unbuilt agent claim are gone.
    expect(screen.queryByText(/How the platform works/i)).toBeNull();
    expect(screen.queryByText(/Agents flag/i)).toBeNull();
  });

  it('the three new casts report to Sentry under their own surface', () => {
    expect([HIRING_CAST.surface, COACH_CAST.surface, FOUNDER_CAST.surface]).toEqual(['hiring-exchange', 'coach-exchange', 'founder-exchange']);
  });

  it('/coach keeps #how on the exchange', () => {
    renderAt('/coach');
    expect(document.getElementById('how')).toContainElement(screen.getByTestId('gap-exchange'));
  });
});

describe('P1674 the founder talk clip', () => {
  it.each(['/hiring', '/coach', '/founder', '/hospitals'] as const)('%s sends founder_clip_play from the clip', (path) => {
    expect(clickOn(path, (s) => s.getByRole('button', { name: /play the founder talk clip/i }))).toEqual([['founder_clip_play', { location: 'founder_credibility' }]]);
  });
});

describe('P1674 copy and sections', () => {
  it('/hiring keeps its sections in order, with the stakes before the chat', () => {
    renderAt('/hiring');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe("Keep the hire you can't afford to lose.");
    expect(screen.getByText('Protecting high-stakes relationships')).toBeInTheDocument();
    const order = [
      "What your new hire didn't send you.",
      'Everybody assumes they understand',
      'Why almost nobody verifies understanding',
      'The illusion of shared understanding',
      'Reveal a gap in understanding, then bridge it',
      'Protect the relationship before your interests quietly diverge',
      'Your new hire nods. And maybe holds back.',
    ];
    expect(h2s().filter((t) => order.includes(t!))).toEqual(order);
    const stakes = document.getElementById('stakes')!;
    expect(stakes.textContent).toContain('46%');
    expect(stakes.textContent).toContain('of new hires fail within 18 months. 9 out of 10 of them fail because of attitude, not a lack of technical skills.');
    // The bridge line is its own paragraph inside the band, not nested in the stat's.
    const bridge = within(stakes).getByText('Small understanding gaps compound.');
    expect(bridge.tagName).toBe('P');
    expect(bridge.parentElement!.closest('p')).toBeNull();
    expect(stakes.compareDocumentPosition(screen.getByText('Katie')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Make hidden misunderstandings easy to reveal and safe to bridge.')).toBeInTheDocument();
  });

  it('/coach keeps its hero lines, its own deleted-message chat, its Venn and its section order', () => {
    renderAt('/coach');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Stop losing customers.');
    expect(screen.getByText('Reducing customer churn for coaches & therapists')).toBeInTheDocument();
    expect(screen.getByText('Honesty is risky when the stakes are high.')).toBeInTheDocument();
    expect(screen.getByText('Make the hard truth safe to share.')).toBeInTheDocument();
    expect(screen.getByText('Your Customer')).toBeInTheDocument();
    expect(screen.getByText('You deleted this message')).toBeInTheDocument();
    expect(screen.getByText(/Customer lost/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Two circles barely overlapping/ })).toBeInTheDocument();
    const order = [
      'When the hard truth is difficult to say',
      'Everybody assumes they understand',
      'The illusion of shared understanding',
      'Why almost nobody verifies understanding',
      'Reveal a gap in understanding, then bridge it',
      'Role model a partnership that survives disagreement.',
      "Your customer nods. But doesn't understand.",
    ];
    expect(h2s().filter((t) => order.includes(t!))).toEqual(order);
    expect(document.getElementById('agreement')!.textContent).toContain('Role model a partnership that survives disagreement.');
    expect(screen.getByText('Stop it before they churn.')).toBeInTheDocument();
  });

  it('/founder keeps its sections in order, with the stakes before the chat and the testimonials after the founder', () => {
    renderAt('/founder');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe("I've lost co-founders. I help you keep yours.");
    const stakes = document.getElementById('stakes')!;
    expect(stakes.textContent).toContain('65%');
    expect(stakes.textContent).toContain('of high-potential startups fail from co-founder conflict');
    const order = [
      'Everybody assumes they understand',
      'Why almost nobody verifies understanding',
      'The illusion of shared understanding',
      'Reveal a gap in understanding, then bridge it',
      'Protect your partnership so it survives strong disagreements',
      'Your co-founder nods. And maybe holds back.',
    ];
    expect(h2s().filter((t) => order.includes(t!))).toEqual(order);
    expect(screen.getByText('Stop before you split.')).toBeInTheDocument();
  });

  it('/hospitals keeps the brochure norm-path line and its own reasons', () => {
    renderAt('/hospitals');
    expect(screen.getByText('New staff onboard fast, digitally.')).toBeInTheDocument();
    expect(screen.queryByText('New joiners onboard fast, digitally.')).toBeNull();
    expect(screen.getByText(/Read-back covers clinical orders, not everyday talk\./)).toBeInTheDocument();
  });

  it('/communities follows hero → member chat → why → exchange → terms → closing, with no TEMPLATE stamp', () => {
    renderAt('/communities');
    const order = [
      "What a member didn't say at the last meetup.",
      'Why almost nobody verifies understanding',
      'Reveal a gap in understanding, then bridge it',
      'The terms your members agree to',
      'Try them at your next important meeting',
    ];
    expect(h2s().filter((t) => order.includes(t!))).toEqual(order);
    const terms = document.getElementById('terms')!;
    expect(within(terms).getByLabelText('Clarity Group Terms')).toBeInTheDocument();
    expect(terms.textContent).not.toMatch(/Template/i);
    expect(document.getElementById('why')).toContainElement(screen.getByText('Maya'));
    expect(screen.getByRole('heading', { level: 3, name: 'It feels awkward' })).toBeInTheDocument();
  });

  it.each(['/hiring', '/coach', '/founder'] as const)('%s keeps the TEMPLATE stamp on its partner agreement', (path) => {
    renderAt(path);
    expect(screen.getByText('Template — sample agreement, not a real signed document')).toBeInTheDocument();
  });
});

describe('P1674 numbering follows the fable pages', () => {
  const numbers = () => [...document.querySelectorAll('h2')].map((h) => h.closest('.grid')?.querySelector('.font-mono')?.textContent ?? null).filter(Boolean);
  it.each([
    ['/hiring', ['01', '02', '03', '04']],
    ['/coach', ['01', '02', '03', '04']],
    ['/founder', ['01', '02', '03', '04']],
    ['/hospitals', ['01', '02', '03', '04']],
    ['/communities', ['01', '02']],
  ] as const)('%s numbers its arguing sections %j', (path, expected) => {
    renderAt(path);
    expect(numbers()).toEqual(expected);
  });
});

describe('P1674 SEO (unchanged)', () => {
  it.each([
    ['/hiring', { title: "Keep the Key Hire You Can't Afford to Lose", url: '/hiring' }],
    ['/coach', { title: 'Clarity Pledge for Coaches', url: '/coach' }],
    ['/founder', { title: 'Clarity Program for Co-Founders', url: '/founder' }],
    ['/communities', { title: 'Clarity Group Terms for communities', url: '/communities' }],
  ] as const)('%s', (path, expected) => {
    renderAt(path);
    const p = seoProps.mock.calls.at(-1)![0];
    expect(p).toMatchObject(expected);
    expect(p.noIndex).toBeFalsy();
    expect(typeof p.description).toBe('string');
  });

  it('descriptions are the existing ones', () => {
    const description = (path: Path) => {
      seoProps.mockClear();
      const { unmount } = renderAt(path);
      const d = seoProps.mock.calls.at(-1)![0].description;
      unmount();
      return d;
    };
    expect(description('/hiring')).toBe('A free alignment audit for founders making a key hire: a live 1:1 session that finds the blind spot in how you align with your team. Starts with a 15-min call.');
    expect(description('/coach')).toBe("Your client didn't disagree with your advice. They misunderstood it. Give them a way to tell a misunderstanding from a real disagreement.");
    expect(description('/founder')).toBe("I've lost co-founders. I help you keep yours. A coached program where co-founder pairs verify they actually understand each other — before they commit.");
    expect(description('/communities')).toBe('Make it normal to ask how well your members understand each other. Shared guidelines for any community.');
  });

  it('/hospitals: its OG card, noindex', () => {
    renderAt('/hospitals');
    expect(seoProps.mock.calls.at(-1)![0]).toEqual({
      title: HOSPITALS_OG.title, description: HOSPITALS_OG.description, url: '/hospitals', image: HOSPITALS_OG.image, noIndex: true,
    });
  });
});

describe('P1674 the hero drawing', () => {
  it.each([
    ['/hospitals', AGREED_HOSPITALS, 'Why it matters', 'stakes'],
    ['/communities', AGREED_COMMUNITIES, "What a member didn't say", 'why'],
  ] as const)('%s draws five people, five distinct shapes, all diverged; its story is screen-reader only', (path, example, nextLabel, nextId) => {
    renderAt(path);
    const card = screen.getByTestId('agreed-graphic');
    const figures = [...card.querySelectorAll<SVGGElement>('[data-figure]')];
    expect(figures).toHaveLength(5);
    expect(new Set(figures.map((f) => f.dataset.shape)).size).toBe(5);
    expect(new Set(example.people.map((p) => p.picture)).size).toBe(5);
    expect(figures.every((f) => f.dataset.outcome === 'diverged')).toBe(true);
    // Every word of the story, the closing line included, sits in sr-only containers; the drawing is hidden.
    expect(card.querySelector('svg')).toHaveAttribute('aria-hidden');
    const caption = card.querySelector('figcaption')!;
    expect(caption.textContent).toBe(example.punchline);
    expect(caption).toHaveClass('sr-only');
    const story = within(card).getByText(`“${example.said}”`).closest('div')!;
    expect(story).toHaveClass('sr-only');
    for (const p of example.people) expect(story.textContent).toContain(`${p.name} ${p.did}`);
    // Its cues: the phone cue to the drawing, and the page's own.
    expect(screen.getByRole('button', { name: 'See an example' }).dataset.target).toBe('example');
    expect(screen.getByRole('button', { name: nextLabel }).dataset.target).toBe(nextId);
  });

  it.each(['/hospitals', '/communities'] as const)('%s: under reduced motion the drawing is its final frame and stays there', (path) => {
    vi.useFakeTimers();
    try {
      motion.inView = true;
      renderAt(path);
      expect(screen.getByTestId('agreed-graphic')).toHaveAttribute('data-phase', 'close');
      vi.advanceTimersByTime(10000);
      expect(screen.getByTestId('agreed-graphic')).toHaveAttribute('data-phase', 'close');
      for (const f of screen.getByTestId('agreed-graphic').querySelectorAll<SVGGElement>('[data-figure]')) expect(f.dataset.reveal).toBe('shown');
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['/hiring', AGREED_HIRING],
    ['/coach', AGREED_COACH],
    ['/founder', AGREED_FOUNDER],
  ] as const)('%s draws two people, two distinct shapes, both diverged; its story is screen-reader only', (path, example) => {
    renderAt(path);
    const card = screen.getByTestId('agreed-graphic');
    const figures = [...card.querySelectorAll<SVGGElement>('[data-figure]')];
    expect(figures).toHaveLength(2);
    expect(new Set(figures.map((f) => f.dataset.shape)).size).toBe(2);
    expect(example.people).toHaveLength(2);
    expect(new Set(example.people.map((p) => p.picture)).size).toBe(2);
    expect(figures.every((f) => f.dataset.outcome === 'diverged')).toBe(true);
    expect(card.querySelector('svg')).toHaveAttribute('aria-hidden');
    const caption = card.querySelector('figcaption')!;
    expect(caption.textContent).toBe(example.punchline);
    expect(caption).toHaveClass('sr-only');
    const story = within(card).getByText(`“${example.said}”`).closest('div')!;
    expect(story).toHaveClass('sr-only');
    for (const p of example.people) expect(story.textContent).toContain(`${p.name} ${p.did}`);
    expect(document.getElementById('example')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'See an example' }).dataset.target).toBe('example');
  });

  it.each(['/hiring', '/coach', '/founder'] as const)('%s: under reduced motion the two-person drawing is its final frame and stays there', (path) => {
    vi.useFakeTimers();
    try {
      motion.inView = true;
      renderAt(path);
      expect(screen.getByTestId('agreed-graphic')).toHaveAttribute('data-phase', 'close');
      vi.advanceTimersByTime(10000);
      expect(screen.getByTestId('agreed-graphic')).toHaveAttribute('data-phase', 'close');
      for (const f of screen.getByTestId('agreed-graphic').querySelectorAll<SVGGElement>('[data-figure]')) expect(f.dataset.reveal).toBe('shown');
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['/hiring', '/founder'] as const)('%s: the hero cue still reads "Why it matters" and targets #stakes', (path) => {
    renderAt(path);
    expect(screen.getByRole('button', { name: 'Why it matters' }).dataset.target).toBe('stakes');
  });
});

describe('P1674 routes', () => {
  const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, 'utf8');

  it('/hiring, /coach and /founder are registered without a DEV gate; /hospitals and /communities stay in USE_CASE_LANDINGS', () => {
    const app = read('src/App.tsx');
    for (const path of ['/hiring', '/coach']) expect(app).toContain(`path="${path}"`);
    const founder = app.split('\n').find((l) => l.includes('path="/founder"'))!;
    expect(founder).not.toContain('import.meta.env.DEV');
    expect(app).toMatch(/PROD-REACHABLE: \(P987\)/);
    const landings = read('src/app/routes/use-case-landings.ts');
    for (const path of ['/hospitals', '/communities']) expect(landings).toContain(`path: "${path}"`);
  });

  it('the temporary drawing preview is gone, and every /tree route is still DEV-gated on its own line', () => {
    const routes = read('src/app/tree/tree-routes.tsx');
    expect(routes).not.toContain('landing-fable-examples');
    expect(read('src/app/pages/TreePage.tsx')).not.toContain('landing-fable-examples');
    for (const line of routes.split('\n').filter((l) => l.includes('<Route path="/tree'))) expect(line).toMatch(/import\.meta\.env\.DEV &&/);
  });
});
