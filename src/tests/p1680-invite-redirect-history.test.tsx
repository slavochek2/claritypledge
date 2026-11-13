/**
 * P1680 — an invite link (`?referrer=` / `?login=`) on /hiring, /coach, /founder or /builders must
 * not stay in history after its redirect. Pinned: from a prior page, open the invite URL, land on
 * /sign-pledge or /login, press Back, and arrive at the prior page — not at the invite URL, whose
 * redirect would fire again and trap the visitor. Also pinned on the same path: the targets and
 * their precedence, and `landing_page_viewed` (with its referrer) tracked exactly once, already by
 * the time the target mounts. That the view effect runs BEFORE the redirect effect is declaration
 * order in each page's source; this test cannot tell the two effects apart, since navigate() only
 * schedules the route change. `/` (HomeRedirect) forwards invite links to /builders with its own
 * replace, so that entry path is pinned too.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';

const track = vi.fn();
vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: (...a: unknown[]) => track(...a) } }));
vi.mock('@/app/components/landing/social-proof', () => ({
  PledgerAvatarStack: () => <div data-testid="pledgers" />,
  ScrollIndicator: ({ label }: { label?: string }) => <button type="button">{label ?? 'scroll cue'}</button>,
}));
vi.mock('@/app/components/landing/founder-credibility', () => ({ FounderCredibility: () => <section /> }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/hooks/useNextWebinar', () => ({ useNextWebinar: () => ({ nextEvent: null, loading: false }) }));
vi.mock('@/app/routes/home-readiness', () => ({ useHomeReadiness: () => ({ state: 'signed-out', retry: () => {} }) }));
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
  useInView: () => false,
}));

import { ProgramPage } from '@/app/pages/program-page';
import { CoachPartnershipPage } from '@/app/pages/coach-partnership-page';
import { OldLanding2Page } from '@/app/pages/old-landing-2';
import { BuildRightThingLanding } from '@/app/pages/build-right-thing-landing';
import { HomeRedirect } from '@/app/routes/home-redirect';

const PAGES = {
  '/hiring': ProgramPage,
  '/coach': CoachPartnershipPage,
  '/founder': OldLanding2Page,
  '/builders': BuildRightThingLanding,
} as const;
type Path = keyof typeof PAGES;
type Entry = Path | '/';
/** The variant each entry's page view carries; `/` forwards to /builders, so it tracks as /builders. */
const VARIANT: Record<Entry, string | undefined> = {
  '/hiring': 'program',
  '/coach': undefined,
  '/founder': 'old-landing-2',
  '/builders': 'build-right-thing',
  '/': 'build-right-thing',
};

const views = () => track.mock.calls.filter((c) => c[0] === 'landing_page_viewed');

/** Stand-in for /sign-pledge and /login: records what was tracked by the time it mounted. */
let viewsAtLanding: unknown[][] | null = null;
function Landed({ name }: { name: string }) {
  useEffect(() => {
    viewsAtLanding ??= views().map((c) => [c[0], c[1]]);
  }, []);
  return <p>landed {name}</p>;
}

/** The browser's Back, available on every page (rendered outside <Routes>). */
function BackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>browser back</button>;
}
const pressBack = () => fireEvent.click(screen.getByRole('button', { name: 'browser back' }));

/** History is [/prior, invite URL], positioned on the invite URL, as when a visitor follows a link. */
function openFromPriorPage(url: string) {
  return render(
    <MemoryRouter initialEntries={['/prior', url]} initialIndex={1}>
      <BackButton />
      <Routes>
        <Route path="/prior" element={<p>on prior page</p>} />
        <Route path="/" element={<HomeRedirect />} />
        {(Object.keys(PAGES) as Path[]).map((p) => {
          const Page = PAGES[p];
          return <Route key={p} path={p} element={<Page />} />;
        })}
        <Route path="/sign-pledge" element={<Landed name="sign-pledge" />} />
        <Route path="/login" element={<Landed name="login" />} />
        <Route path="*" element={<p>landed elsewhere</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  track.mockClear();
  viewsAtLanding = null;
});

describe('P1680 invite redirect leaves no history entry behind', () => {
  describe.each([...(Object.keys(PAGES) as Path[]), '/'] as Entry[])('%s', (path) => {
    it.each([
      [`${path}?referrer=x`, 'sign-pledge', 'x'],
      [`${path}?login=1`, 'login', undefined],
      // Precedence: the referrer wins over login.
      [`${path}?referrer=x&login=1`, 'sign-pledge', 'x'],
    ])('%s → /%s, then Back returns to the prior page', async (url, target, referrer) => {
      openFromPriorPage(url);
      expect(screen.getByText(`landed ${target}`)).toBeInTheDocument();

      // landing_page_viewed: exactly one, from this entry's page, with the referrer, already
      // tracked when the target mounted.
      expect(viewsAtLanding).toHaveLength(1);
      const props = viewsAtLanding![0]![1] as { referrer?: string; variant?: string };
      expect(props.referrer).toBe(referrer);
      expect(props.variant).toBe(VARIANT[path]);

      pressBack();
      expect(await screen.findByText('on prior page')).toBeInTheDocument();
      expect(screen.queryByText(/landed/)).toBeNull();
      // The invite page never re-mounted, so it tracked no second view.
      expect(views()).toHaveLength(1);
    });

    it(`${path}?referrer=&login= does not redirect (empty values are falsy), and Back still returns to the prior page`, async () => {
      openFromPriorPage(`${path}?referrer=&login=`);
      expect(screen.queryByText(/landed|on prior page/)).toBeNull();
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();

      pressBack();
      expect(await screen.findByText('on prior page')).toBeInTheDocument();
    });
  });
});
