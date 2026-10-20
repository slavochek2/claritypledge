/**
 * @file p1512-focus-routes-have-back.test.tsx
 * @description P1512 review: on the phone, a focus route hides the bottom bar, and inside the shell the logo top nav is
 * gone too, so a page on such a route with no Back is a dead end. Guard: every route where
 * isBottomNavHiddenRoute is true AND the page is inside the shell renders a Back — a FocusHeader, or, for a
 * wizard, its own pinned step-back header named in the table with the reason.
 *
 * Three layers, so a gap in any one is caught by another:
 *  1. ROUTES: the samples are DERIVED from bottom-nav-routes.ts itself — the prefix list AND every regex rule
 *     (expanded alternation by alternation) — and each must be covered by a row of the table (in the shell,
 *     with a Back) or by an out-of-shell row whose claim is checked against App.tsx (a `compact` /
 *     `chromeFree` layout), or fail. At least one sample per derivation path.
 *  2. SOURCE: each in-shell row's route in App.tsx really is in the shell and renders the named page, and the
 *     page source declares the Back.
 *  3. BRANCHES: a Back in the source is not a Back on screen. The pages that return early from several states
 *     (accept-agreement, org-join not found, declined) are RENDERED in each state and must show a Back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CHAT_CONVERSATION_PREFIX, isBottomNavHiddenRoute } from '@/app/components/layout/bottom-nav-routes';

// ── collaborators for the rendered branches ─────────────────────────────────────────────────────
const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/auth', () => ({ useAuth: () => auth.value }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth.value }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/app/components/agreements/agreement-certificate', () => ({ AgreementCertificate: () => null }));
const agreements = vi.hoisted(() => ({ byToken: vi.fn(), lookup: vi.fn() }));
vi.mock('@/app/data/agreements-service', () => ({
  agreementsService: { getAgreementByToken: agreements.byToken, lookupUserByEmail: agreements.lookup },
}));
const orgSvc = vi.hoisted(() => ({ getOrganizationBySlug: vi.fn(), getMyMembership: vi.fn() }));
vi.mock('@/app/data/organizations-service', () => ({ organizationsService: orgSvc }));

import { AcceptAgreementPage } from '@/app/pages/accept-agreement-page';
import { DeclinedAgreementPage } from '@/app/pages/declined-agreement-page';
import { OrgJoinPage } from '@/app/pages/org-join-page';

const root = process.cwd();
const read = (rel: string) => readFileSync(`${root}/${rel}`, 'utf8');
const APP = read('src/App.tsx');
const ROUTES_SRC = read('src/app/components/layout/bottom-nav-routes.ts');

// ── the table ────────────────────────────────────────────────────────────────────────────────────
interface Row {
  /** The logical route; `:x` is a param. Samples derived from the rule are matched against this. */
  pattern: string;
  /** The `path="..."` in App.tsx when it differs from `pattern` (a splat). */
  appPath?: string;
  /** Component the App.tsx route renders. */
  component: string;
  /** Files that together must render the Back. */
  files: string[];
  /** The Back is the file's own wizard step header rather than a FocusHeader: what proves it, and why. */
  ownBack?: { marker: RegExp; why: string };
}

