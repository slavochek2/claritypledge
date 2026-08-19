/**
 * @file agent-accounts-context.tsx
 * @module app/contexts
 *
 * P1104 Decision 3 — one app-session fetch of the agent registry, exposed as a
 * synchronous membership test.
 *
 * WHY NOT ON THE QUERY RESPONSE. Joining agent_accounts into the service-layer
 * queries and returning an `isAgentAccount` boolean per row looks like the natural
 * fix. It fails on the shape of point-detail-page.tsx, which does not pass query rows
 * through to render — it copies named fields into four-to-six separately-typed object
 * literals by hand. A boolean on the response would have to be added to every one of
 * those literals individually. That is not a smaller version of the profiles-column
 * threading cost the spec rejected; it is the identical cost, moved.
 *
 * Every render site already holds the id it is showing (holder.userId, story.authorId,
 * author.id, profileOwner.id, profile.id), so a synchronous lookup lets each site ask
 * the question with data already in scope — no type change, no construction-site change.
 *
 * FAIL-CLOSED. `isLoading` is not a convenience. An unresolved or failed fetch leaves
 * the Set empty, and an empty Set read as "no agents" renders every agent account as a
 * person. Consumers MUST hold their render until `isLoading` is false. On fetch failure
 * `isLoading` stays true forever by design — the page keeps its existing loading state
 * rather than rendering rows it cannot correctly mark.
 */
import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { getAgentAccounts } from '@/app/data/agent-accounts-service';
import * as Sentry from '@sentry/react';

interface AgentAccountsState {
  /** True when this profile id is a machine's reading of a person. */
  isAgentAccountId: (id?: string | null) => boolean;
  /** The human answerable for this agent account, or null when it is not one. */
  operatorNameFor: (id?: string | null) => string | null;
  /**
   * True until the registry has resolved. Stays true if the fetch failed.
   *
   * Render sites use this to withhold the human-only trust affordances (pledge ring,
   * reputation count) while membership is unknown, rather than to blank a whole page.
   * See the note on `identityPending` in gravatar-avatar.tsx.
   */
  isLoading: boolean;
}

const AgentAccountsContext = createContext<AgentAccountsState | null>(null);

export function AgentAccountsProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Map<string, string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAgentAccounts()
      .then(next => { if (!cancelled) setAccounts(next); })
      .catch(err => {
        // Deliberately does NOT set an empty Map. See FAIL-CLOSED above: consumers stay
        // gated rather than rendering agent accounts as people.
        Sentry.captureException(err, { tags: { feature: 'p1104-agent-accounts' } });
      });
    return () => { cancelled = true; };
  }, []);

  const value = useMemo<AgentAccountsState>(() => ({
    isAgentAccountId: (id?: string | null) => (id ? (accounts?.has(id) ?? false) : false),
    operatorNameFor: (id?: string | null) => (id ? (accounts?.get(id) ?? null) : null),
    isLoading: accounts === null,
  }), [accounts]);

  return (
    <AgentAccountsContext.Provider value={value}>
      {children}
    </AgentAccountsContext.Provider>
  );
}

/**
 * Outside a provider this behaves exactly as the app did before P1104: nothing is an
 * agent, and nothing is pending.
 *
 * That is deliberate and it is where the fail-closed guarantee is anchored. Returning
 * `isLoading: true` here was tried first and is wrong: the four consumers are shared card
 * components that existing unit tests render in isolation, so a pending default silently
 * suppressed the pledge ring in tests that exist to assert the ring renders
 * (`p1109-reproduce.test.tsx`). A context default that changes unrelated components'
 * behaviour is a worse failure than the one it guards against, because it is invisible.
 *
 * The guarantee therefore rests on the provider being mounted above every route in
 * App.tsx, which is asserted directly by `src/tests/agent-accounts-provider-mounted.test.ts`
 * rather than left to inspection.
 */
const NO_PROVIDER: AgentAccountsState = {
  isAgentAccountId: () => false,
  operatorNameFor: () => null,
  isLoading: false,
};

// eslint-disable-next-line react-refresh/only-export-components
export function useAgentAccountIds(): AgentAccountsState {
  const ctx = useContext(AgentAccountsContext);
  return ctx ?? NO_PROVIDER;
}
