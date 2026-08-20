/**
 * P1104 — the off-platform disclosure surface.
 *
 * api/og.ts is the one in-scope Surface no browser test in this repo can reach locally:
 * it is a serverless function, not part of the Vite bundle, and `npm run dev` does not
 * serve it. These tests call the exported handler directly with a stubbed fetch, which
 * is the closest automated proxy to the Done-When `curl` step (that step needs a
 * deployed target and stays manual).
 *
 * A shared link renders as text only — no avatar, no shape, no colour — so the copy
 * asserted here IS the entire disclosure on this surface.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function makeRes() {
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

function makeReq(path: string): VercelRequest {
  return { query: { path } } as unknown as VercelRequest;
}

/** Captures the query string og.ts actually issues, so the embed can be asserted. */
function stubFetch(row: Record<string, unknown>) {
  const calls: string[] = [];
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    calls.push(String(url));
    return { ok: true, json: async () => [row] } as unknown as Response;
  }) as unknown as typeof fetch;
  return calls;
}

const AGENT_NAME = 'Agent · A Public Figure';
const OPERATOR = 'A Test Operator';

describe('api/og.ts — agent account disclosure (P1104)', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('ogForStory embeds agent_accounts through the same FK-embed mechanism it already uses for profiles', async () => {
    const calls = stubFetch({
      title: 'A Test Story',
      content: 'Some story content, according to this source reading.',
      banner_url: null,
      profiles: { name: AGENT_NAME, agent_accounts: { operator_name: OPERATOR } },
    });

    const { default: handler } = await import('../../api/og');
    const { res, getBody, getStatus } = makeRes();
    await handler(makeReq('/story/story-agent-fixture'), res);

    expect(getStatus()).toBe(200);
    expect(calls[0], 'the operator must be fetched, not inferred').toContain('agent_accounts(operator_name)');

    const html = getBody();
    expect(html).toContain(AGENT_NAME);
    expect(html).toContain(OPERATOR);
    expect(html.toLowerCase()).toContain('machine-generated reading');
  });

  it('ogForPoint discloses the reading and names the operator', async () => {
    stubFetch({
      statement: 'A test point statement',
      banner_url: null,
      profiles: { name: AGENT_NAME, agent_accounts: { operator_name: OPERATOR } },
    });

    const { default: handler } = await import('../../api/og');
    const { res, getBody, getStatus } = makeRes();
    await handler(makeReq('/point/point-agent-fixture'), res);

    expect(getStatus()).toBe(200);
    const html = getBody();
    expect(html).toContain(AGENT_NAME);
    expect(html).toContain(OPERATOR);
    expect(html.toLowerCase()).toContain('machine-generated reading');
  });

  it('ogForProfile never claims an agent account signed the pledge', async () => {
    stubFetch({
      name: AGENT_NAME,
      role: null,
      avatar_url: null,
      banner_url: null,
      agent_accounts: { operator_name: OPERATOR },
    });

    const { default: handler } = await import('../../api/og');
    const { res, getBody, getStatus } = makeRes();
    await handler(makeReq('/p/agent-a-public-figure'), res);

    expect(getStatus()).toBe(200);
    const html = getBody();
    expect(html).toContain(AGENT_NAME);
    expect(html).toContain(OPERATOR);
    // The pre-P1104 copy asserted the pledge for EVERY profile. An agent account holds
    // none (spec Non-Goal), and this is the one place that reaches a reader who never
    // opens the site.
    expect(html).not.toContain('Signed the Clarity Pledge');
    expect(html).not.toContain('signed the Clarity Pledge');
  });

  it('ogForProfile still gives an ordinary human the pledge copy — the branch is additive, not a rewrite', async () => {
    // P1108: has_pledged is now a required, bindClaim-bound column (NOT NULL DEFAULT
    // true in the schema, so a real fetch always returns it once selected) — stubbed
    // explicitly rather than left absent, which is a shape live Supabase cannot produce.
    stubFetch({ name: 'A Human Name', role: 'Engineer', avatar_url: null, banner_url: null, has_pledged: true });

    const { default: handler } = await import('../../api/og');
    const { res, getBody, getStatus } = makeRes();
    await handler(makeReq('/p/a-human'), res);

    expect(getStatus()).toBe(200);
    expect(getBody()).toContain('Signed the Clarity Pledge');
  });

  it('ogForStory still gives an ordinary human the excerpt description', async () => {
    stubFetch({
      title: 'A Human Story',
      content: 'A distinctive excerpt sentence that should survive.',
      banner_url: null,
      profiles: { name: 'A Human Name' },
    });

    const { default: handler } = await import('../../api/og');
    const { res, getBody } = makeRes();
    await handler(makeReq('/story/story-human-fixture'), res);

    const html = getBody();
    expect(html).toContain('A distinctive excerpt sentence');
    expect(html.toLowerCase()).not.toContain('machine-generated reading');
  });

  it('treats a PostgREST array-shaped embed the same as an object-shaped one', async () => {
    // PostgREST returns a one-to-one embed as an object and a one-to-many as an array.
    // Which shape it picks for this FK is not something this code should depend on — if
    // the array form were mishandled, an agent would silently render as a person.
    stubFetch({
      name: AGENT_NAME,
      role: null,
      avatar_url: null,
      banner_url: null,
      agent_accounts: [{ operator_name: OPERATOR }],
    });

    const { default: handler } = await import('../../api/og');
    const { res, getBody } = makeRes();
    await handler(makeReq('/p/agent-a-public-figure'), res);

    const html = getBody();
    expect(html).toContain(OPERATOR);
    expect(html).not.toContain('signed the Clarity Pledge');
  });

  it('an agent share card does not lead with an image derived from the real person', async () => {
    // On a share card the picture is the dominant element, and platforms routinely
    // truncate or drop og:description — so a portrait would carry the whole impression
    // while the only disclosure got cut.
    stubFetch({
      name: AGENT_NAME, role: null,
      avatar_url: 'https://example.com/the-real-person.jpg',
      banner_url: 'https://example.com/a-banner.jpg',
      agent_accounts: { operator_name: OPERATOR },
    });

    const { default: handler } = await import('../../api/og');
    const { res, getBody } = makeRes();
    await handler(makeReq('/p/agent-a-public-figure'), res);

    const html = getBody();
    expect(html).not.toContain('the-real-person.jpg');
    expect(html).not.toContain('a-banner.jpg');
  });

  it('a human share card still uses their own banner or avatar', async () => {
    stubFetch({
      name: 'A Human Name', role: 'Engineer',
      avatar_url: 'https://example.com/human-avatar.jpg', banner_url: null,
    });

    const { default: handler } = await import('../../api/og');
    const { res, getBody } = makeRes();
    await handler(makeReq('/p/a-human'), res);

    expect(getBody()).toContain('human-avatar.jpg');
  });

  it('a repeated ?path= query param does not crash the handler', async () => {
    // Vercel yields an array when a param repeats; arrays have no .startsWith, so the
    // endpoint 500d. /api/og is directly addressable, not only via the bot-UA rewrite.
    stubFetch({ name: 'A Human Name', role: null, avatar_url: null, banner_url: null });

    const { default: handler } = await import('../../api/og');
    const { res, getStatus } = makeRes();
    const req = { query: { path: ['/p/a-human', '/p/other'] } } as unknown as import('@vercel/node').VercelRequest;

    await expect(handler(req, res)).resolves.not.toThrow();
    expect(getStatus()).toBe(200);
  });

  it('an empty array embed (a human) does not trip the agent branch', async () => {
    // P1108: has_pledged stubbed explicitly — see the other 'ordinary human' fixture above.
    stubFetch({
      name: 'A Human Name',
      role: 'Engineer',
      avatar_url: null,
      banner_url: null,
      has_pledged: true,
      agent_accounts: [],
    });

    const { default: handler } = await import('../../api/og');
    const { res, getBody } = makeRes();
    await handler(makeReq('/p/a-human'), res);

    expect(getBody()).toContain('Signed the Clarity Pledge');
  });
});