const SHELL_ROUTES: Row[] = [
  { pattern: '/agreements/new/create', component: 'CreateAgreementPage', files: ['src/app/pages/create-agreement-page.tsx'] },
  { pattern: '/agreements/confirm-email', component: 'AgreementEmailConfirmationPage', files: ['src/app/pages/agreement-email-confirmation-page.tsx'] },
  { pattern: '/agreements/:id', component: 'AgreementPage', files: ['src/app/pages/agreement-page.tsx'] },
  { pattern: '/agreements/:id/accept', component: 'AcceptAgreementPage', files: ['src/app/pages/accept-agreement-page.tsx'] },
  { pattern: '/agreements/:id/declined', component: 'DeclinedAgreementPage', files: ['src/app/pages/declined-agreement-page.tsx'] },
  { pattern: '/create', component: 'CreateStoryPage', files: ['src/app/pages/create-story-page.tsx'] },
  { pattern: '/letters/drafts/:docId', component: 'DocDetailPage', files: ['src/app/components/docs/doc-header.tsx'] },
  { pattern: '/me/calibration', component: 'CalibrationBreakdownPage', files: ['src/app/pages/calibration-breakdown-page.tsx'] },
  { pattern: '/topics', component: 'TopicsPage', files: ['src/app/pages/topics-page.tsx'] },
  { pattern: '/groups/:slug/join', component: 'OrgJoinPage', files: ['src/app/pages/org-join-page.tsx'] },
  { pattern: '/prepare', component: 'PreparePage', files: ['src/app/prototypes/events/prep/PreparePage.tsx'] },
  { pattern: '/events/:slug/close', component: 'EventClosePage', files: ['src/app/prototypes/events/close/EventClosePage.tsx'] },
  { pattern: '/events/:slug/confirm', appPath: '/events/*', component: 'EventsPrototype', files: ['src/app/prototypes/events/components/RsvpConfirm.tsx'] },
  {
    pattern: '/events/:slug/prepare', component: 'EventPrepPage', files: ['src/app/prototypes/events/prep/EventPrepPage.tsx'],
    ownBack: { marker: /aria-label="Back"\s+data-testid="header-back"/, why: 'a preparation wizard: its pinned header steps back through the steps (and ends on "Back to the event")' },
  },
];

/** Hidden routes that are NOT in the shell. Each is either checked against App.tsx or named as special. */
type Out = { pattern: string; appPath?: string; check: 'layout-flag' | 'special'; why: string };
const OUT_OF_SHELL: Out[] = [
  { pattern: '/meet', check: 'layout-flag', why: 'compact: one tap on one button' },
  { pattern: '/ready', check: 'layout-flag', why: 'compact single-question page' },
  { pattern: '/events/:slug/meet', check: 'layout-flag', why: 'the room: compact, its own header' },
  { pattern: '/events/:slug/ready', check: 'layout-flag', why: 'the room: compact, its own header' },
  { pattern: '/events/:slug/room', check: 'layout-flag', why: 'the room gate: compact' },
  { pattern: '/events/:slug/host', check: 'layout-flag', why: 'the host panel: compact, its own header' },
  { pattern: '/stake/:tag', check: 'layout-flag', why: 'compact: the page attendees land on from a room' },
  { pattern: '/explain-back/:id', check: 'layout-flag', why: 'chromeFree' },
  { pattern: '/org/:slug/join', appPath: '/org/*', check: 'special', why: 'redirects to /groups/:slug/join before it renders (P1193)' },
  { pattern: '/letter/:id', check: 'special', why: 'immersive letter reading/compose: no shell, the letter draws its own exit (P852)' },
  { pattern: '/transcribe', check: 'special', why: '/live and /transcribe keep their own sticky header, outside the shell' },
  { pattern: '/home/c/:id', check: 'special', why: 'an open chat conversation draws its own header and Back (P1512)' },
];

/** `/a/:x/b` -> a regex that matches `/a/<anything>/b` (and a trailing `/`). */
const routeRegex = (pattern: string) =>
  new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, m => (m === ':' ? m : '\\' + m)).replace(/:[A-Za-z]+/g, '[^/]+') + '/?$');

// ── derive the samples from the rule itself ──────────────────────────────────────────────────────
function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === sep && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts;
}
const literal = (s: string) => s.replace(/\\\//g, '/').replace(/\[\^\/\]\+/g, 'x');
function expandNode(p: string): string[] {
  const open = p.indexOf('(');
  if (open === -1) return [literal(p)];
  let depth = 0;
  let close = -1;
  for (let i = open; i < p.length; i++) {
    if (p[i] === '(') depth++;
    if (p[i] === ')' && --depth === 0) { close = i; break; }
  }
  const alts = splitTopLevel(p.slice(open + 1, close), '|');
  const heads = alts.flatMap(expandNode);
  const tails = expandNode(p.slice(close + 1));
  return heads.flatMap(h => tails.map(t => literal(p.slice(0, open)) + h + t));
}
const expandRegex = (src: string) => expandNode(src.replace(/^\^/, '').replace(/\$$/, '').replace(/\\\/\?$/, ''));

const FOCUS_ARRAY = ROUTES_SRC.match(/const focusRoutes = \[([^\]]*)\]/)?.[1] ?? '';
// The array holds quoted prefixes and the exported chat constant.
const PREFIXES = [
  ...Array.from(FOCUS_ARRAY.matchAll(/'([^']+)'/g)).map(m => m[1] as string),
  ...(FOCUS_ARRAY.includes('CHAT_CONVERSATION_PREFIX') ? [CHAT_CONVERSATION_PREFIX] : []),
];
const REGEX_RULES = Array.from(ROUTES_SRC.matchAll(/\/(\^.*?\$)\/\.test\(pathname\)/g)).map(m => m[1] as string);
const SAMPLES: Array<{ via: string; path: string }> = [
  ...PREFIXES.map(p => ({ via: `prefix ${p}`, path: p.endsWith('/') ? `${p}x` : p })),
  ...REGEX_RULES.flatMap(r => expandRegex(r).map(path => ({ via: `rule ${r}`, path }))),
];

