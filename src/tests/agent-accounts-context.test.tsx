import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const mockGetAgentAccounts = vi.fn();

vi.mock('@/app/data/agent-accounts-service', () => ({
  getAgentAccounts: () => mockGetAgentAccounts(),
}));

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

async function renderProvider() {
  const { AgentAccountsProvider, useAgentAccountIds } = await import('@/app/contexts/agent-accounts-context');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AgentAccountsProvider>{children}</AgentAccountsProvider>
  );
  return renderHook(() => useAgentAccountIds(), { wrapper });
}

describe('AgentAccountsProvider / useAgentAccountIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with isLoading true and never reports a known agent as not-an-agent before the fetch resolves', async () => {
    let resolveFetch: (value: Map<string, string>) => void = () => {};
    mockGetAgentAccounts.mockReturnValue(new Promise<Map<string, string>>(resolve => { resolveFetch = resolve; }));

    const { result } = await renderProvider();

    expect(result.current.isLoading).toBe(true);
    // The value is false while unresolved, which is why every consumer is REQUIRED to
    // gate render on isLoading. This assertion pins the contract the pages depend on.
    expect(result.current.isAgentAccountId('agent-1')).toBe(false);

    resolveFetch(new Map([['agent-1', 'Operator One']]));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAgentAccountId('agent-1')).toBe(true);
  });

  it('isLoading stays true forever when the fetch fails — the page keeps its loading state rather than rendering agents as people', async () => {
    mockGetAgentAccounts.mockRejectedValue(new Error('network down'));

    const { result } = await renderProvider();

    await waitFor(() => expect(mockGetAgentAccounts).toHaveBeenCalledTimes(1));
    // Give the rejection a chance to settle and any state update to flush.
    await new Promise(r => setTimeout(r, 20));

    expect(result.current.isLoading, 'a failed registry fetch must not read as "no agents"').toBe(true);
  });

  it('p1176: a network-blip rejection ("Load failed") is not reported to Sentry as an issue', async () => {
    const Sentry = await import('@sentry/react');
    mockGetAgentAccounts.mockRejectedValue(new Error('Load failed'));

    const { result } = await renderProvider();

    await waitFor(() => expect(mockGetAgentAccounts).toHaveBeenCalledTimes(1));
    await new Promise(r => setTimeout(r, 20));

    expect(result.current.isLoading, 'FAIL-CLOSED must hold on a blip too').toBe(true);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'db-error-suppressed', data: expect.objectContaining({ reason: 'network-blip' }) })
    );
  });

  it('p1176: a non-blip rejection is still reported to Sentry with the p1104-agent-accounts tag', async () => {
    const Sentry = await import('@sentry/react');
    const realError = new Error('permission denied for table agent_accounts');
    mockGetAgentAccounts.mockRejectedValue(realError);

    const { result } = await renderProvider();

    await waitFor(() => expect(mockGetAgentAccounts).toHaveBeenCalledTimes(1));
    await new Promise(r => setTimeout(r, 20));

    expect(result.current.isLoading).toBe(true);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      realError,
      expect.objectContaining({ tags: { feature: 'p1104-agent-accounts' } })
    );
  });

  it('isAgentAccountId(undefined) and (null) are false once loaded', async () => {
    mockGetAgentAccounts.mockResolvedValue(new Map([['agent-1', 'Operator One']]));
    const { result } = await renderProvider();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAgentAccountId(undefined)).toBe(false);
    expect(result.current.isAgentAccountId(null)).toBe(false);
  });

  it('isAgentAccountId(knownId) is true and (unknownId) is false once loaded', async () => {
    mockGetAgentAccounts.mockResolvedValue(new Map([['agent-1', 'Operator One'], ['agent-2', 'Operator Two']]));
    const { result } = await renderProvider();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAgentAccountId('agent-1')).toBe(true);
    expect(result.current.isAgentAccountId('agent-2')).toBe(true);
    expect(result.current.isAgentAccountId('some-human-profile-id')).toBe(false);
  });

  it('operatorNameFor returns the operator for an agent and null for anyone else', async () => {
    mockGetAgentAccounts.mockResolvedValue(new Map([['agent-1', 'Operator One']]));
    const { result } = await renderProvider();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.operatorNameFor('agent-1')).toBe('Operator One');
    expect(result.current.operatorNameFor('some-human-profile-id')).toBeNull();
    expect(result.current.operatorNameFor(undefined)).toBeNull();
  });

  it('isLoading clears when the fetch resolves an empty Map — a real negative, not a failure', async () => {
    mockGetAgentAccounts.mockResolvedValue(new Map());
    const { result } = await renderProvider();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAgentAccountId('any-id')).toBe(false);
  });

  it('fetches the registry exactly once per Provider mount, not once per consumer re-render', async () => {
    mockGetAgentAccounts.mockResolvedValue(new Map([['agent-1', 'Operator One']]));
    const { rerender } = await renderProvider();

    await waitFor(() => expect(mockGetAgentAccounts).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    expect(mockGetAgentAccounts).toHaveBeenCalledTimes(1);
  });

  it('outside a Provider it behaves exactly as the app did before P1104 — strictly additive', async () => {
    // Deliberate, and the reasoning is in the context file. A pending default here
    // silently suppressed the pledge ring inside six existing unit-test files that
    // render these cards in isolation, including one whose whole purpose is to assert
    // the ring renders. The disclosure guarantee is anchored instead by
    // agent-accounts-provider-mounted.test.ts, which fails if the provider stops
    // wrapping the routes.
    const { useAgentAccountIds } = await import('@/app/contexts/agent-accounts-context');
    const { result } = renderHook(() => useAgentAccountIds());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isAgentAccountId('agent-1')).toBe(false);
    expect(result.current.operatorNameFor('agent-1')).toBeNull();
  });
});
