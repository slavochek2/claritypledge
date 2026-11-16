/**
 * @file p1692-address-credential-redaction.test.ts
 * @description P1692: a value in a page address that grants access (the `token` of a one-to-one letter link and
 * of an agreement invitation) is a credential, so it reaches neither Mixpanel nor Sentry nor the CSP report sink,
 * the same rule as room codes (P1304), sign-in tokens (P1325) and canvas link tokens (P1515).
 *
 * Three parts:
 *   1. the letter and agreement addresses, plain and inside a login redirect, come out redacted from every sink;
 *   2. COVERAGE, derived from the source rather than typed (epistemic gate 7e): every credential-named parameter
 *      the app reads from an address, and every credential-named route segment, is covered by a redaction pattern
 *      or carries a written reason why it is not a credential. A new one fails here instead of going unnoticed;
 *   3. a page load whose address carries the `token` parameter is not recorded (the recorders attach the raw
 *      address outside the redaction hooks; decisions.md 2026-09-14). The decision parses the query; it never
 *      runs the redaction pattern, which is global and so keeps state between `.test()` calls. No other
 *      parameter's recording behaviour changes.
 * Addresses that must pass through untouched sit beside the credentials (epistemic gate 7c).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ErrorEvent } from '@sentry/react';
import { AUTH_TOKEN_IN_URL, sentryBeforeBreadcrumb, sentryBeforeSend } from '@/lib/sentry-filters';
import { redactAuthTokens, redactRoomCodes } from '@/lib/url-token-redaction';
import { loadCarriesAccessToken, shouldStartReplay } from '@/lib/sentry-replay-guard';

const SRC = join(__dirname, '..');
const html = readFileSync(join(SRC, '../index.html'), 'utf8');
const VALUE = 'fixture-value-7f3a91c2'; // a synthetic stand-in for the access value; matches no real one
const LETTER = '/letter/0f8e9a1b-2c3d-4e5f-8a9b-0c1d2e3f4a5b';
const ACCEPT = '/agreements/1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d/accept';
const ORIGIN = 'https://claritypledge.com';

function loadBlock(pathname: string, search = '', hash = '') {
  const p1304 = html.match(/\/\* P1304-BEGIN[\s\S]*?\/\* P1304-END \*\//);
  const p1325 = html.match(/\/\* P1325-BEGIN[\s\S]*?\/\* P1325-END \*\//);
  if (!p1304 || !p1325) throw new Error('redaction blocks missing from index.html');
  const run = new Function('window', `${p1304[0]}; ${p1325[0]}; return { redact: p1325Redact, noRecord: p1325NoRecord, pattern: p1325SignInParam, carries: p1692CarriesToken };`);
  return run({ location: { pathname, search, hash } }) as { redact: (v: unknown) => unknown; noRecord: boolean; pattern: RegExp; carries: (pathname: string, search: string) => boolean };
}

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

const CARRYING = [
  `${ORIGIN}${LETTER}?token=${VALUE}`,
  `${ORIGIN}${ACCEPT}?token=${VALUE}`,
  `${ORIGIN}${LETTER}?tab=reading&token=${VALUE}&terms=v1`,
  `${ORIGIN}${ACCEPT}?source=signup&amp;token=${VALUE}`,
  // the same address carried, encoded, inside a sign-in redirect, and nested one level deeper
  `${ORIGIN}/login?redirect=${encodeURIComponent(`${ACCEPT}?token=${VALUE}`)}`,
  `${ORIGIN}/signup?source=letter-response&redirect=${encodeURIComponent(`${LETTER}?token=${VALUE}`)}`,
  `${ORIGIN}/login?next=${encodeURIComponent(`${ORIGIN}/login?redirect=${encodeURIComponent(`${ACCEPT}?token=${VALUE}`)}`)}`,
];

const UNTOUCHED = [
  `${ORIGIN}${LETTER}`,
  `${ORIGIN}${LETTER}?tab=reading&terms=v1`,
  `${ORIGIN}${ACCEPT}?source=signup`,
  `${ORIGIN}/events/x?tokens=3&mytoken=a&token_count=2&tab=token`, // names and values that merely contain the word
  `${ORIGIN}/p/token/canvas/token`,
  `${ORIGIN}/login?redirect=${encodeURIComponent(`${LETTER}?tab=reading`)}`,
];

describe('P1692: the access value of a letter or agreement address reaches no telemetry sink', () => {
  it.each(CARRYING)('Mixpanel event properties: %s', (url) => {
    const { redact } = loadBlock('/');
    const out = JSON.stringify(redact({ event: '$mp_web_page_view', properties: { $current_url: url, $referrer: url, current_url_search: url } }));
    expect(out).not.toContain(VALUE);
    expect(out).toContain('[redacted]');
  });

  it.each(CARRYING)('Sentry events and breadcrumbs: %s', (url) => {
    const event = {
      type: undefined,
      message: `Failed at ${url}`,
      request: { url },
      breadcrumbs: [{ category: 'navigation', data: { from: url, to: url } }],
      exception: { values: [{ type: 'Error', value: 'boom' }] },
    } as ErrorEvent;
    expect(JSON.stringify(sentryBeforeSend(event))).not.toContain(VALUE);
    expect(JSON.stringify(sentryBeforeBreadcrumb({ category: 'fetch', data: { url } }))).not.toContain(VALUE);
  });

  it.each(CARRYING)('the CSP report sink: %s', (url) => {
    expect(redactAuthTokens(redactRoomCodes(url))).not.toContain(VALUE);
  });

  it('the letter and agreement addresses used above are routes the app declares', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');
    expect(app).toMatch(/path="\/letter\/:id"/);
    expect(app).toMatch(/path="\/agreements\/:id\/accept"/);
  });
});

describe('P1692: the earlier redactions and ordinary addresses are unchanged', () => {
  it('CONTROL: a single-use sign-in ticket and a sign-in token hash are still redacted, whole', () => {
    const { redact } = loadBlock('/');
    const ticket = `${ORIGIN}/auth/event-link?ticket=${VALUE}`;
    const hash = `${ORIGIN}/auth/verify?token_hash=${VALUE}&type=email`;
    expect(redact(ticket)).toBe(`${ORIGIN}/auth/event-link?ticket=[redacted]`);
    expect(redact(hash)).toBe(`${ORIGIN}/auth/verify?token_hash=[redacted]&type=email`);
    expect(redactAuthTokens(ticket)).toBe(`${ORIGIN}/auth/event-link?ticket=[redacted]`);
    expect(redactAuthTokens(hash)).toBe(`${ORIGIN}/auth/verify?token_hash=[redacted]&type=email`);
  });

  it('CONTROL: room codes and canvas link tokens are still redacted', () => {
    const { redact } = loadBlock('/');
    const out = JSON.stringify(redact({ a: `${ORIGIN}/live/QX7K2M`, b: `${ORIGIN}/p/ana/canvas/sales#k=${VALUE}` }));
    expect(out).not.toContain('QX7K2M');
    expect(out).not.toContain(VALUE);
  });

  it.each(UNTOUCHED)('CONTROL: %s passes through untouched', (url) => {
    const { redact } = loadBlock('/');
    expect(redact({ properties: { $current_url: url } })).toEqual({ properties: { $current_url: url } });
    expect(redactAuthTokens(redactRoomCodes(url))).toBe(url);
  });

  it('the pattern in index.html and the one the app imports are the same pattern', () => {
    const { pattern } = loadBlock('/');
    expect(pattern.source).toBe(AUTH_TOKEN_IN_URL.source);
    expect(pattern.flags).toBe(AUTH_TOKEN_IN_URL.flags);
  });
});

/**
 * A name that looks like it carries a credential. Deliberately broad: a false alarm costs one line in the reviewed
 * list below, a miss costs a credential in telemetry.
 */
