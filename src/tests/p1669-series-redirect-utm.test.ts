/**
 * P1669 — a series short link forwards the channel (utm_*) to the event page. Measured on prod
 * 2026-11-12 before this change: the first hop kept the query, the second (api/series-redirect)
 * dropped it, so every tagged short link lost its channel. Only the five utm_* keys pass, cleaned.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler, { utmSuffix } from '../../api/series-redirect';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
vi.spyOn(console, 'error').mockImplementation(() => {});

function run(query: Record<string, unknown>) {
  const res = { redirect: vi.fn() };
  return handler({ query } as never, res as never).then(() => res.redirect.mock.calls[0]);
}
const reply = (body: unknown, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });

beforeEach(() => fetchMock.mockReset());

describe('series short link keeps the channel', () => {
  it('forwards utm_* to the resolved event, drops ?d= and anything else', async () => {
    fetchMock.mockImplementation(() => reply('social-hike-x'));
    const out = await run({ series: 'hike', d: '260913', utm_source: 'whatsapp', utm_medium: 'community-group', utm_campaign: 'hike', email: 'someone@example.com' });
    expect(out).toEqual([307, '/events/social-hike-x?utm_source=whatsapp&utm_medium=community-group&utm_campaign=hike']);
  });

  it('keeps the channel on the /events fallbacks too (no match, failure, bad key)', async () => {
    fetchMock.mockImplementation(() => reply(null));
    expect(await run({ series: 'hike', utm_source: 'luma' })).toEqual([307, '/events?utm_source=luma']);
    fetchMock.mockImplementation(() => reply({}, false));
    expect(await run({ series: 'hike', utm_source: 'luma' })).toEqual([307, '/events?utm_source=luma']);
    expect(await run({ series: 'BAD KEY', utm_source: 'luma' })).toEqual([307, '/events?utm_source=luma']);
  });

  it('no utm → the same URLs as before', async () => {
    fetchMock.mockImplementation(() => reply('e'));
    expect(await run({ series: 'hike', d: '260913' })).toEqual([307, '/events/e']);
  });

  it('cleans values and takes the first of a repeated key', () => {
    expect(utmSuffix({ utm_source: ['what sapp<x>', 'other'], utm_term: 'z'.repeat(90) } as never)).toBe(`?utm_source=whatsappx&utm_term=${'z'.repeat(64)}`);
    expect(utmSuffix({ utm_source: '%%%' } as never)).toBe('');
  });
});
