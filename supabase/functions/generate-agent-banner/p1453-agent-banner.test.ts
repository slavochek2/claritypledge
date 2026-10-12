// Deno test: run with
//   deno test supabase/functions/generate-agent-banner/p1453-agent-banner.test.ts
//
// P1453: the operator-only agent banner path. Who may call it, which profiles it serves, and that
// it never replaces a banner unless asked.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createHandler, secretMatches, type AgentBannerDeps } from './handler.ts';
import type { ArtistBannerResult } from '../_shared/artist-banner-run.ts';

const KEY = 'service-role-key-for-tests';
const AGENT = '11111111-1111-1111-1111-111111111111';
const HUMAN = '22222222-2222-2222-2222-222222222222';
const OLD = 'https://x/storage/v1/object/public/banners/profile/1111/old.png';

const RESULT = {
  entry: { artist: 'Katsushika Hokusai', sig: 'Hokusai', movement: 'Ukiyo-e', active: '', work: '', era: '1800-1900' },
  best: { image: { mimeType: 'image/png', data: '' }, luma: 120, ink: 'cream', vision: 'pass', attempt: 1 },
  generations: 1,
} as ArtistBannerResult;

function fakes(over: Partial<AgentBannerDeps> = {}, state = { banner: null as string | null }) {
  const calls = { generate: 0, write: [] as boolean[], removed: [] as string[] };
  const deps: AgentBannerDeps = {
    isServiceKey: (b) => Promise.resolve(secretMatches(b, KEY)),
    isAgent: (id) => Promise.resolve(id === AGENT),
    readBanner: () => Promise.resolve({ bannerUrl: state.banner, artist: null }),
    generate: () => { calls.generate++; return Promise.resolve(RESULT); },
    upload: () => Promise.resolve({ publicUrl: 'https://x/new.png', fileName: 'profile/1111/new.png' }),
    write: (_id, _url, _c, replace) => { calls.write.push(replace); return Promise.resolve(replace || !state.banner ? 1 : 0); },
    credit: (url, r) => ({ url, artist: r.entry.artist, sig: r.entry.sig, movement: r.entry.movement, ink: r.best.ink, fidelity: r.best.vision }),
    removeByUrl: (_id, url) => { calls.removed.push(url); return Promise.resolve(); },
    ...over,
  };
  return { handler: createHandler(deps), calls };
}

function post(body: unknown, bearer: string | null = KEY): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (bearer !== null) headers.Authorization = `Bearer ${bearer}`;
  return new Request('http://x/generate-agent-banner', { method: 'POST', headers, body: JSON.stringify(body) });
}

Deno.test('rejects a missing or wrong bearer — a user JWT is not accepted', async () => {
  const { handler, calls } = fakes();
  assertEquals((await handler(post({ profileId: AGENT }, null))).status, 401);
  assertEquals((await handler(post({ profileId: AGENT }, 'eyJhbGciOiJIUzI1NiJ9.user.jwt'))).status, 401); // gitleaks:allow
  assertEquals(calls.generate, 0);
});

Deno.test('rejects a non-agent (human) profile id with 403 and generates nothing', async () => {
  const { handler, calls } = fakes();
  assertEquals((await handler(post({ profileId: HUMAN }))).status, 403);
  assertEquals(calls.generate, 0);
});

Deno.test('ignores any is-agent claim in the body', async () => {
  const { handler } = fakes();
  assertEquals((await handler(post({ profileId: HUMAN, isAgent: true }))).status, 403);
});

Deno.test('refuses when the agent already has a banner and replace is not set', async () => {
  const { handler, calls } = fakes({}, { banner: OLD });
  const res = await handler(post({ profileId: AGENT }));
  assertEquals(res.status, 409);
  assertEquals(calls.generate, 0);
  assertEquals(calls.removed, []);
});

Deno.test('fills an empty agent banner with a conditional write', async () => {
  const { handler, calls } = fakes();
  const res = await handler(post({ profileId: AGENT }));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).credit.sig, 'Hokusai');
  assertEquals(calls.write, [false]);
});

Deno.test('replace: true writes, then deletes the old object only after the new URL is stored', async () => {
  const order: string[] = [];
  const { handler } = fakes({
    write: () => { order.push('write'); return Promise.resolve(1); },
    removeByUrl: (_id, url) => { order.push(`remove ${url}`); return Promise.resolve(); },
  }, { banner: OLD });
  assertEquals((await handler(post({ profileId: AGENT, replace: true }))).status, 200);
  assertEquals(order, ['write', `remove ${OLD}`]);
});

Deno.test('a banner that appears mid-generation is kept and ours is discarded', async () => {
  const { handler, calls } = fakes({ write: () => Promise.resolve(0) });
  assertEquals((await handler(post({ profileId: AGENT }))).status, 409);
  assertEquals(calls.removed, ['https://x/new.png']);
});

Deno.test('a Gemini spend cap or refused key answers 429, so the operator script stops', async () => {
  const { handler, calls } = fakes({ generate: () => Promise.resolve('key-blocked') });
  const res = await handler(post({ profileId: AGENT }));
  assertEquals(res.status, 429);
  assertEquals((await res.json()).code, 'GEMINI_KEY_BLOCKED');
  assertEquals(calls.write, []);
});

Deno.test('secretMatches compares the whole value', () => {
  assertEquals(secretMatches(KEY, KEY), true);
  assertEquals(secretMatches(KEY.slice(0, -1), KEY), false);
  assertEquals(secretMatches(`${KEY}x`, KEY), false);
  assertEquals(secretMatches('', ''), false);
});