const CREDENTIAL_NAME = /token|nonce|ticket|secret|passw|otp|signature|hash|^k$|(?:^|_)(?:key|code|sig)(?:$|_)/i;

/** Names that match CREDENTIAL_NAME and are NOT credentials, each with the reason. */
const REVIEWED_PARAMETERS: Record<string, string> = {
  error_code: 'an error label returned by the sign-in provider; it grants nothing',
};

/** Route segments that match CREDENTIAL_NAME and are NOT credentials, each with the reason. */
const REVIEWED_SEGMENTS: Record<string, string> = {
  '/s/:code': 'the key of a fixed short-link table that ships in the app bundle; it grants nothing',
};

describe('P1692: every credential-named value the app reads from an address is covered by redaction', () => {
  const files = sourceFiles();

  // Derivation path 1: parameter names read from a query string or fragment anywhere in src/.
  const readNames = new Set<string>();
  for (const file of files) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\.(?:get|has)\(\s*['"]([A-Za-z0-9_%-]+)['"]\s*\)/g)) if (m[1]) readNames.add(m[1]);
  }
  const credentialNames = [...readNames].filter((n) => CREDENTIAL_NAME.test(n)).sort();

  // Derivation path 2: route segments declared by any file that declares routes.
  const routePaths = new Set<string>();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('<Route')) continue;
    for (const m of text.matchAll(/path="([^"]*:[^"]*)"/g)) if (m[1]) routePaths.add(m[1]);
  }
  const credentialRoutes = [...routePaths].filter((p) => p.split('/').some((s) => s.startsWith(':') && CREDENTIAL_NAME.test(s.slice(1)))).sort();

  it('the derivations see the members already known (a scan that finds nothing must not pass)', () => {
    expect(credentialNames).toEqual(expect.arrayContaining(['token_hash', 'ticket', 'k']));
    expect(credentialRoutes).toEqual(expect.arrayContaining(['/live/:code', '/connect/:token']));
  });

  it('every such parameter is redacted, or is reviewed as not a credential', () => {
    const uncovered = credentialNames.filter((name) => {
      if (name in REVIEWED_PARAMETERS) return false;
      const plain = redactAuthTokens(`${ORIGIN}/x?a=1&${name}=${VALUE}`);
      const nested = redactAuthTokens(`${ORIGIN}/login?redirect=${encodeURIComponent(`/x?${name}=${VALUE}`)}`);
      return plain.includes(VALUE) || nested.includes(VALUE);
    });
    expect(uncovered, `read from an address and not redacted: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('every such route segment is redacted, or is reviewed as not a credential', () => {
    const uncovered = credentialRoutes.filter((path) => {
      if (path in REVIEWED_SEGMENTS) return false;
      const filled = path.split('/').map((s) => (s.startsWith(':') && CREDENTIAL_NAME.test(s.slice(1)) ? 'Zx9Qv7Lm' : s.replace(/^:/, ''))).join('/');
      return redactRoomCodes(`${ORIGIN}${filled}`).includes('Zx9Qv7Lm');
    });
    expect(uncovered, `route segments not redacted: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('the reviewed lists name only things the scan still finds (no stale exemption)', () => {
    for (const name of Object.keys(REVIEWED_PARAMETERS)) expect(credentialNames, name).toContain(name);
    for (const path of Object.keys(REVIEWED_SEGMENTS)) expect(credentialRoutes, path).toContain(path);
  });

  it('the scan covers the source tree (sanity: it reads the pages that take these addresses)', () => {
    const names = files.map((f) => relative(SRC, f));
    expect(names).toContain('app/pages/letter-reading-page.tsx');
    expect(names).toContain('app/pages/accept-agreement-page.tsx');
  });
});

const enc = encodeURIComponent;

/** Loads that carry the `token` parameter: in their own query, or in the query of `redirect` on /login and /signup. */
const NOT_RECORDED: Array<[string, string]> = [
  [LETTER, `?token=${VALUE}`],
  [ACCEPT, `?source=signup&token=${VALUE}`],
  [LETTER, `?%74oken=${VALUE}`], // a percent-encoded name is the same parameter once the query is parsed
  ['/manifesto', `?token=${VALUE}`],
  ['/login', `?redirect=${enc(`${ACCEPT}?token=${VALUE}`)}`],
  ['/login', `?action=rsvp&redirect=${enc(`${LETTER}?tab=x&token=${VALUE}`)}`],
  ['/signup', `?source=letter-response&redirect=${enc(`${LETTER}?token=${VALUE}`)}`],
  // The sign-in landing loads carry the same `redirect`; an emailed sign-in link wraps it once more in `redirect_to`.
  ['/auth/callback', `?source=signup&redirect=${enc(`${ACCEPT}?token=${VALUE}`)}`],
  ['/auth/verify', `?token_hash=h&type=email&redirect=${enc(`${LETTER}?token=${VALUE}`)}`],
  ['/auth/verify', `?token_hash=h&type=email&redirect_to=${enc(`${ORIGIN}/auth/callback?source=signup&redirect=${enc(`${ACCEPT}?token=${VALUE}`)}`)}`],
];

/**
 * Loads on which the two copies of the rule must both say "does not carry the value". Mixpanel recording is off on
 * some of these for other, earlier reasons; that is not this rule's doing and is not compared here.
 */
const DOES_NOT_CARRY: Array<[string, string]> = [
  ['/auth/callback', '?code=abc&source=signup'],
  ['/auth/callback', `?source=signup&redirect=${enc('/events/x')}`],
  ['/auth/verify', `?token_hash=h&type=email&redirect_to=${enc(`${ORIGIN}/auth/callback?source=signup&redirect=${enc('/events/x')}`)}`],
  ['/admin/users', ''],
  ['/live/ABC123', ''],
  ['/chats/c/1', ''],
];

/** Loads whose recording must stay exactly as it was: none of them is on a route that already stops recording. */
const RECORDED: Array<[string, string]> = [
  [LETTER, ''],
  [LETTER, '?tab=reading'],
  [ACCEPT, '?source=signup'],
  ['/login', `?redirect=${enc('/events/x')}`],
  ['/signup', `?redirect=${enc(`${LETTER}?tab=x`)}`],
  ['/events/abc', '?tokens=3&mytoken=a&token_count=2'], // names that merely contain the word
  ['/topics', `?q=${enc('how does ?token= work')}`], // a search text that contains the word is not the parameter
  ['/p/ana', `?k=${VALUE}`], // an earlier decision (P1515): only a canvas load that carries `k` is held back
  ['/events/x', `?redirect=${enc(`${ACCEPT}?token=${VALUE}`)}`], // `redirect` is a sign-in page parameter only
  ['/auth/event-link', `?ticket=${VALUE}`],
  ['/', ''],
];

describe('P1692: a page load whose address carries the `token` parameter is not recorded', () => {
  it.each(NOT_RECORDED)('Mixpanel recording is off on %s%s', (pathname, search) => {
    expect(loadBlock(pathname, search).noRecord).toBe(true);
  });

  it.each(NOT_RECORDED)('Sentry Replay does not start on %s%s', (pathname, search) => {
    expect(shouldStartReplay(pathname, search)).toBe(false);
  });

  it.each(RECORDED)('CONTROL: recording is unchanged on %s%s', (pathname, search) => {
    expect(loadBlock(pathname, search).noRecord).toBe(false);
    expect(shouldStartReplay(pathname, search)).toBe(true);
  });

  it('the decision keeps no state: asked twice in a row, and in either order, it gives the same answer', () => {
    const direct: [string, string] = [LETTER, `?token=${VALUE}`];
    const nested: [string, string] = ['/login', `?redirect=${enc(`${ACCEPT}?token=${VALUE}`)}`];
    for (const [pathname, search] of [nested, direct, direct, nested, nested, direct]) {
      expect(loadCarriesAccessToken(pathname, search)).toBe(true);
      expect(shouldStartReplay(pathname, search)).toBe(false);
      expect(loadBlock(pathname, search).noRecord).toBe(true);
    }
    for (let i = 0; i < 3; i++) expect(loadCarriesAccessToken(LETTER, '?tab=reading')).toBe(false);
  });

  it('the copy of the rule in index.html and the module give the same answer on every load in the tables', () => {
    const inline = loadBlock('/').carries;
    for (const [pathname, search] of NOT_RECORDED) {
      expect(inline(pathname, search), `${pathname}${search}`).toBe(true);
      expect(loadCarriesAccessToken(pathname, search), `${pathname}${search}`).toBe(true);
    }
    for (const [pathname, search] of [...RECORDED, ...DOES_NOT_CARRY]) {
      expect(inline(pathname, search), `${pathname}${search}`).toBe(false);
      expect(loadCarriesAccessToken(pathname, search), `${pathname}${search}`).toBe(false);
    }
  });

  it('CONTROL: a sign-in landing load that does not carry the value starts Sentry Replay as before', () => {
    for (const [pathname, search] of DOES_NOT_CARRY) expect(shouldStartReplay(pathname, search), `${pathname}${search}`).toBe(true);
  });

  it('neither copy decides with the redaction pattern (a global pattern keeps state between `.test()` calls)', () => {
    const guard = readFileSync(join(SRC, 'lib/sentry-replay-guard.ts'), 'utf8');
    expect(guard).not.toMatch(/AUTH_TOKEN_IN_URL|url-token-redaction/);
    const block = html.match(/\/\* P1325-BEGIN[\s\S]*?\/\* P1325-END \*\//)?.[0] ?? '';
    expect(block).not.toMatch(/p1325SignInParam\.test\(|p1304RoomCode\.test\(/);
  });

  it('CONTROL: a tolerant read, so a load with no query, or a query the parser rejects, is simply recorded as before', () => {
    expect(loadCarriesAccessToken('/letter/x', '')).toBe(false);
    expect(loadCarriesAccessToken('/login', '?redirect=%E0%A4%A')).toBe(false);
    expect(loadBlock('/login', '?redirect=%E0%A4%A').noRecord).toBe(false);
  });
});