const appRoute = (appPath: string) => {
  const at = APP.indexOf(`path="${appPath}"`);
  expect(at, `no <Route path="${appPath}"> in App.tsx`).toBeGreaterThan(-1);
  const win = APP.slice(at, at + 700);
  return win.split('</Route>')[0]!.split(/\n\s*\/>/)[0]!.split('/>')[0] + ' ' + win.slice(0, win.indexOf('<LazyRoute'));
};

describe('P1512 focus routes: derived samples', () => {
  it('the detectors are not blind: both the prefix list and the regex rules were found, and every derivation path made samples', () => {
    expect(PREFIXES.length, 'parsed no focusRoutes prefixes').toBeGreaterThan(5);
    expect(REGEX_RULES.length, 'parsed no regex rules').toBeGreaterThanOrEqual(5);
    for (const r of REGEX_RULES) expect(expandRegex(r).length, `rule ${r} expanded to no sample`).toBeGreaterThan(0);
    // A control per path: an alternation expands to all its alternatives.
    expect(expandRegex('^\\/(meet|events\\/[^/]+\\/meet)\\/?$')).toEqual(['/meet', '/events/x/meet']);
  });

  it.each(SAMPLES.map(s => [s.via, s.path]))('%s: sample %s really is a hidden route (the sample is real, not invented)', (_via, path) => {
    expect(isBottomNavHiddenRoute(path as string, ''), `${path} should hide the bottom bar`).toBe(true);
  });

  it.each(SAMPLES.map(s => [s.via, s.path]))('%s: sample %s is covered by an in-shell row (with a Back) or an out-of-shell row', (_via, path) => {
    const inShell = SHELL_ROUTES.some(r => routeRegex(r.pattern).test(path as string));
    const out = OUT_OF_SHELL.some(r => routeRegex(r.pattern).test(path as string) || (r.pattern.split('/:')[0] && (path as string).startsWith(r.pattern.split('/:')[0] + '/') && r.check === 'special'));
    expect(inShell || out, `${path} hides the bottom bar but no row covers it: add it to SHELL_ROUTES (with a Back) or OUT_OF_SHELL (with the reason)`).toBe(true);
  });
});

describe('P1512 every in-shell focus route renders a Back (source)', () => {
  it.each(SHELL_ROUTES.map(r => [r.pattern, r] as const))('%s is in the shell and %s renders a Back', (_p, r) => {
    const routeText = appRoute(r.appPath ?? r.pattern);
    const layout = routeText.match(/<ClarityLandingLayout([^>]*)>/)?.[1] ?? '';
    expect(layout, `${r.pattern} must use the shell layout`).toMatch(/surface="product"/);
    expect(layout, `${r.pattern} is out of the shell (${layout.trim()}); list it in OUT_OF_SHELL instead`).not.toMatch(/compact|chromeFree|logoOnly/);
    expect(APP.slice(APP.indexOf(`path="${r.appPath ?? r.pattern}"`), APP.indexOf(`path="${r.appPath ?? r.pattern}"`) + 700)).toContain(`<${r.component}`);

    const src = r.files.map(read).join('\n');
    if (r.ownBack) expect(src, r.ownBack.why).toMatch(r.ownBack.marker);
    else expect(src, `${r.component} has no <FocusHeader — a phone user has no way out`).toMatch(/<FocusHeader\b/);
  });

  it.each(OUT_OF_SHELL.filter(o => o.check === 'layout-flag').map(o => [o.pattern, o] as const))('%s: the claim "out of the shell" is checked against App.tsx', (_p, o) => {
    const layout = appRoute(o.appPath ?? o.pattern).match(/<ClarityLandingLayout([^>]*)>/)?.[1] ?? '';
    expect(layout, `${o.pattern} (${o.why}) is not compact/chromeFree/logoOnly in App.tsx — it is IN the shell and needs a Back row`).toMatch(/compact|chromeFree|logoOnly/);
  });

  it('the control: a route in the shell would be rejected as an out-of-shell claim', () => {
    const layout = appRoute('/create').match(/<ClarityLandingLayout([^>]*)>/)?.[1] ?? '';
    expect(/compact|chromeFree|logoOnly/.test(layout)).toBe(false);
  });
});

