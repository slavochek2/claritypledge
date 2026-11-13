/**
 * P1680 — an invite link (`?referrer=` / `?login=`) on /hiring, /coach, /founder or /builders must
 * not stay in history after its redirect. Pinned: from a prior page, open the invite URL, land on
 * /sign-pledge or /login, press Back, and arrive at the prior page — not at the invite URL, whose
 * redirect would fire again and trap the visitor. Also pinned on the same path: the targets and
 * their precedence, and `landing_page_viewed` (with its referrer) tracked once before the landing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
vi.mock('framer-motion', async (orig) => ({
  ...(await orig<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
  useInView: () => false,
}));

import { ProgramPage } from '@/app/pages/program-page';
import { CoachPartnershipPage } from '@/app/pages/coach-partnership-page';
import { OldLanding2Page } from '@/app/pages/old-landing-2';
import { BuildRightThingLanding } from '@/app/pages/build-right-thing-landing';

const PAGES = {
  '/hiring': ProgramPage,
  '/coach': CoachPartnershipPage,
  '/founder': OldLanding2Page,
  '/builders': BuildRightThingLanding,
} as const;
type Path = keyof typeof PAGES;

const views = () => track.mock.calls.filter((c) => c[0] === 'landing_page_viewed');

/** Stand-in for /sign-pledge and /login: records what was tracked by the time it mounted, offers Back. */
let viewsAtLanding: unknown[][] | null = null;
function Landed({ name }: { name: string }) {
  const navigate = useNavigate();
  viewsAtLanding ??= views().map((c) => [c[0], c[1]]);
  return (
    <div>
      <p>landed {name}</p>
      <button type="button" onClick={() => navigate(-1)}>browser back</button>
    </div>
  );
}

/** History is [/prior, invite URL], positioned on the invite URL, as when a visitor follows a link. */
function openFromPriorPage(url: string) {
  const path = url.split('?')[0] as Path;
  const Page = PAGES[path];
  return render(
    <MemoryRouter initialEntries={['/prior', url]} initialIndex={1}>
      <Routes>
        <Route path="/prior" element={<p>on prior page</p>} />
        <Route path={path} element={<Page />} />
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
  describe.each(Object.keys(PAGES) as Path[])('%s', (path) => {
    it.each([
      [`${path}?referrer=x`, 'sign-pledge', 'x'],
      [`${path}?login=1`, 'login', undefined],
      // Precedence: the referrer wins over login.
      [`${path}?referrer=x&login=1`, 'sign-pledge', 'x'],
    ])('%s → /%s, then Back returns to the prior page', async (url, target, referrer) => {
      openFromPriorPage(url);
      expect(screen.getByText(`landed ${target}`)).toBeInTheDocument();

      // landing_page_viewed fired once, with its referrer, before the redirect landed.
      expect(viewsAtLanding).toHaveLength(1);
      expect((viewsAtLanding![0]![1] as { referrer?: string }).referrer).toBe(referrer);

      fireEvent.click(screen.getByRole('button', { name: 'browser back' }));
      expect(await screen.findByText('on prior page')).toBeInTheDocument();
      expect(screen.queryByText(/landed/)).toBeNull();
      // The invite page never re-mounted, so it tracked no second view.
      expect(views()).toHaveLength(1);
    });

    it(`${path}?referrer=&login= does not redirect (empty values are falsy)`, () => {
      openFromPriorPage(`${path}?referrer=&login=`);
      expect(screen.queryByText(/landed|on prior page/)).toBeNull();
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
  });
});
