/** /drum lands on the nearest upcoming drum-circle event by its series key, else /events. */
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

describe('/drum', () => {
  it('goes to the nearest public upcoming drum circle', async () => {
    fetchMock.mockImplementation(() => reply([{ slug: 'full-moon-drum-circle-x' }]));
    expect(await run('drum')).toEqual([307, '/events/full-moon-drum-circle-x']);
    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]));
    expect(url).toContain('series_slug=eq.drum-circle');
    expect(url).toContain('is_hidden=eq.false');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('with none upcoming, goes to /events without a title fallback', async () => {
    fetchMock.mockImplementation(() => reply([]));
    expect(await run('drum')).toEqual([307, '/events']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
