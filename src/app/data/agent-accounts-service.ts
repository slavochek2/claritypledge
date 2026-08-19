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
 * Every agent account, as profileId → operatorName.
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
  const { data, error } = await supabase
    .from('agent_accounts')
    .select('profile_id, operator_name');

  if (error) throw error;

  return new Map(
    (data ?? []).map(row => [row.profile_id as string, row.operator_name as string]),
  );
}
