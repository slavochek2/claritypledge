// Deno test: run with
//   deno test --allow-env --config supabase/functions/deno.json supabase/functions/_shared/p1565-nonprod-guard-runtime.test.ts
//
// P1565: runtime proof that a non-prod project never calls Gemini (fetch count 0), and that prod,
// the opt-in, and an unset SUPABASE_URL behave as documented (unset fails closed).
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { geminiGenerateImage, runArtistBanner } from './artist-banner-run.ts';
import { PLACEHOLDER_IMAGE } from './nonprod-image-guard.ts';
import { portraitSettleUsd, reservePortraitUsd } from './mirror-agent.ts';

const TEST_URL = 'https://ayibkeoyukulbsjpxgaw.supabase.co';
const PROD_URL = 'https://besjtuodziykmjidubzw.supabase.co';

const IMAGE_OK = () => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AA==' } }] } }],
}));

async function withEnv(env: { url?: string; optIn?: string }, fn: (fetches: () => number) => Promise<void>) {
  const prevUrl = Deno.env.get('SUPABASE_URL');
  const prevOpt = Deno.env.get('ALLOW_NONPROD_IMAGE_GEN');
  const realFetch = globalThis.fetch;
  const realWarn = console.warn;
  let n = 0;
  globalThis.fetch = (() => { n++; return Promise.resolve(IMAGE_OK()); }) as typeof fetch;
  console.warn = () => {};
  if (env.url === undefined) Deno.env.delete('SUPABASE_URL'); else Deno.env.set('SUPABASE_URL', env.url);
  if (env.optIn === undefined) Deno.env.delete('ALLOW_NONPROD_IMAGE_GEN'); else Deno.env.set('ALLOW_NONPROD_IMAGE_GEN', env.optIn);
  try { await fn(() => n); } finally {
    globalThis.fetch = realFetch;
    console.warn = realWarn;
    if (prevUrl === undefined) Deno.env.delete('SUPABASE_URL'); else Deno.env.set('SUPABASE_URL', prevUrl);
    if (prevOpt === undefined) Deno.env.delete('ALLOW_NONPROD_IMAGE_GEN'); else Deno.env.set('ALLOW_NONPROD_IMAGE_GEN', prevOpt);
  }
}

async function assertBlocked(fetches: () => number) {
  const img = await geminiGenerateImage('k', 'p', { deadline: Date.now() + 100_000 });
  assertEquals(img, PLACEHOLDER_IMAGE);
  const calls = { generate: 0, billable: 0, vision: 0 };
  const result = await runArtistBanner({
    apiKey: 'k',
    logTag: 't',
    onGenerate: () => { calls.generate++; return true; },
    onBillableCall: () => { calls.billable++; },
    onVisionCall: () => { calls.vision++; },
  });
  assertEquals(result?.best.image, PLACEHOLDER_IMAGE);
  assertEquals(result?.generations, 0);
  assertEquals(calls, { generate: 0, billable: 0, vision: 0 });
  assertEquals(fetches(), 0);
  // A blocked portrait run starts nothing, so the reservation is released rather than charged.
  assertEquals(portraitSettleUsd(reservePortraitUsd(), (result?.generations ?? 0) > 0, [], calls.vision), null);
}

Deno.test('test project, no opt-in: no fetch, placeholder, no billing hooks, reservation released', async () => {
  await withEnv({ url: TEST_URL }, assertBlocked);
});

Deno.test('prod project: geminiGenerateImage calls Gemini', async () => {
  await withEnv({ url: PROD_URL }, async (fetches) => {
    const img = await geminiGenerateImage('k', 'p', { deadline: Date.now() + 100_000 });
    assertEquals(img?.data, 'AA==');
    assert(fetches() >= 1);
  });
});

Deno.test('test project with ALLOW_NONPROD_IMAGE_GEN=1: Gemini is called', async () => {
  await withEnv({ url: TEST_URL, optIn: '1' }, async (fetches) => {
    await geminiGenerateImage('k', 'p', { deadline: Date.now() + 100_000 });
    assert(fetches() >= 1);
  });
});

Deno.test('SUPABASE_URL unset: fails closed (blocked)', async () => {
  await withEnv({}, assertBlocked);
});
