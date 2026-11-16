/**
 * @file p1692-redirect-targets.test.tsx
 * @description P1692: one rule for every place that sends a person to an address taken from the page address
 * (`?redirect=` on the sign-in and sign-up pages, `?returnTo=` on the live page, `?letterId=` on the sign-up page):
 * the target is accepted only by the shared check, and the shared check accepts only an address that the router
 * and the browser leave as typed and that sits under an allowed root. An entry page (sign-in, sign-up, the sign-in
 * landing pages) is never a target.
 *
 * "As typed" matters because the router rewrites `.`, `..` and empty segments, and the browser's address parser
 * rewrites the percent-encoded dot forms, tabs, newlines and trailing spaces. A check on the typed string would
 * otherwise be run on a different address than the one the person lands on. The check reads the path only: a query
 * or fragment is never rewritten into the path, so it is never inspected. Nothing is decoded: an address neither
 * resolver changes is accepted.
 *
 * The universal claim is tested over a GENERATED set of segment combinations and scored on the real pipeline
 * (the router's result, then read by the browser's parser), not on a hand-picked list. Legitimate targets every
 * producer in src/ emits sit beside the refused ones (epistemic gate 7c). Source checks derive their members from
 * the files (gate 7e) and prove they fire by undoing a real edit in a copy of the real file (gate 7d).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, resolvePath, useLocation } from 'react-router-dom';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as allowlist from '@/auth/redirect-allowlist';
import { isSafeRedirectPath, ALLOWED_REDIRECT_PREFIXES } from '@/auth/redirect-allowlist';

// --- Mocks (the two pages are rendered for real; only their data and auth edges are stubbed) ---------------------

const authState: { user: unknown; sessionChecked: boolean; isLoading: boolean } = { user: null, sessionChecked: true, isLoading: false };
vi.mock('@/auth', () => ({ useAuth: () => authState }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('@/app/components/pledge/login-form', () => ({ LoginForm: () => <div>login form</div> }));
vi.mock('@/app/components/auth/google-auth-button', () => ({ GoogleAuthButton: () => <button>Continue with Google</button> }));
vi.mock('@/app/data/letters-service', () => ({
  submitLetterResponseAuthenticated: vi.fn().mockResolvedValue('delivery-1'),
  requestLetterResponseSignin: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/app/data/api', () => ({ signInWithEmail: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn(), identify: vi.fn(), setUserProperties: vi.fn() } }));
vi.mock('@/lib/session-guard', () => ({ takeSignInAgainNotice: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { LoginPage } from '@/app/pages/login-page';
import { SignupPage } from '@/app/pages/signup-page';

const SRC = join(__dirname, '..');
const BASE = 'https://app.test';
const ENTRY_ROOTS = ['/auth', '/login', '/signup', '/sign-pledge'];
/** The check the sign-in and sign-up pages use for "send me back where I was": the shared roots plus the feed pages. */
const isSafeReturnPath = (path: string | null | undefined): boolean => {
  const check = (allowlist as unknown as { isSafeReturnPath?: (p: string | null | undefined) => boolean }).isSafeReturnPath;
  if (!check) throw new Error('redirect-allowlist.ts does not export isSafeReturnPath');
  return check(path);
};

function Landed() {
  const location = useLocation();
  return <div data-testid="landed">{location.pathname + location.search + location.hash}</div>;
}

