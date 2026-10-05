/**
 * P1414 — /next lands on the next Clarity Night placeholder (series key set, no topic yet),
 * falling back to /night's nearest Clarity Night, then /events.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../../api/series-redirect';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function run(series: string) {
  const res = { redirect: vi.fn() };
  return handler({ query: { series } } as never, res as never).then(() => res.redirect.mock.calls[0]);
}
const reply = (rows: unknown[]) => Promise.resolve({ json: () => Promise.resolve(rows) });

beforeEach(() => fetchMock.mockReset());

describe('P1414 /next', () => {
  it('goes to the placeholder: clarity-night series with no topic', async () => {
    fetchMock.mockImplementation(() => reply([{ slug: 'clarity-night-3-you-choose-the-topic' }]));
    expect(await run('next')).toEqual([307, '/events/clarity-night-3-you-choose-the-topic']);
    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]));
    expect(url).toContain('series_slug=eq.clarity-night');
    expect(url).toContain('statement_tag=is.null');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('with no placeholder, falls back to the nearest Clarity Night', async () => {
    fetchMock.mockImplementationOnce(() => reply([])).mockImplementationOnce(() => reply([{ slug: 'clarity-night-2' }]));
    expect(await run('next')).toEqual([307, '/events/clarity-night-2']);
    expect(decodeURIComponent(String(fetchMock.mock.calls[1][0]))).toContain('title=ilike.Clarity Night%');
  });

  it('with no Clarity Night at all, goes to /events', async () => {
    fetchMock.mockImplementation(() => reply([]));
    expect(await run('next')).toEqual([307, '/events']);
  });

  it('/night is unchanged: one title query', async () => {
    fetchMock.mockImplementation(() => reply([{ slug: 'clarity-night-2' }]));
    expect(await run('night')).toEqual([307, '/events/clarity-night-2']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent(String(fetchMock.mock.calls[0][0]))).toContain('title=ilike.Clarity Night%');
  });
});
