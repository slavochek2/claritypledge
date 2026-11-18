/**
 * P1691, P1705: the host of a mailed link comes from configuration, through one shared rule.
 *
 * `supabase/functions/_shared/link-base.ts` (`linkBaseFor`) decides the base address of links in
 * mail: APP_URL, or a request's exact dev origin on a non-prod project whose APP_URL is itself
 * localhost. This file keeps every function on that one rule. Outside link-base.ts:
 *   - no module reads the request's Origin header, or tests an origin with a localhost prefix (P1691)
 *   - no module reads APP_URL in any spelling (P1705)
 *   - no module reads an `origin` field from a request body (P1705: the browser's Origin header is
 *     the only origin input; P1675's body field is not kept)
 *   - no module compares a parsed host to localhost (P1705: P1675's localOrigin shape)
 *   - no app-route link (/events/, /letters, /agreements/) is built on a literal prod address
 * and every function that sends mail reaches link-base.ts through its imports.
 *
 * STRUCTURAL ONLY, and a tripwire rather than a proof: it reads source text for the shapes these
 * defects had. The behaviour is proven in the Deno suites: `_shared/link-base.test.ts`,
 * `_shared/p1705-event-link-base.test.ts`, and each mail function's `index.test.ts`.
 *
 * Scope is derived: every function directory, every non-test shared module, and the mail senders
 * found by what they import, with known members asserted per derivation path (gate 7e). Every
 * control mutates a REAL function file rather than a synthetic snippet (gate 7d).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, resolve, dirname, normalize } from 'path';
import { allFunctionSources } from './helpers/edge-function-source';

// LINK_GUARD_FUNCTIONS_DIR points the rules at another checkout's functions (used once, by hand, to
// show they catch P1675's unshipped code on its own branch). Unset in every normal run.
const FUNCTIONS = process.env.LINK_GUARD_FUNCTIONS_DIR ?? join(resolve(__dirname, '../..'), 'supabase/functions');
const SHARED = join(FUNCTIONS, '_shared');
/** The only module allowed to read APP_URL, look at the request origin, or compare a host to localhost. */
const LINK_RULE = 'link-base.ts';
/** Shared modules that may look at the request origin: the CORS helper and the link rule. */
const ORIGIN_READERS = ['cors.ts', LINK_RULE];

