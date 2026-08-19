import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}));

describe('agent-accounts-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAgentAccounts', () => {
    it('selects only the columns the client GRANT allows — subject_key is excluded (P1104 Decision 1)', async () => {
      mockSelect.mockResolvedValue({ data: [], error: null });
      const { getAgentAccounts } = await import('@/app/data/agent-accounts-service');

      await getAgentAccounts();

      expect(mockFrom).toHaveBeenCalledWith('agent_accounts');
      // A select('*') returns 42501 against the P1104 grant — verified against the live
      // test DB. Asserting the exact column list is what keeps that from regressing.
      expect(mockSelect).toHaveBeenCalledWith('profile_id, operator_name');
    });

    it('resolves a Map of profile_id → operator_name', async () => {
      mockSelect.mockResolvedValue({
        data: [
          { profile_id: 'agent-1', operator_name: 'Operator One' },
          { profile_id: 'agent-2', operator_name: 'Operator Two' },
        ],
        error: null,
      });
      const { getAgentAccounts } = await import('@/app/data/agent-accounts-service');

      const result = await getAgentAccounts();

      expect(result).toBeInstanceOf(Map);
      expect(result.get('agent-1')).toBe('Operator One');
      expect(result.get('agent-2')).toBe('Operator Two');
      expect(result.size).toBe(2);
    });

    it('resolves an empty Map when the registry genuinely has no rows yet', async () => {
      mockSelect.mockResolvedValue({ data: [], error: null });
      const { getAgentAccounts } = await import('@/app/data/agent-accounts-service');

      const result = await getAgentAccounts();

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('rejects on a Supabase error rather than silently resolving an empty Map', async () => {
      // Fail-closed at the fetch layer. If this resolved an empty Map on error, the
      // provider's isLoading would clear on a FAILED fetch exactly as if it had succeeded
      // with zero rows — making the fetch layer itself the thing that renders an agent
      // account as a person.
      mockSelect.mockResolvedValue({ data: null, error: { message: 'network error', code: '500' } });
      const { getAgentAccounts } = await import('@/app/data/agent-accounts-service');

      await expect(getAgentAccounts()).rejects.toBeTruthy();
    });

    it('tolerates a null data payload without throwing a TypeError', async () => {
      mockSelect.mockResolvedValue({ data: null, error: null });
      const { getAgentAccounts } = await import('@/app/data/agent-accounts-service');

      const result = await getAgentAccounts();
      expect(result.size).toBe(0);
    });
  });
});
