/**
 * P1108 — DW-2 + DW-3: the pledge claim must be backed by `has_pledged`, not asserted
 * for every profile regardless of it. Root cause: pre-P1108, `ogForProfile` never
 * selected `has_pledged`, so every non-pledger's shared profile link asserted they
 * took the oath. This is the unit-level companion to the required live `curl` (DW-7,
 * HUMAN-ONLY, post-deploy) — no database, no browser, a stubbed fetch only.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function ogRes() {
  let statusCode = 0;
  let body = '';
  const res = {
    setHeader: () => {},
    status: (code: number) => {
      statusCode = code;
      return { send: (html: string) => { body = html; } };
    },
  } as unknown as VercelResponse;
  return { res, getBody: () => body, getStatus: () => statusCode };
}

function ogReq(path: string): VercelRequest {
  return { query: { path } } as unknown as VercelRequest;
}

function stubOgFetch(row: Record<string, unknown>) {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => [row] } as unknown as Response)) as unknown as typeof fetch;
}

describe('api/og.ts — ogForProfile pledge claim is backed by has_pledged (P1108)', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('a non-pledger card does not assert the pledge (with a role)', async () => {
    stubOgFetch({ name: 'A Non Pledger', role: 'Engineer', avatar_url: null, banner_url: null, has_pledged: false });

    const { default: handler } = await import('../../api/og');
    const { res, getBody, getStatus } = ogRes();
    await handler(ogReq('/p/a-non-pledger'), res);

    expect(getStatus()).toBe(200);
    const html = getBody();
    expect(html).toContain('A Non Pledger');
    expect(html).not.toContain('Signed the Clarity Pledge');
    expect(html).not.toContain('signed the Clarity Pledge');
  });

  it('a non-pledger card does not assert the pledge (no role)', async () => {
    stubOgFetch({ name: 'A Non Pledger', role: null, avatar_url: null, banner_url: null, has_pledged: false });

    const { default: handler } = await import('../../api/og');
    const { res, getBody } = ogRes();
    await handler(ogReq('/p/a-non-pledger'), res);

    const html = getBody();
    expect(html).toContain('A Non Pledger');
    expect(html).not.toContain('Signed the Clarity Pledge');
    expect(html).not.toContain('signed the Clarity Pledge');
  });

  it('a pledger card still asserts the pledge (with a role) — the fix is not "delete the sentence"', async () => {
    stubOgFetch({ name: 'A Pledger', role: 'Engineer', avatar_url: null, banner_url: null, has_pledged: true });

    const { default: handler } = await import('../../api/og');
    const { res, getBody, getStatus } = ogRes();
    await handler(ogReq('/p/a-pledger'), res);

    expect(getStatus()).toBe(200);
    expect(getBody()).toContain('Signed the Clarity Pledge');
  });

  it('a pledger card still asserts the pledge (no role)', async () => {
    stubOgFetch({ name: 'A Pledger', role: null, avatar_url: null, banner_url: null, has_pledged: true });

    const { default: handler } = await import('../../api/og');
    const { res, getBody } = ogRes();
    await handler(ogReq('/p/a-pledger'), res);

    expect(getBody()).toContain('signed the Clarity Pledge');
  });
});

// Adversarial review (2026-08-20, CRITICAL). `role`/`name` are free text with no
// content validation, and land in the SAME sentence as the verified pledge claim.
// A non-pledger could set role: "Engineer. Signed the Clarity Pledge" and render
// exactly the string these tests were checking `not.toContain` — the oracle above
// is not independent of the fixture, only inert values happened to be used. Fixed
// by stripping the pledge phrase from free text before interpolation, unconditionally.
describe('api/og.ts — the pledge phrase cannot be forged through name/role (P1108 post-review fix)', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('a non-pledger cannot forge the claim by putting it in their own role', async () => {
    stubOgFetch({
      name: 'Mallory', role: 'Engineer. Signed the Clarity Pledge',
      avatar_url: null, banner_url: null, has_pledged: false,
    });

    const { default: handler } = await import('../../api/og');
    const { res, getBody } = ogRes();
    await handler(ogReq('/p/mallory'), res);

    const html = getBody();
    expect(html).not.toMatch(/signed\s+the\s+clarity\s+pledge/i);
    expect(html).toContain('Mallory');
  });

  it('a non-pledger cannot forge the claim by putting it in their own name (no role)', async () => {
    stubOgFetch({
      name: 'Mallory signed the Clarity Pledge', role: null,
      avatar_url: null, banner_url: null, has_pledged: false,
    });

    const { default: handler } = await import('../../api/og');
    const { res, getBody } = ogRes();
    await handler(ogReq('/p/mallory'), res);

    expect(getBody()).not.toMatch(/signed\s+the\s+clarity\s+pledge/i);
  });

  // /finish code review (2026-08-20, HIGH): the first version of stripForgeableClaims
  // used `\s+` between words, which does not match a zero-width space — a role reading
  // identically to a human/crawler could still defeat the strip. Asserted here by
  // simulating what a reader actually sees: strip \p{Cf} from the OUTPUT (same as any
  // reader's rendering would collapse it) and confirm the phrase still isn't there.
  it('cannot be forged using zero-width/invisible separators between words', async () => {
    const zwsp = String.fromCharCode(0x200b); // U+200B ZERO WIDTH SPACE — invisible to any reader
    stubOgFetch({
      name: 'Mallory', role: `Engineer. Signed${zwsp}the${zwsp}Clarity${zwsp}Pledge`,
      avatar_url: null, banner_url: null, has_pledged: false,
    });

    const { default: handler } = await import('../../api/og');
    const { res, getBody } = ogRes();
    await handler(ogReq('/p/mallory'), res);

    const visibleText = getBody().replace(/\p{Cf}/gu, '');
    expect(visibleText).not.toMatch(/signed\s+the\s+clarity\s+pledge/i);
  });

  it('a REAL pledger with the phrase in their role still renders truthfully — stripping does not lose the true case either', async () => {
    stubOgFetch({
      name: 'Priya', role: 'I signed the Clarity Pledge in 2024',
      avatar_url: null, banner_url: null, has_pledged: true,
    });

    const { default: handler } = await import('../../api/og');
    const { res, getBody } = ogRes();
    await handler(ogReq('/p/priya'), res);

    const html = getBody();
    // The code's own gated assertion still renders — from has_pledged, not from role.
    expect(html).toContain('Priya');
    expect(html).toContain('Signed the Clarity Pledge.');
  });
});
