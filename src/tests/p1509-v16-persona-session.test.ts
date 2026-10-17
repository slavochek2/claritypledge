/**
 * P1509 v16: the dev-server persona sign-in endpoint refuses every request that is not a same-origin JSON POST
 * from this machine (persona-session-plugin.ts). Vite runs plugin middlewares before its own CORS and host
 * checks, so these checks are the only protection the endpoint has. The handler is exercised over real loopback
 * sockets, mounted the way Vite's bundled connect mounts it (prefix match, `req.url` = the remainder).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/* The sign-in call the handler makes; each test sets what it returns or throws. */
const signIn = vi.hoisted(() => ({ impl: (() => Promise.resolve({ data: { session: null }, error: { status: 400 } })) as (a: unknown) => Promise<unknown> }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { signInWithPassword: (a: unknown) => signIn.impl(a) } }) }));
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { personaSessionHandler, rejectReason, type PersonaSessionEnv } from '@/app/prototypes/clarity-chat-v16/persona-session-plugin';
import { assertOutside, isInside, PERSONA_SECRETS_FILE, readPersonaSecrets, writePersonaSecrets } from '@/app/prototypes/clarity-chat-v16/persona-secrets';
import { PERSONA_SESSION_ENDPOINT, personaEmail, TEST_PROJECT_REF } from '@/app/prototypes/clarity-chat-v16/personas';

/* The server listens dual-stack, so IPv4 loopback arrives as the mapped form. */
const ok = {
  method: 'POST',
  remoteAddress: '::ffff:127.0.0.1',
  localPort: 5500,
  headers: { host: 'localhost:5500', origin: 'http://localhost:5500', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
};
const withHeaders = (h: Record<string, string | undefined>) => ({ ...ok, headers: { ...ok.headers, ...h } });

describe('rejectReason', () => {
  it('accepts a same-origin JSON POST from loopback, in each loopback form', () => {
    expect(rejectReason(ok)).toBeNull();
    expect(rejectReason({ ...ok, remoteAddress: '127.0.0.1' })).toBeNull();
    expect(rejectReason(withHeaders({ host: '127.0.0.1:5500', origin: 'http://127.0.0.1:5500' }))).toBeNull();
    expect(rejectReason({ ...withHeaders({ host: '[::1]:5500', origin: 'http://[::1]:5500' }), remoteAddress: '::1' })).toBeNull();
    expect(rejectReason(withHeaders({ 'sec-fetch-site': undefined }))).toBeNull(); // optional; Origin still must match
  });

  it('refuses a LAN peer even with otherwise valid headers', () => {
    expect(rejectReason({ ...ok, remoteAddress: '::ffff:192.168.1.20' })).toBe('loopback only');
    expect(rejectReason({ ...ok, remoteAddress: undefined })).toBe('loopback only');
  });

  it('refuses anything a proxy or tunnel marks, even with a rewritten loopback Host', () => {
    for (const h of ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'cf-connecting-ip', 'tailscale-user-login', 'via']) {
      expect(rejectReason(withHeaders({ [h]: '203.0.113.9' })), h).toBe('proxied request');
    }
  });

  it('refuses DNS rebinding: loopback socket, foreign Host', () => {
    expect(rejectReason(withHeaders({ host: 'evil.example:5500', origin: 'http://evil.example:5500' }))).toBe('host not allowed');
    expect(rejectReason(withHeaders({ host: 'localhost:6666', origin: 'http://localhost:6666' }))).toBe('host not allowed');
    expect(rejectReason(withHeaders({ host: 'localhost.evil.example:5500' }))).toBe('host not allowed');
  });

  it('refuses another origin, a missing origin and a cross-site fetch', () => {
    expect(rejectReason(withHeaders({ origin: 'https://evil.example' }))).toBe('origin not allowed');
    expect(rejectReason(withHeaders({ origin: undefined }))).toBe('origin not allowed');
    expect(rejectReason(withHeaders({ origin: 'http://127.0.0.1:5500' }))).toBe('origin not allowed'); // must equal Host
    expect(rejectReason(withHeaders({ 'sec-fetch-site': 'cross-site' }))).toBe('cross-site request');
    expect(rejectReason(withHeaders({ 'sec-fetch-site': 'same-site' }))).toBe('cross-site request');
  });

  it('refuses CORS simple requests (no preflight) and other methods', () => {
    expect(rejectReason(withHeaders({ 'content-type': 'text/plain' }))).toBe('JSON only');
    expect(rejectReason(withHeaders({ 'content-type': undefined }))).toBe('JSON only');
    expect(rejectReason({ ...ok, method: 'GET' })).toBe('POST only');
  });
});