/** Renders the app's entry pages for a signed-in person at `start` and reports the address the app ends up on. */
async function landAt(start: string): Promise<string> {
  const view = render(
    <MemoryRouter initialEntries={[start]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<Landed />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(view.queryByTestId('landed')).not.toBeNull());
  const landed = view.getByTestId('landed').textContent ?? '';
  view.unmount();
  return landed;
}

const landingFrom = (page: 'login' | 'signup', redirect: string | null) => landAt(`/${page}${redirect === null ? '' : `?redirect=${encodeURIComponent(redirect)}`}`);

/** What every `?redirect=` / `?returnTo=` producer in src/ emits (see redirect-allowlist.ts for the reconciliation). */
const PRODUCER_TARGETS = [
  '/events/my-event',
  '/events/my-event/room',
  '/events/my-event/meet',
  '/letters',
  '/letters?tab=inbox',
  '/artifacts?tab=letters&list=received',
  '/letter/00000000-0000-4000-8000-000000000000/confirm',
  '/letter/00000000-0000-4000-8000-000000000000?tab=x',
  '/agreements/00000000-0000-4000-8000-000000000000/accept?token=abc',
  '/groups/cm/join?from=x',
  '/connect/Ab3dE6gH',
  '/me/calibration',
  '/sessions',
  '/create',
  '/live',
  '/live/ABC123',
  '/transcribe/ROOM77',
  '/p/ana/canvas/sales',
  '/point/abc-123',
];

/** Produced by the topics and compare pages; the shared check did not list their roots. */
const PRODUCER_TARGETS_MISSING_A_ROOT = ['/topics', '/compare/ben-tan?tag=ikigai1'];

/**
 * The prompt to sign in from a point card sends the page's own address. On the feed and stake pages that is an
 * address the sign-in LANDING page does not honour (it sends a new member to the point instead), so these two roots
 * are accepted for the already-signed-in bounce only.
 */
const RETURN_ONLY_TARGETS = ['/feed?sort=oldest', '/feed', '/stake/ikigai1'];

/** Addresses with dots that are ordinary names, not `.` or `..` segments. */
const DOTTED_NAMES = ['/p/ana.lee', '/p/ana.lee/canvas/v1.2', '/events/night-2.0', '/p/..a', '/p/a..', '/p/...'];

/** A query or fragment is never rewritten into the path, so nothing in it is a reason to refuse. */
const FREE_QUERIES = ['/create?q=100%', '/events/x?next=../y', '/events/x#../y', '/events/list?q=a..b', '/chat?draft=either/or', '/agreements/123/accept?token=abc..def', '/events/x?a=1//2', '/events/x?q=%E0%A4%A'];

/** Neither the router nor the browser changes these, so they are not refused: nothing is decoded by the check. */
const UNCHANGED_BY_BOTH = ['/p/a%2F..%2Fb', '/p/50%25off', '/p/%252e%252e', '/p/..%5Cx', '/p/ana/canvas/my%2Fcanvas', '/p/a%20b', '/p/josé', '/events/x/'];

/** A target that is not in resolved form: the router or the browser would rewrite it, so it is not the address that was checked. */
const REWRITTEN = [
  ...ALLOWED_REDIRECT_PREFIXES.map((root) => `${root}/../elsewhere?x=1`),
  '/p/../login',
  '/p/./../signup',
  '/events/x/../../elsewhere',
  '/p/x/..',
  '/p/%2e%2e/elsewhere?x=1',
  '/p/%2E%2E/elsewhere?x=1',
  '/p/.%2e/elsewhere?x=1',
  '/p/%2e./elsewhere?x=1',
  '/p/%2e/x',
  '/p//elsewhere',
  '/events//x',
  '/p/.\t./elsewhere',
  '/p/..\n/elsewhere',
  '/p/\r../x',
  '/p/.. ',
];

/**
 * A percent-encoded dot is a dot to the browser. At the end of an address it only drops the last segment, so the
 * count-based oracle below does not see it; the rule that refuses it is tested on its own.
 */
const ENCODED_DOT_AT_THE_END = ['/p/x/%2e', '/p/x/%2E', '/events/night/%2e', '/p/x/%2e?tab=1', '/p/x/%2e#top'];

beforeEach(() => {
  authState.user = { id: 'u1', slug: 'jane-doe' };
  authState.sessionChecked = true;
  authState.isLoading = false;
  sessionStorage.clear();
});

const under = (pathname: string, roots: readonly string[]) => roots.some((r) => pathname === r || pathname.startsWith(`${r}/`));

/**
 * Where a target really lands: the router resolves it, then the browser's parser reads the router's result (that
 * is what `history.pushState` does with it). Returns why it is not the address that was checked, or null.
 */
function rewrittenBecause(target: string): string | null {
  const typed = (target.split(/[?#]/, 1)[0] ?? '').split('/');
  const routed = resolvePath(target);
  let browser: URL;
  try {
    browser = new URL(routed.pathname + routed.search + routed.hash, BASE);
  } catch {
    return 'the browser cannot parse it';
  }
  if (browser.origin !== BASE) return `leaves the app (${browser.origin})`;
  for (const [who, pathname] of [['router', routed.pathname], ['browser', browser.pathname], ['browser alone', new URL(target, BASE).pathname]] as const) {
    const landed = pathname.split('/');
    if (landed.length !== typed.length) return `${who} changes the number of segments: ${pathname}`;
    if (landed[1] !== typed[1]) return `${who} changes the first segment: ${pathname}`;
    if (under(pathname, ENTRY_ROOTS)) return `${who} lands on an entry page: ${pathname}`;
  }
  return null;
}

describe('P1692: the shared check accepts only a target the router and the browser leave as typed', () => {
  it('RULE: a target is accepted only in resolved form; the router and the browser rewrite these forms', () => {
    expect(resolvePath('/p/../elsewhere?x=1').pathname).toBe('/elsewhere');
    expect(resolvePath('/events/x/../../elsewhere').pathname).toBe('/elsewhere');
    expect(resolvePath('/p//x').pathname).toBe('/p/x');
    expect(new URL('/p/%2e%2e/elsewhere', BASE).pathname).toBe('/elsewhere');
    expect(new URL('/p/.. ', BASE).pathname).toBe('/');
  });

  it.each(ENCODED_DOT_AT_THE_END)('refuses %j: the browser reads the encoded dot as a dot and drops the segment', (target) => {
    const typed = target.split(/[?#]/, 1)[0] ?? '';
    expect(new URL(target, BASE).pathname, 'the fixture must really be rewritten by the browser').not.toBe(typed);
    expect(isSafeRedirectPath(target)).toBe(false);
    expect(isSafeReturnPath(target)).toBe(false);
  });

  it.each(REWRITTEN)('refuses %j', (target) => {
    expect(rewrittenBecause(target), 'the fixture must really be rewritten').not.toBeNull();
    expect(isSafeRedirectPath(target)).toBe(false);
    expect(isSafeReturnPath(target)).toBe(false);
  });

  it('GENERATED: whatever it accepts keeps its first segment and its segment count through the router and then the browser, and is never an entry page', () => {
    const atoms = ['.', '..', '%2e', '%2E', '.%2e', '%2e.', '%2e%2e', '%2E%2e', '%252e%252e', '\t', '\n', '\r', ' ', '%20', '%09', '%2F', '%5C', '%00', ';', '..;', 'x', '', '\u0085', ' ', '．．', '...', 'a.b'];
    const roots = ['/p', '/events', '/letter', '/feed'];
    const tails = ['', '/login', '/x', '?next=../y', '#../y', ' ', '/', '/..'];
    const candidates = new Set<string>();
    for (const root of roots) for (const a of atoms) for (const b of atoms) for (const tail of tails) {
      candidates.add(`${root}/${a}/${b}${tail}`);
      candidates.add(`${root}/${a}${b}${tail}`);
    }
    let accepted = 0;
    let refused = 0;
    const escaped: string[] = [];
    for (const candidate of candidates) {
      const ok = isSafeRedirectPath(candidate) || isSafeReturnPath(candidate);
      if (!ok) { refused++; continue; }
      accepted++;
      const why = rewrittenBecause(candidate);
      if (why) escaped.push(`${JSON.stringify(candidate)}: ${why}`);
    }
    // Not vacuous: the set must contain both kinds, and the oracle must object to the forms it was built to catch.
    expect(candidates.size).toBeGreaterThan(20000);
    expect(accepted).toBeGreaterThan(1000);
    expect(refused).toBeGreaterThan(1000);
    expect(rewrittenBecause('/p/../login')).toMatch(/segments|entry page/);
    expect(rewrittenBecause('/p/%2e%2e/x')).toMatch(/segments|first segment/);
    expect(rewrittenBecause('/p/x/y')).toBeNull();
    expect(escaped.slice(0, 15), `${escaped.length} accepted target(s) are rewritten`).toEqual([]);
  });

  it('no entry page is an allowed root, for either check', () => {
    for (const root of ENTRY_ROOTS) expect(ALLOWED_REDIRECT_PREFIXES, root).not.toContain(root);
    for (const target of ['/auth/callback', '/auth/verify?x=1', '/login', '/signup?redirect=/events/x', '/sign-pledge']) {
      expect(isSafeRedirectPath(target), target).toBe(false);
      expect(isSafeReturnPath(target), target).toBe(false);
    }
  });

  it.each([...PRODUCER_TARGETS, ...DOTTED_NAMES, ...FREE_QUERIES, ...UNCHANGED_BY_BOTH])('KEPT: still accepts %j', (target) => {
    expect(rewrittenBecause(target), 'the fixture must not be rewritten').toBeNull();
    expect(isSafeRedirectPath(target)).toBe(true);
  });

  it.each(PRODUCER_TARGETS_MISSING_A_ROOT)('accepts %j, which a page in src/ already sends people back to', (target) => {
    expect(isSafeRedirectPath(target)).toBe(true);
  });

  it.each(RETURN_ONLY_TARGETS)('%j is accepted for the signed-in bounce and still not honoured by the landing page', (target) => {
    expect(isSafeReturnPath(target)).toBe(true);
    expect(isSafeRedirectPath(target)).toBe(false);
  });

  it('the bounce check accepts everything the shared check accepts', () => {
    for (const target of [...PRODUCER_TARGETS, ...PRODUCER_TARGETS_MISSING_A_ROOT, ...DOTTED_NAMES, ...FREE_QUERIES, ...UNCHANGED_BY_BOTH]) {
      expect(isSafeReturnPath(target), target).toBe(true);
    }
  });
});

describe.each(['login', 'signup'] as const)('P1692: /%s sends an already signed-in person only to a target the shared check accepts', (page) => {
  it.each(['/sign-pledge', '/elsewhere?x=1', '/p/../elsewhere?x=1', '/events/../elsewhere?x=1', '/p/%2e%2e/elsewhere?x=1', '/p//elsewhere', '/admin/users', 'https://elsewhere.example/events'])(
    'a refused target %j falls back to the person\'s own page',
    async (target) => {
      expect(await landingFrom(page, target)).toBe('/p/jane-doe');
    },
  );

  it.each([...PRODUCER_TARGETS, ...PRODUCER_TARGETS_MISSING_A_ROOT, ...RETURN_ONLY_TARGETS, '/create?q=100%', '/events/x?next=../y'])('KEPT: a normal redirect still lands on %j', async (target) => {
    expect(await landingFrom(page, target)).toBe(target);
  });

  it('KEPT: no redirect lands on the person\'s own page, and a person without a handle on the home page', async () => {
    expect(await landingFrom(page, null)).toBe('/p/jane-doe');
    authState.user = { id: 'u1', slug: '' };
    expect(await landingFrom(page, null)).toBe('/');
  });

  it('KEPT: a redirect back into sign-in or sign-up is still refused', async () => {
    expect(await landingFrom(page, '/login?redirect=/events/x')).toBe('/p/jane-doe');
    expect(await landingFrom(page, '/signup')).toBe('/p/jane-doe');
  });
});

describe('P1692: the sign-up page turns `letterId` into exactly one address segment', () => {
  const at = (letterId: string | null) => landAt(`/signup?source=letter-response${letterId === null ? '' : `&letterId=${encodeURIComponent(letterId)}`}`);

  it.each(['../../events/elsewhere?x=1&y=', '../../elsewhere?x=1&y=', '../elsewhere?x=1#', 'a/b', '..', 'a?b=c'])(
    'a value with address characters, %j, still lands on the letter confirm route',
    async (letterId) => {
      const landed = new URL(await at(letterId), BASE);
      expect(landed.pathname.split('/')).toHaveLength(4);
      expect(landed.pathname.startsWith('/letter/')).toBe(true);
      expect(landed.pathname.endsWith('/confirm')).toBe(true);
      expect(landed.search).toBe('');
      expect(landed.hash).toBe('');
    },
  );

  it.each(['00000000-0000-4000-8000-000000000000', 'L1', 'st5'])('KEPT: the ordinary id %j lands on the byte-identical confirm address', async (letterId) => {
    expect(await at(letterId)).toBe(`/letter/${letterId}/confirm`);
  });

  it('KEPT: no id lands on the home page, as before', async () => {
    expect(await at(null)).toBe('/');
  });
});

// --- Source checks ------------------------------------------------------------------------------------------------

/** Every non-test source file under src/. */
function sourceFiles(dir: string = SRC, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'tests' || name === '__tests__' || name === 'node_modules') continue;
      sourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Code only: block comments and line comments blanked, line numbers kept, so a check is never satisfied by a
 * comment. String literals are kept whole: a `//` inside one is not a comment, and must not hide the rest of its line.
 */
function codeLines(source: string): string[] {
  const STRING_OR_COMMENT = /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|(^|[\s;{}(),])\/\/[^\n]*/gm;
  return source
    .replace(STRING_OR_COMMENT, (match: string, literal: string | undefined, lead: string | undefined) => {
      if (literal !== undefined) return match;
      const kept = lead ?? '';
      return kept + match.slice(kept.length).replace(/[^\n]/g, '');
    })
    .split('\n');
}

const LIVE_READ = "const returnTo = safeRedirectOrNull(searchParams.get('returnTo'));";
const LIVE_REF = 'safeReturnToRef.current = returnTo;';

/**
 * The live page reads `returnTo` off the address ONCE, through the shared check, and navigates to it in six
 * places: four through `safeReturnToRef.current` (filled from `returnTo`) and two directly. Because the one read
 * is checked, every navigation is. Returns whatever breaks that: a second read, a read that skips the check, a ref
 * filled from anything else, another name carrying the value, or a navigation in an unknown shape.
 */
function liveReturnToFindings(source: string): { findings: string[]; navigations: number } {
  const lines = codeLines(source);
  const findings: string[] = [];
  const reads = lines.filter((l) => /\.get\(\s*['"]returnTo['"]\s*\)/.test(l));
  if (reads.length !== 1 || reads[0]?.trim() !== LIVE_READ) findings.push(`returnTo is not read exactly once through the shared check (${reads.length} read(s))`);
  let navigations = 0;
  lines.forEach((line, i) => {
    if (/safeReturnToRef\.current\s*=(?!=)/.test(line) && line.trim() !== LIVE_REF) findings.push(`${i + 1}: the ref is filled from something other than returnTo`);
    for (const name of line.replace(/'[^']*'|"[^"]*"/g, '').match(/[A-Za-z_]\w*/g) ?? []) {
      if (/returnto/i.test(name) && name !== 'returnTo' && name !== 'safeReturnToRef') findings.push(`${i + 1}: another name carries the value: ${name}`);
    }
    const arg = (line.match(/navigate\(([^,]*)/)?.[1] ?? '').trim();
    if (!/returnTo/i.test(arg)) return;
    navigations++;
    if (arg !== 'safeReturnToRef.current' && arg !== 'returnTo' && arg !== "returnTo ?? '/live'") findings.push(`${i + 1}: ${line.trim()}`);
  });
  return { findings, navigations };
}

/** An address segment filled raw from a value the same file read off the page address. */
function parameterSegmentSites(source: string): string[] {
  const lines = codeLines(source);
  const names = new Set([...lines.join('\n').matchAll(/(?:const|let)\s+(\w+)\s*=\s*[\w.()?! ]*?\.get\(\s*['"][\w-]+['"]\s*\)/g)].map((m) => m[1] ?? ''));
  const sites: string[] = [];
  lines.forEach((line, i) => {
    for (const name of names) if (new RegExp('`[^`]*/\\$\\{\\s*' + name + '\\b').test(line)) sites.push(`${i + 1} [${name}]`);
  });
  return sites;
}

describe('P1692: the live page takes `returnTo` through the shared check in all six navigations', () => {
  const LIVE = join(SRC, 'app/pages/clarity-live-page.tsx');
  const source = readFileSync(LIVE, 'utf8');

  it('the check sees all six navigations (a check that finds nothing must not pass)', () => {
    expect(liveReturnToFindings(source).navigations).toBe(6);
  });

  it('none of them hands over an unchecked `returnTo`', () => {
    expect(liveReturnToFindings(source).findings).toEqual([]);
  });

  it.each([
    ['the check on the read', LIVE_READ, "const returnTo = searchParams.get('returnTo');"],
    ['the check, leaving it behind in a comment', LIVE_READ, `// ${LIVE_READ}\n  const returnTo = searchParams.get('returnTo');`],
    ['the single read (a second, raw one beside it)', LIVE_READ, `${LIVE_READ}\n  const rawReturnTo = searchParams.get('returnTo');`],
    ['the ref (filled from the raw value)', LIVE_REF, "safeReturnToRef.current = searchParams.get('returnTo');"],
    ['an exit (navigating to the raw value)', "navigate(returnTo ?? '/live', { replace: true });", "navigate(searchParams.get('returnTo') ?? '/live', { replace: true });"],
  ])('CONTROL on the real file: undoing %s makes the check object', (_what, fixed, undone) => {
    expect(source.split(fixed).length - 1, 'the fixed expression must be in the real file exactly once').toBe(1);
    expect(liveReturnToFindings(source.replace(fixed, undone)).findings.length).toBeGreaterThan(0);
  });

  it('KEPT: the session-end exit still prefers `returnTo` and falls back to /live (decisions.md, ClarityLivePage exit points)', () => {
    const code = codeLines(source).join('\n');
    expect(code).toMatch(/searchParams\.get\('returnTo'\)/);
    expect(code).toMatch(/navigate\([^\n]*returnTo[^\n]*'\/live'/);
    expect(code).toMatch(/isJoinViaLink\)\s*\{\s*\n\s*navigate\('\/live'/);
  });
});

describe('P1692: a new reader of a redirect target, or a new address segment filled from a page parameter, fails here', () => {
  /** Files that read the parameter only to pass it on unchanged; the page that finally navigates checks it. */
  const PASS_THROUGH: Record<string, string> = {
    'lib/auth-gate-utils.ts': 'copies the parameter into the sign-in address; the landing page checks it before navigating',
  };
  /** Files that fill an address segment from a page parameter without the one-segment helper, each with the reason. */
  const REVIEWED_SEGMENTS: Record<string, string> = {
    'app/hooks/use-doc-context.ts': 'the target of a Back control; moves to the helper with the other built addresses',
    'app/prototypes/events/prep/use-prepare-modes.ts': 'the join address shown after preparation; moves to the helper with the other built addresses',
  };
  const files = sourceFiles().map((f) => ({ name: relative(SRC, f), code: codeLines(readFileSync(f, 'utf8')).join('\n') }));
  const readers = files.filter((f) => /\.get\(\s*['"](?:redirect|returnTo)['"]\s*\)/.test(f.code)).map((f) => f.name).sort();
  const segmentFiles = files.filter((f) => parameterSegmentSites(f.code).length > 0).map((f) => f.name).sort();

  it('the comment stripper keeps strings whole and line numbers in place', () => {
    const sample = [
      "const a = 'see // not a comment'; navigate(target); // a comment",
      '/* a block',
      '   over two lines */ const b = "x // y";',
      'const c = `https://example.test/${a}`; // trailing',
      '// a whole-line comment',
    ].join('\n');
    expect(codeLines(sample)).toEqual([
      "const a = 'see // not a comment'; navigate(target); ",
      '',
      ' const b = "x // y";',
      'const c = `https://example.test/${a}`; ',
      '',
    ]);
  });

  it('the segment scan recognises the ways a page parameter is read on one statement', () => {
    const site = (read: string) => parameterSegmentSites(`${read}\nnavigate(\`/thing/\${id}/next\`);`).length;
    expect(site("const id = params.get('id') ?? '';")).toBe(1);
    expect(site("const id = searchParams.get('id') || '';")).toBe(1);
    expect(site("const id = new URLSearchParams(location.search).get('id');")).toBe(1);
    expect(site("let id = searchParams.get(\n  'id'\n);")).toBe(1);
    expect(parameterSegmentSites("const id = params.get('id');\nnavigate(`/thing/${pathSegment(id)}/next`);")).toEqual([]);
    expect(site("const id = route.id;")).toBe(0); // not read off the address: outside this scan
  });

  it('the scans see the members already known (a scan that finds nothing must not pass)', () => {
    expect(readers).toEqual(expect.arrayContaining(['auth/AuthCallbackPage.tsx', 'auth/AuthVerifyPage.tsx', 'app/pages/login-page.tsx', 'app/pages/signup-page.tsx', 'app/pages/clarity-live-page.tsx']));
    expect(segmentFiles).toEqual(expect.arrayContaining(Object.keys(REVIEWED_SEGMENTS)));
  });

  it('TRIPWIRE: each reader imports a shared check, or is a reviewed pass-through (the behaviour tests above carry the proof for today\'s readers)', () => {
    const imports = /import\s*\{[^}]*\b(?:isSafeRedirectPath|isSafeReturnPath|safeRedirectOrNull)\b[^}]*\}\s*from/;
    const unchecked = readers.filter((name) => !(name in PASS_THROUGH) && !imports.test(files.find((f) => f.name === name)?.code ?? ''));
    expect(unchecked, `read a redirect target without a shared check: ${unchecked.join(', ')}`).toEqual([]);
  });

  it('no address segment is filled raw from a page parameter, outside the reviewed list', () => {
    const unreviewed = segmentFiles.filter((name) => !(name in REVIEWED_SEGMENTS));
    expect(unreviewed, `fill an address segment from a page parameter: ${unreviewed.join(', ')}`).toEqual([]);
  });

  it('CONTROL on the real file: undoing the sign-up page\'s edit makes the segment scan object', () => {
    const signup = readFileSync(join(SRC, 'app/pages/signup-page.tsx'), 'utf8');
    const fixed = '`/letter/${pathSegment(letterId)}/confirm`';
    expect(signup.split(fixed).length - 1, 'the fixed expression must be in the real file exactly once').toBe(1);
    expect(parameterSegmentSites(signup)).toEqual([]);
    expect(parameterSegmentSites(signup.replace(fixed, '`/letter/${letterId}/confirm`')).length).toBe(1);
  });

  it('the reviewed lists name only files the scans still find (no stale exemption)', () => {
    for (const name of Object.keys(PASS_THROUGH)) expect(readers, name).toContain(name);
    for (const name of Object.keys(REVIEWED_SEGMENTS)) expect(segmentFiles, name).toContain(name);
  });
});