describe('P1512 every rendered BRANCH of a hidden-bar page shows a Back', () => {
  const back = () => screen.getAllByRole('button', { name: /^(Go back|Back to .+)$/ });

  beforeEach(() => {
    vi.clearAllMocks();
    auth.value = { user: null, session: null, isLoading: false, sessionChecked: true, refreshProfile: vi.fn() };
  });

  function renderAccept(url: string) {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/agreements/:id/accept" element={<AcceptAgreementPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }
  const agreement = (over: Record<string, unknown> = {}) => ({
    id: 'a-1', status: 'pending', creatorProfileId: 'creator-1', partnerProfileId: null, partnerEmail: null, partnerDisplayName: null,
    creator: { name: 'Creator' }, displayId: 'D-1', agreementVersion: 1, ...over,
  });

  it('accept-agreement, invalid (no token)', async () => {
    renderAccept('/agreements/a-1/accept');
    await screen.findByText(/expired or is invalid/);
    expect(back().length).toBeGreaterThan(0);
  });

  it('accept-agreement, invalid (the token matches nothing)', async () => {
    agreements.byToken.mockResolvedValue(null);
    renderAccept('/agreements/a-1/accept?token=nope');
    await screen.findByText(/expired or is invalid/);
    expect(back().length).toBeGreaterThan(0);
  });

  it('accept-agreement, wrong user (already signed / not addressed to you)', async () => {
    auth.value = { ...auth.value, user: { id: 'u1', name: 'Ada' }, session: { user: { id: 'u1' } } };
    agreements.byToken.mockResolvedValue(agreement({ status: 'active' }));
    renderAccept('/agreements/a-1/accept?token=t');
    await screen.findByText(/already been signed or is not addressed to you/);
    expect(back().length).toBeGreaterThan(0);
  });

  it('accept-agreement, the partner state', async () => {
    auth.value = { ...auth.value, user: { id: 'u1', name: 'Ada Lovelace' }, session: { user: { id: 'u1' } } };
    agreements.byToken.mockResolvedValue(agreement());
    renderAccept('/agreements/a-1/accept?token=t');
    await screen.findByText(/invited you/);
    expect(back().length).toBeGreaterThan(0);
  });

  it('accept-agreement, the signed-out (unauthenticated) state', async () => {
    agreements.byToken.mockResolvedValue(agreement());
    renderAccept('/agreements/a-1/accept?token=t');
    await screen.findByText(/invited you/);
    expect(back().length).toBeGreaterThan(0);
  });

  it('declined agreement', () => {
    render(<MemoryRouter><DeclinedAgreementPage /></MemoryRouter>);
    expect(back().length).toBeGreaterThan(0);
  });

  it('org-join, the group does not exist (/groups/missing/join)', async () => {
    orgSvc.getOrganizationBySlug.mockResolvedValue(null);
    render(
      <MemoryRouter initialEntries={['/groups/missing/join']}>
        <Routes>
          <Route path="/groups/:slug/join" element={<OrgJoinPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText('Group not found');
    expect(back().length).toBeGreaterThan(0);
  });

  it('org-join, the terms (the group exists)', async () => {
    orgSvc.getOrganizationBySlug.mockResolvedValue({ id: 'org-1', slug: 'cm', name: 'CM', blurb: null, description: null, visibility: 'public', hasEvents: false });
    orgSvc.getMyMembership.mockResolvedValue(null);
    render(
      <MemoryRouter initialEntries={['/groups/cm/join']}>
        <Routes>
          <Route path="/groups/:slug/join" element={<OrgJoinPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Join CM/));
    expect(back().length).toBeGreaterThan(0);
  });
});