const READS_ORIGIN = /headers\s*\.\s*get\(\s*['"`]origin['"`]\s*\)/i;
const PREFIX_MATCH_ON_LOCALHOST = /startsWith\(\s*['"`]https?:\/\/localhost/i;
const READS_APP_URL = /\bAPP_URL\b/;
const BODY_ORIGIN = [
  // const { ..., origin } = await req.json()  (P1675's shape)
  /\{[^}]*\borigin\b[^}]*\}\s*=\s*(?:await\s+)?req\s*\.\s*json\s*\(/,
  // body.origin / payload['origin'] / (await req.json()).origin
  /\b(?:body|payload|json|data|input|params)\s*(?:\.\s*origin\b|\[\s*['"`]origin['"`]\s*\])/,
  /req\s*\.\s*json\s*\(\s*\)\s*\)\s*\.\s*origin\b/,
];
const HOST_IS_LOCALHOST_A = /\.hostname\b/;
const HOST_IS_LOCALHOST_B = /['"`](?:localhost|127\.0\.0\.1)['"`]/;
const LITERAL_PROD_APP_ROUTE = /https?:\/\/(?:www\.)?claritypledge\.com\/(?:events|letters|agreements)\b/;
/** A module that sends mail: it reads the mail provider's key or domain, which every send needs.
 * (A word match on "mailgun" is too loose: outcome strings and column names carry it.) */
const SENDS_MAIL = /Deno\.env\.get\(\s*['"`]MAILGUN_(?:API_KEY|DOMAIN)['"`]/;

/** Source with comments removed, so a rule reads code only. Keeps `https://` (preceded by ':'). */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Reasons a module's source picks a link host on its own; empty when it does not. */
export function ownHostRules(raw: string): string[] {
  const src = stripComments(raw);
  const reasons: string[] = [];
  if (READS_ORIGIN.test(src)) reasons.push('reads the request Origin header itself');
  if (PREFIX_MATCH_ON_LOCALHOST.test(src)) reasons.push('tests an origin with a prefix match');
  if (READS_APP_URL.test(src)) reasons.push('reads APP_URL outside link-base.ts');
  if (BODY_ORIGIN.some((re) => re.test(src))) reasons.push('reads an origin field from the request body');
  if (HOST_IS_LOCALHOST_A.test(src) && HOST_IS_LOCALHOST_B.test(src)) reasons.push('compares a parsed host to localhost');
  if (LITERAL_PROD_APP_ROUTE.test(src)) reasons.push('builds an app-route link on a literal prod address');
  return reasons;
}

function sharedModules(): Array<{ name: string; src: string }> {
  return readdirSync(SHARED)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('_test.ts') && !f.endsWith('.test-util.ts'))
    .sort()
    .map((name) => ({ name, src: readFileSync(join(SHARED, name), 'utf8') }));
}

/** Relative .ts imports of a file, resolved to absolute paths that exist. */
function localImports(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of src.matchAll(/from\s+['"](\.{1,2}\/[^'"]+\.ts)['"]/g)) {
    const p = normalize(join(dirname(file), m[1]));
    if (existsSync(p)) out.push(p);
  }
  return out;
}

/** Every local module a file reaches through its imports, itself included. */
function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    stack.push(...localImports(f));
  }
  return seen;
}

/** Functions that send mail: the entry point reaches a module that sends. Derived, never hand-kept. */
function mailSenders(): Array<{ name: string; viaShared: boolean; reachesRule: boolean }> {
  const rule = join(SHARED, LINK_RULE);
  return readdirSync(FUNCTIONS)
    .filter((n) => n !== '_shared' && existsSync(join(FUNCTIONS, n, 'index.ts')))
    .map((name) => {
      const entry = join(FUNCTIONS, name, 'index.ts');
      const mods = [...reachable(entry)];
      const own = mods.filter((m) => m.startsWith(join(FUNCTIONS, name)));
      const sendsOwn = own.some((m) => SENDS_MAIL.test(stripComments(readFileSync(m, 'utf8'))));
      const sendsShared = mods.some((m) => m.startsWith(SHARED) && SENDS_MAIL.test(stripComments(readFileSync(m, 'utf8'))));
      return { name, sends: sendsOwn || sendsShared, viaShared: !sendsOwn && sendsShared, reachesRule: mods.includes(rule) };
    })
    .filter((f) => f.sends)
    .map(({ name, viaShared, reachesRule }) => ({ name, viaShared, reachesRule }));
}

const functions = allFunctionSources(FUNCTIONS);
const shared = sharedModules();
const read = (rel: string) => readFileSync(join(FUNCTIONS, rel), 'utf8');

describe('P1691/P1705: one rule decides the host of a mailed link', () => {
  it('no function picks a link host on its own', () => {
    for (const { name, src } of functions) expect(ownHostRules(src), name).toEqual([]);
  });

  it('among shared modules, only link-base.ts picks a host (cors.ts may read the Origin header)', () => {
    for (const { name, src } of shared) {
      if (name === LINK_RULE) continue;
      const reasons = ownHostRules(src).filter((r) => !(name === 'cors.ts' && r === 'reads the request Origin header itself'));
      expect(reasons, name).toEqual([]);
    }
    // The matcher is not blind: it sees the one reader that has always existed, and the rule itself.
    expect(ownHostRules(shared.find((m) => m.name === 'cors.ts')!.src)).toContain('reads the request Origin header itself');
    const rule = ownHostRules(shared.find((m) => m.name === LINK_RULE)!.src);
    expect(rule).toContain('reads APP_URL outside link-base.ts');
    expect(rule).toContain('reads the request Origin header itself');
    for (const { name, src } of shared) {
      if (ownHostRules(src).includes('reads the request Origin header itself')) expect(ORIGIN_READERS, name).toContain(name);
    }
  });

  it('every function that sends mail reaches link-base.ts, and the sender list is derived', () => {
    const senders = mailSenders();
    const names = senders.map((s) => s.name);
    // One known member per derivation path: sends from its own code, and sends only through _shared.
    expect(names).toContain('send-letter-emails');
    expect(names).toContain('send-agreement-emails');
    expect(names).toContain('send-event-emails');
    expect(senders.find((s) => s.name === 'dispatch-event-emails')?.viaShared, 'dispatch-event-emails sends via _shared').toBe(true);
    for (const s of senders) expect(s.reachesRule, `${s.name} sends mail but never reaches ${LINK_RULE}`).toBe(true);
  });

  it('the rule names no project: prod is recognised only through the one shared check', () => {
    const rule = readFileSync(join(SHARED, LINK_RULE), 'utf8');
    expect(rule).toContain("from './nonprod-image-guard.ts'");
    expect(rule).toContain('isProdProject(');
    expect(rule).toContain("from './dev-origins.ts'");
    expect(rule).not.toMatch(/[a-z0-9-]+\.supabase\.co/);
  });

  // Controls: each rule fails on a violation seeded into a REAL file, and the clean file passes.
  describe('controls (seeded into real function files)', () => {
    const agreements = read('send-agreement-emails/index.ts');
    const events = read('send-event-emails/index.ts');
    const eventLinks = read('_shared/event-links.ts');
    const helpers = read('_shared/email-helpers.ts');

    it('the clean files pass', () => {
      for (const src of [agreements, events, eventLinks, helpers]) expect(ownHostRules(src)).toEqual([]);
    });

    it('a second APP_URL reader is caught', () => {
      expect(agreements).toContain('linkBaseFor(req)');
      const seeded = agreements.replace('linkBaseFor(req)', "(Deno.env.get('APP_URL') ?? 'https://claritypledge.com')");
      expect(ownHostRules(seeded)).toContain('reads APP_URL outside link-base.ts');
      // A comment naming APP_URL is not a reader.
      expect(ownHostRules(`${agreements}\n// APP_URL is read in link-base.ts\n`)).toEqual([]);
    });

    it("a body origin read is caught (P1675's destructure shape)", () => {
      const parse = /const \{ action, eventId, userId: targetUserId \} = await req\.json\(\)/;
      expect(events).toMatch(parse);
      const seeded = events.replace(parse, 'const { action, eventId, userId: targetUserId, origin } = await req.json()');
      expect(ownHostRules(seeded)).toContain('reads an origin field from the request body');
      expect(ownHostRules(events.replace(parse, 'const body = await req.json(); const o = body.origin'))).toContain('reads an origin field from the request body');
    });

    it("an origin-host localhost comparison is caught (P1675's localOrigin, verbatim from its branch)", () => {
      // Copied from feature/p1675-clarity-hike-intro-required, _shared/event-links.ts, 2026-11-18.
      const p1675 = `
const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

/** The origin of an \`http://localhost:<port>\` address (any port, no path, query, hash or credentials), else null. */
function localOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' || !LOCAL_HOSTS.includes(u.hostname)) return null;
    if (u.username || u.password || u.search || u.hash || u.pathname !== '/') return null;
    return u.origin;
  } catch {
    return null;
  }
}
`;
      expect(ownHostRules(eventLinks + p1675)).toContain('compares a parsed host to localhost');
    });

    it('a literal prod app-route link is caught', () => {
      // eventPageUrl lives in event-links.ts (moved out of email-helpers.ts, which is over its size limit).
      const fn = /function eventPageUrl\(slug: string, base: string\): string \{\n\s*return `\$\{base\}\/events\/\$\{slug\}`;/;
      expect(eventLinks).toMatch(fn);
      const seeded = eventLinks.replace(fn, 'function eventPageUrl(slug: string, base: string): string {\n  return `https://claritypledge.com/events/${slug}`;');
      expect(ownHostRules(seeded)).toContain('builds an app-route link on a literal prod address');
    });

    it('the P1691 shapes are still caught, and reading another header is not', () => {
      expect(ownHostRules(agreements.replace('linkBaseFor(req)', "(req.headers.get('origin') ?? '')"))).toContain('reads the request Origin header itself');
      expect(ownHostRules(`${agreements}\nif (o.startsWith('http://localhost')) use(o);\n`)).toContain('tests an origin with a prefix match');
      expect(ownHostRules(`${agreements}\nconst a = req.headers.get('Authorization');\n`)).toEqual([]);
    });

    it('a mail sender that stops reaching link-base.ts is caught', () => {
      // Same derivation as the real check, applied to the agreement function with its link-base import removed.
      const entryImports = agreements.match(/from\s+['"](\.{1,2}\/[^'"]+\.ts)['"]/g) ?? [];
      expect(entryImports.some((i) => i.includes('link-base.ts'))).toBe(true);
      const without = entryImports.filter((i) => !i.includes('link-base.ts'));
      const reaches = without.some((i) => {
        const rel = i.match(/['"](.+)['"]/)![1];
        return reachable(normalize(join(FUNCTIONS, 'send-agreement-emails', rel))).has(join(SHARED, LINK_RULE));
      });
      expect(reaches, 'send-agreement-emails would still reach link-base.ts through another import').toBe(false);
    });
  });
});
