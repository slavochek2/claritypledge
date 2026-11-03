/**
 * P1603: the share preview of an event reads it through get_event_by_slug (exact slug), so a hidden event's link still
 * gets its card, and tells search engines not to index a hidden one. A public event's card carries no noindex.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function run(path: string) {
  let body = '';
  const res = {
    setHeader: () => undefined,
    status: () => ({ send: (html: string) => { body = html; } }),
  } as unknown as VercelResponse;
  return { res, body: () => body, req: { query: { path } } as unknown as VercelRequest };
}

function stubRpc(row: Record<string, unknown> | null) {
  const calls: Array<{ url: string; method?: string; body?: string }> = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method, body: init?.body as string | undefined });
    return { ok: true, json: async () => (row ? [row] : []) } as unknown as Response;
  }) as unknown as typeof fetch;
  return calls;
}

describe('api/og.ts event card (P1603)', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('asks get_event_by_slug with the exact slug (POST), never a table read', async () => {
    const calls = stubRpc({ title: 'Friends', description: 'd', datetime: '2026-12-01T10:00:00Z', location: 'x', banner_url: null, is_hidden: true });
    const { default: handler } = await import('../../api/og');
    const r = run('/events/friends-2026-12-01-abcdefghijklmnop');
    await handler(r.req, r.res);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/rest\/v1\/rpc\/get_event_by_slug$/);
    expect(calls[0].method).toBe('POST');
    expect(JSON.parse(calls[0].body!)).toEqual({ p_slug: 'friends-2026-12-01-abcdefghijklmnop' });
  });

  it('a hidden event: the card renders from the link and carries noindex', async () => {
    stubRpc({ title: 'Friends', description: 'A private run', datetime: '2026-12-01T10:00:00Z', location: 'x', banner_url: null, is_hidden: true });
    const { default: handler } = await import('../../api/og');
    const r = run('/events/friends-2026-12-01-abcdefghijklmnop');
    await handler(r.req, r.res);
    expect(r.body()).toContain('Friends | ClarityPledge');
    expect(r.body()).toContain('<meta name="robots" content="noindex, nofollow" />');
  });

  it('a public event (control): same card, no noindex', async () => {
    stubRpc({ title: 'Open Night', description: 'Everyone', datetime: '2026-12-01T10:00:00Z', location: 'x', banner_url: null, is_hidden: false });
    const { default: handler } = await import('../../api/og');
    const r = run('/events/open-night-2026-12-01-ab12');
    await handler(r.req, r.res);
    expect(r.body()).toContain('Open Night | ClarityPledge');
    expect(r.body()).not.toContain('noindex');
  });
});
