/**
 * P1108 — DW-5 + SA-1 + SA-2: a failed or unreadable agent/row lookup must never
 * render the ordinary-person (or ordinary-agent) card. `supabaseGet` throws on a
 * non-OK response or a rejecting fetch (Decision 2); `agentOperator` returns a
 * 3-way union so "no agent" and "lookup failed" are distinguishable (Decision 3).
 * `handler()` catches both and responds with a subject-silent card, bounded cache.
 *
 * Per epistemic gate 7b: the P1104 fixture's `stubFetch` is hardcoded to
 * `ok: true`, structurally incapable of emitting the failure shapes this file
 * tests. `stubOgFetch` here is widened from the start to express them.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function ogRes() {
  let statusCode = 0;
  let body = '';
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (name: string, value: string) => { headers[name] = value; },
    status: (code: number) => {
      statusCode = code;
      return { send: (html: string) => { body = html; } };
    },
  } as unknown as VercelResponse;
  return { res, getBody: () => body, getStatus: () => statusCode, getHeaders: () => headers };
}

function ogReq(path: string): VercelRequest {
  return { query: { path } } as unknown as VercelRequest;
}

type StubMode =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; status: number }
  | { reject: Error };

function stubOgFetch(mode: StubMode) {
  global.fetch = vi.fn(async () => {
    if ('reject' in mode) throw mode.reject;
    if (!mode.ok) return { ok: false, status: mode.status } as unknown as Response;
    return { ok: true, json: async () => [mode.row] } as unknown as Response;
  }) as unknown as typeof fetch;
}

const FAIL_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=0';

const ROUTES: Array<{ path: string; label: string }> = [
  { path: '/p/some-profile', label: 'profile' },
  { path: '/story/some-story', label: 'story' },
  { path: '/point/some-point', label: 'point' },
  { path: '/events/some-event', label: 'event' },
];

describe('api/og.ts — fail-loud on a bad HTTP response (P1108 Decision 2)', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  for (const route of ROUTES) {
    it(`${route.label} route: a 403 response never falls through to the sitewide fallback or a named card`, async () => {
      stubOgFetch({ ok: false, status: 403 });

      const { default: handler } = await import('../../api/og');
      const { res, getBody, getStatus, getHeaders } = ogRes();
      await handler(ogReq(route.path), res);

      expect(getStatus()).toBe(200);
      const html = getBody();
      expect(html).not.toContain('Signed the Clarity Pledge');
      expect(html).toContain('Preview temporarily unavailable');
      expect(getHeaders()['Cache-Control']).toBe(FAIL_CACHE_CONTROL);
    });
  }

  it('a rejecting fetch (network timeout) produces the same subject-silent card — not an unhandled rejection', async () => {
    stubOgFetch({ reject: new Error('ETIMEDOUT') });

    const { default: handler } = await import('../../api/og');
    const { res, getBody, getStatus, getHeaders } = ogRes();
    await expect(handler(ogReq('/p/some-profile'), res)).resolves.not.toThrow();

    expect(getStatus()).toBe(200);
    expect(getBody()).toContain('Preview temporarily unavailable');
    expect(getHeaders()['Cache-Control']).toBe(FAIL_CACHE_CONTROL);
  });

  it('the subject-silent card carries the actually-requested URL, not the sitewide BASE_URL', async () => {
    stubOgFetch({ ok: false, status: 500 });

    const { default: handler } = await import('../../api/og');
    const { res, getBody } = ogRes();
    await handler(ogReq('/p/some-profile'), res);

    expect(getBody()).toContain('https://claritypledge.com/p/some-profile');
  });
});

describe('api/og.ts — "no agent" vs "lookup failed" are distinguishable (P1108 Decision 3, SA-1 + SA-2)', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('(c) a 200 response whose row has NO agent_accounts key renders the normal human card — a safe absence', async () => {
    stubOgFetch({
      ok: true,
      row: { name: 'A Human', role: 'Engineer', avatar_url: null, banner_url: null, has_pledged: true },
    });

    const { default: handler } = await import('../../api/og');
    const { res, getBody, getStatus } = ogRes();
    await handler(ogReq('/p/some-profile'), res);

    expect(getStatus()).toBe(200);
    const html = getBody();
    expect(html).toContain('Signed the Clarity Pledge');
    expect(html.toLowerCase()).not.toContain('machine-generated reading');
    expect(html).not.toContain('Preview temporarily unavailable');
  });

  it('(d) a 200 response with a malformed agent_accounts value renders the subject-silent fallback — not the human card, not the agent card', async () => {
    stubOgFetch({
      ok: true,
      // A shape PostgREST cannot actually produce for this embed — deliberately
      // picked to exercise the 'malformed' branch, not the real "no agent" absence.
      row: { name: 'A Human', role: 'Engineer', avatar_url: null, banner_url: null, has_pledged: true, agent_accounts: 42 },
    });

    const { default: handler } = await import('../../api/og');
    const { res, getBody, getStatus, getHeaders } = ogRes();
    await handler(ogReq('/p/some-profile'), res);

    expect(getStatus()).toBe(200);
    const html = getBody();
    expect(html).not.toContain('Signed the Clarity Pledge');
    expect(html.toLowerCase()).not.toContain('machine-generated reading');
    expect(html).not.toContain('A Human');
    expect(html).toContain('Preview temporarily unavailable');
    expect(getHeaders()['Cache-Control']).toBe(FAIL_CACHE_CONTROL);
  });
});
