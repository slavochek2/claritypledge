import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The mock mirrors the real PostgREST builder chain:
 *   supabase.from(t).select(cols).order(col, opts).range(from, to) -> Promise
 * Each `range()` call resolves the next queued page.
 */
const rangeCalls: Array<[number, number]> = [];
const orderCalls: Array<[string, unknown]> = [];
const selectCalls: string[] = [];
let pages: Array<{ data: unknown[] | null; error: unknown }> = [];
let pageIndex = 0;

const builder = {
  select: (cols: string) => { selectCalls.push(cols); return builder; },
  order: (col: string, opts: unknown) => { orderCalls.push([col, opts]); return builder; },
  range: (from: number, to: number) => {
    rangeCalls.push([from, to]);
    const page = pages[pageIndex] ?? { data: [], error: null };
    pageIndex += 1;
    return Promise.resolve(page);
  },
};

const mockFrom = vi.fn(() => builder);

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

function queuePages(...p: Array<{ data: unknown[] | null; error: unknown }>) {
  pages = p;
  pageIndex = 0;
}

const row = (n: number) => ({ profile_id: `agent-${n}`, operator_name: `Operator ${n}` });

describe('agent-accounts-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rangeCalls.length = 0;
    orderCalls.length = 0;
    selectCalls.length = 0;
    queuePages({ data: [], error: null });
  });

  describe('getAgentAccounts', () => {
    it('selects only the columns the client GRANT allows — subject_key is excluded', async () => {
      const { getAgentAccounts } = await import('@/app/data/agent-accounts-service');
      await getAgentAccounts();

      expect(mockFrom).toHaveBeenCalledWith('agent_accounts');
      // select('*') returns 42501 against the P1104 grant — verified against the live DB.
      expect(selectCalls[0]).toBe('profile_id, operator_name');
    });

    it('resolves a Map of profile_id → operator_name', async () => {
      queuePages({ data: [row(1), row(2)], error: null });
      const { getAgentAccounts } = await import('@/app/data/agent-accounts-service');

      const result = await getAgentAccounts();

      expect(result).toBeInstanceOf(Map);
      expect(result.get('agent-1')).toBe('Operator 1');
      expect(result.get('agent-2')).toBe('Operator 2');
      expect(result.size).toBe(2);
    });

    it('resolves an empty Map when the registry genuinely has no rows yet', async () => {
      const { getAgentAccounts } = await import('@/app/data/agent-accounts-service');
      const result = await getAgentAccounts();
      expect(result.size).toBe(0);
    });

    it('rejects on a Supabase error rather than silently resolving an empty Map', async () => {
      // Fail-closed at the fetch layer. If this resolved an empty Map on error, the
      // provider's isLoading would clear on a FAILED fetch exactly as if it had succeeded
      // with zero rows — making the fetch layer itself the thing that renders an agent
      // account as a person.
      queuePages({ data: null, error: { message: 'network error', code: '500' } });
      const { getAgentAccounts } = await import('@/app/data/agent-accounts-service');

      await expect(getAgentAccounts()).rejects.toBeTruthy();
    });

    it('tolerates a null data payload without throwing a TypeError', async () => {
      queuePages({ data: null, error: null });
      const { getAgentAccounts } = await import('@/app/data/agent-accounts-service');
      const result = await getAgentAccounts();
      expect(result.size).toBe(0);
    });

    // ── The 1000-row truncation. Verified against the live API on 2026-08-19: an
    // unbounded read returns `content-range: 0-999/3724`. Without pagination every agent
    // past the first 1000 renders as a PERSON, silently, and only once the pipeline has
    // succeeded enough to create that many. These are the tests that bind the fix.

    it('reads past the 1000-row page cap — an agent beyond the first page is still found', async () => {
      const firstPage = Array.from({ length: 1000 }, (_, i) => row(i));
      queuePages(
        { data: firstPage, error: null },
        { data: [row(1000), row(1001)], error: null },
      );
      const { getAgentAccounts } = await import('@/app/data/agent-accounts-service');

      const result = await getAgentAccounts();

      expect(result.size, 'every registered agent must be present, not just the first page').toBe(1002);
      expect(
        result.get('agent-1001'),
        'an agent past the page cap must still be known, or it renders as a person',
      ).toBe('Operator 1001');
      expect(rangeCalls).toEqual([[0, 999], [1000, 1999]]);
    });

    it('stops after a short page rather than fetching forever', async () => {
      queuePages({ data: [row(1)], error: null });
      const { getAgentAccounts } = await import('@/app/data/agent-accounts-service');

      await getAgentAccounts();

      expect(rangeCalls).toHaveLength(1);
    });

    it('orders by a stable key, without which pagination can skip rows entirely', async () => {
      const firstPage = Array.from({ length: 1000 }, (_, i) => row(i));
      queuePages({ data: firstPage, error: null }, { data: [], error: null });
      const { getAgentAccounts } = await import('@/app/data/agent-accounts-service');

      await getAgentAccounts();

      // Postgres gives no order guarantee without ORDER BY, so paged reads may repeat or
      // OMIT rows between pages. An omitted row is an agent rendering as a person.
      expect(orderCalls[0]?.[0]).toBe('profile_id');
      expect(orderCalls[0]?.[1]).toEqual({ ascending: true });
    });

    it('throws rather than returning a partial registry if range stops being honoured', async () => {
      // A full page every time would loop forever. Returning what we have would hand
      // consumers a confident wrong answer; throwing keeps them in the pending state.
      const fullPage = Array.from({ length: 1000 }, (_, i) => row(i));
      pages = new Array(2000).fill({ data: fullPage, error: null });
      pageIndex = 0;
      const { getAgentAccounts } = await import('@/app/data/agent-accounts-service');

      await expect(getAgentAccounts()).rejects.toThrow(/partial registry/);
    });
  });
});
