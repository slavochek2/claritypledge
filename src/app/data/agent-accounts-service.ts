/**
 * @file agent-accounts-service.ts
 * @module app/data
 *
 * P1104 Decision 1 — reads the agent_accounts registry.
 *
 * Row EXISTENCE in agent_accounts, not a column value on profiles, is what answers
 * "is this profile a machine's reading of a person?". This module is the only place
 * that asks the database that question.
 *
 * `select('profile_id, operator_name')` is deliberate and load-bearing: subject_key is
 * NOT in the anon/authenticated column GRANT, so `select('*')` returns 42501. That is
 * the intended loud failure — see the P1104 migration.
 */
import { supabase } from '@/lib/supabase';

/**
 * Every agent account, as profileId → operatorName. Reads the registry to exhaustion.
 *
 * A Map rather than a Set of ids: the profile page needs the operator name, and the
 * column is already in the same GRANT and the same row. Fetching it here removes a
 * second per-profile round trip and the render flash that came with it.
 *
 * Throws on error rather than returning an empty Map. An empty Map is
 * indistinguishable from "no agents exist", and a caller that treats a failed fetch as
 * "no agents" renders every agent account as a person — the exact harm P1104 exists to
 * prevent. The caller (AgentAccountsProvider) keeps its consumers gated while this is
 * unresolved or failed.
 */
export async function getAgentAccounts(): Promise<Map<string, string>> {
  // Paginated to exhaustion, deliberately. Verified against the live API on 2026-08-19:
  // an unbounded read returns `content-range: 0-999/3724` — the gateway caps a page at
  // 1000 rows and says nothing about it in the body. A single unbounded select would
  // therefore have silently returned only the first 1000 agents, and agent 1001 onward
  // would render as a PERSON. That is the exact harm this feature exists to prevent, it
  // is invisible, and it arrives precisely when the pipeline succeeds.
  const PAGE = 1000;
  // A stable sort is load-bearing, not tidiness: without an ORDER BY, Postgres may return
  // rows in a different order per page, so paginating can skip rows entirely — and a
  // skipped row is an agent rendering as a person.
  const accounts = new Map<string, string>();

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('agent_accounts')
      .select('profile_id, operator_name')
      .order('profile_id', { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) throw error;

    const rows = data ?? [];
    for (const row of rows) {
      accounts.set(row.profile_id as string, row.operator_name as string);
    }

    if (rows.length < PAGE) return accounts;

    // Fail closed rather than loop forever if the API ever stops honouring `range`.
    // Throwing keeps consumers in the pending state; returning a partial Map would
    // hand them a confident wrong answer.
    if (from >= PAGE * 1000) {
      throw new Error('agent_accounts pagination exceeded 1,000,000 rows — refusing to return a partial registry');
    }
  }
}