describe('the mounted handler over real sockets', () => {
  let server: http.Server;
  let port = 0;
  let env: PersonaSessionEnv = {};
  const handler = personaSessionHandler(() => env);
  const TEST_URL = `https://${TEST_PROJECT_REF}.supabase.co`;

  beforeAll(async () => {
    server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
      // connect's mount: case-insensitive prefix; the handler sees the remainder.
      const url = req.url ?? '';
      if (url.toLowerCase().startsWith(PERSONA_SESSION_ENDPOINT.toLowerCase())) {
        req.url = url.slice(PERSONA_SESSION_ENDPOINT.length) || '/';
        return handler(req, res);
      }
      res.statusCode = 200;
      res.end('spa');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const call = (opts: { path?: string; method?: string; headers?: Record<string, string>; body?: string }) =>
    new Promise<{ status: number; body: Record<string, string>; cache: string | undefined }>((resolve, reject) => {
      const headers = { host: `localhost:${port}`, origin: `http://localhost:${port}`, 'content-type': 'application/json', ...opts.headers };
      const req = http.request({ host: '127.0.0.1', port, path: opts.path ?? PERSONA_SESSION_ENDPOINT, method: opts.method ?? 'POST', headers }, (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : {}, cache: res.headers['cache-control'] }));
      });
      req.on('error', reject);
      req.end(opts.body ?? JSON.stringify({ id: 'bob' }));
    });

  it('reaches the secrets stage for a valid request, and says so when nothing is seeded', async () => {
    env = { supabaseUrl: TEST_URL, anonKey: 'anon', readSecrets: () => null };
    const r = await call({});
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/not seeded/);
    expect(r.cache).toBe('no-store');
  });

  it('refuses forged Host, forged Origin, proxy headers and text/plain on the live socket', async () => {
    env = { supabaseUrl: TEST_URL, anonKey: 'anon', readSecrets: () => ({ bob: 'x' }) };
    expect((await call({ headers: { host: 'evil.example', origin: 'http://evil.example' } })).body.error).toBe('host not allowed');
    expect((await call({ headers: { origin: 'https://evil.example' } })).body.error).toBe('origin not allowed');
    expect((await call({ headers: { 'x-forwarded-for': '203.0.113.9' } })).body.error).toBe('proxied request');
    expect((await call({ headers: { 'content-type': 'text/plain' } })).status).toBe(403);
  });

  it('serves only the exact path, refuses non-test projects, bad ids and oversized bodies', async () => {
    env = { supabaseUrl: TEST_URL, anonKey: 'anon', readSecrets: () => ({ bob: 'x' }) };
    expect((await call({ path: `${PERSONA_SESSION_ENDPOINT}/extra` })).status).toBe(404);
    expect((await call({ body: JSON.stringify({ id: '__proto__' }) })).status).toBe(400);
    expect((await call({ body: JSON.stringify({ id: ['bob'] }) })).status).toBe(400);
    expect((await call({ body: JSON.stringify({ id: 'bob', pad: 'x'.repeat(400) }) })).status).toBe(413);
    env = { supabaseUrl: 'https://besjtuodziykmjidubzw.supabase.co', anonKey: 'anon', readSecrets: () => ({ bob: 'x' }) };
    expect((await call({})).body.error).toBe('test project only');
  });
});

describe('the sign-in outcomes', () => {
  let server: http.Server;
  let port = 0;
  let secrets: Record<string, string> | null = { bob: 'pw' };
  const handler = personaSessionHandler(() => ({ supabaseUrl: `https://${TEST_PROJECT_REF}.supabase.co`, anonKey: 'anon', readSecrets: () => secrets }));
  beforeAll(async () => {
    server = http.createServer((req, res) => { req.url = '/'; handler(req, res); });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  const post = (id = 'bob') => new Promise<{ status: number; body: Record<string, string> }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', headers: { host: `localhost:${port}`, origin: `http://localhost:${port}`, 'content-type': 'application/json' } }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.end(JSON.stringify({ id }));
  });

  it('returns only the two tokens on success, for the persona address', async () => {
    let asked: unknown;
    signIn.impl = (a) => { asked = a; return Promise.resolve({ data: { session: { access_token: 'at', refresh_token: 'rt', user: { id: 'u' } } }, error: null }); };
    secrets = { bob: 'pw' };
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ access_token: 'at', refresh_token: 'rt' });
    expect(asked).toEqual({ email: personaEmail('bob'), password: 'pw' });
  });

  it('maps a rate limit to 429 (never "re-run the seed"), a wrong password to 401, a network throw to 500', async () => {
    signIn.impl = () => Promise.resolve({ data: { session: null }, error: { status: 429 } });
    expect((await post()).status).toBe(429);
    signIn.impl = () => Promise.resolve({ data: { session: null }, error: { status: 400 } });
    expect((await post()).status).toBe(401);
    signIn.impl = () => Promise.reject(new Error('fetch failed'));
    const r = await post();
    expect(r.status).toBe(500);
    expect(r.body.error).toMatch(/network/);
  });

  it('a persona missing from the file is 409 and never reaches sign-in', async () => {
    let called = false;
    signIn.impl = () => { called = true; return Promise.resolve({ data: { session: null }, error: null }); };
    secrets = { dana: 'pw' };
    expect((await post('bob')).status).toBe(409);
    expect(called).toBe(false);
  });
});

