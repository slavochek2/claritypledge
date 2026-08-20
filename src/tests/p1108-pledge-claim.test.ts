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
