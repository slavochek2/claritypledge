/**
 * Series short links (P1414 /next, P1649 key-only resolution).
 *
 * The redirect passes ONLY the alias key to public.resolve_series_alias and reads its real wire format:
 * a JSON string for a match, JSON null for none (exercised through PostgREST with the public key in
 * e2e/integration/20261106164500_p1649_series_alias.spec.ts). Matching rules, precedence and the grace cutoff live in the database and are tested
 * there (scripts/test-p1649-series-alias.sql); here we test the contract around them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../../api/series-redirect';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

function run(series: unknown) {
  const res = { redirect: vi.fn() };
  return handler({ query: { series } } as never, res as never).then(() => res.redirect.mock.calls[0]);
}
const reply = (body: unknown, ok = true, status = 200) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(body) });

beforeEach(() => {
  fetchMock.mockReset();
  errorSpy.mockClear();
});

const ALIASES = ['hike', 'night', 'next', 'ai-run', 'aisafety', 'spiritual-revolution', 'sales', 'drum'];

describe('every alias resolves through the key-only function', () => {
  it.each(ALIASES)('%s → the slug the function returns', async (alias) => {
    fetchMock.mockImplementation(() => reply(`${alias}-event-x`));
    expect(await run(alias)).toEqual([307, `/events/${alias}-event-x`]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/rest\/v1\/rpc\/resolve_series_alias$/);
    expect(init.method).toBe('POST');
    // The body carries the key and nothing else: no pattern, series value or cutoff.
    expect(JSON.parse(init.body)).toEqual({ p_key: alias });
  });

  it.each(ALIASES)('%s with nothing upcoming (null) → /events, no error reported', async (alias) => {
    fetchMock.mockImplementation(() => reply(null));
    expect(await run(alias)).toEqual([307, '/events']);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

it('an empty-string slug is treated as no match, not as a failure', async () => {
  fetchMock.mockImplementation(() => reply(''));
  expect(await run('night')).toEqual([307, '/events']);
  expect(errorSpy).not.toHaveBeenCalled();
});

describe('a failure is distinguishable from "no match"', () => {
  it('an error response is reported, then /events', async () => {
    fetchMock.mockImplementation(() => reply({ code: 'PGRST202', message: 'not found' }, false, 404));
    expect(await run('sales')).toEqual([307, '/events']);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain('resolve_series_alias failed');
  });

  it('an unexpected shape (the old row array) is reported, not followed', async () => {
    fetchMock.mockImplementation(() => reply([{ slug: 'x' }]));
    expect(await run('drum')).toEqual([307, '/events']);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('a network failure is reported', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('ECONNRESET')));
    expect(await run('hike')).toEqual([307, '/events']);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('input that cannot be an alias never reaches the function', () => {
  it.each([undefined, '', '%', 'Hike', 'a b', ['hike', 'night'], 'x'.repeat(41)])('%j → /events', async (series) => {
    expect(await run(series)).toEqual([307, '/events']);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