const temps: string[] = [];
const tmp = (prefix: string) => {
  const d = mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(d);
  return d;
};
afterAll(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('persona secrets file', () => {
  it('lives outside the repository, so no dev server can serve it', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    expect(() => assertOutside(repoRoot)).not.toThrow();
    expect(isInside(repoRoot, PERSONA_SECRETS_FILE)).toBe(false);
    expect(() => assertOutside(repoRoot, path.join(repoRoot, '.local', 'x.json'))).toThrow(/inside/);
  });

  it('treats a `..`-prefixed child and a symlinked parent as inside the root', () => {
    const served = tmp('p1509-served-');
    expect(isInside(served, path.join(served, '..secrets', 'p.json'))).toBe(true);
    expect(isInside(served, path.join(served, '..', 'elsewhere', 'p.json'))).toBe(false);
    const home = tmp('p1509-home-');
    mkdirSync(path.join(served, 'state'));
    symlinkSync(path.join(served, 'state'), path.join(home, 'state'));
    const file = path.join(home, 'state', 'p.json');
    expect(isInside(served, file)).toBe(true);
    expect(() => writePersonaSecrets({ bob: 'pw' }, file, { root: served })).toThrow(/inside/);
    expect(readdirSync(path.join(served, 'state'))).toEqual([]); // nothing written into the served tree
  });

  it('is written 0600 in a 0700 directory by atomic rename, leaves no temp file, and re-runs replace it', () => {
    const dir = tmp('p1509-secrets-');
    const file = path.join(dir, 'state', 'p.json');
    writePersonaSecrets({ bob: 'pw-1' }, file);
    writePersonaSecrets({ bob: 'pw-2' }, file);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    expect(readPersonaSecrets(file)).toEqual({ bob: 'pw-2' });
    expect(readdirSync(path.dirname(file))).toEqual(['p.json']);
    expect(readPersonaSecrets(path.join(dir, 'absent.json'))).toBeNull();
  });

  it('refuses a dangling symlinked parent instead of failing open', () => {
    const served = tmp('p1509-served2-');
    const home = tmp('p1509-home2-');
    symlinkSync(path.join(served, 'not-yet', 'state'), path.join(home, 'state')); // target does not exist yet
    expect(() => isInside(served, path.join(home, 'state', 'p.json'))).toThrow(/cannot be resolved/);
  });

  it('reads a malformed file as not seeded, never as a password', () => {
    const dir = tmp('p1509-bad-');
    const f = path.join(dir, 'p.json');
    for (const body of ['{"passwords":"abc"}', '{"passwords":["x"]}', '{"passwords":{"bob":123,"dana":""}}', 'not json']) {
      writeFileSync(f, body);
      const r = readPersonaSecrets(f);
      expect(r === null || Object.keys(r).length === 0, body).toBe(true);
    }
  });

  it('never writes to or reads from a symlink at the file path', () => {
    const dir = tmp('p1509-link-');
    const target = path.join(dir, 'elsewhere.json');
    writeFileSync(target, JSON.stringify({ passwords: { bob: 'planted' } }));
    const link = path.join(dir, 'link.json');
    symlinkSync(target, link);
    expect(() => writePersonaSecrets({ bob: 'pw-3' }, link)).toThrow(/symlink/);
    expect(readPersonaSecrets(link)).toBeNull(); // would otherwise read the planted target
    expect(JSON.parse(readFileSync(target, 'utf8')).passwords.bob).toBe('planted');
  });
});
