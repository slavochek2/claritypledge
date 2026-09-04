/**
 * @file p1212-agent-slug-reservation.spec.ts
 * @description P1212 §2: the "agent-" URL namespace is reserved, and "machine-" stays reserved.
 *
 * WHAT THE RESERVATION IS FOR. A reader who lands on /p/agent-sam-harris must be unable to be
 * looking at a page Sam Harris made. Every other marker — the chip, the drained card, the
 * footer — renders only after the page loads; the URL is the whole claim before that, and it
 * is what gets pasted into a chat.
 *
 * THE HALF THAT MUST NOT BE DROPPED IN A RENAME: "machine-" stays closed to clients forever.
 * A retired namespace is a MORE attractive impersonation target than a live one, because old
 * links and screenshots still point at it.
 *
 * Confusables are the attack, not a nicety: `аgent-x` with a Cyrillic а renders identically to
 * `agent-x`. The predicate folds NFKC, strips invisibles, then compares the FIRST TOKEN, so the
 * separator set is closed rather than enumerated.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';

async function isReservedAgent(slug: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('is_reserved_agent_slug', { p_slug: slug });
  expect(error, `is_reserved_agent_slug('${slug}') errored: ${error?.message}`).toBeNull();
  return data as boolean;
}
async function isReservedMachine(slug: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('is_reserved_machine_slug', { p_slug: slug });
  expect(error, `is_reserved_machine_slug('${slug}') errored: ${error?.message}`).toBeNull();
  return data as boolean;
}

test.describe('Migration p1212: the agent- slug namespace is reserved', () => {
  test.setTimeout(60000);

  test('reserves agent- regardless of separator or case', async () => {
    for (const slug of ['agent-yann-lecun', 'agent_smith', 'agent.x', 'AGENT-X', 'Agent-Yann']) {
      expect(await isReservedAgent(slug), `${slug} must be reserved`).toBe(true);
    }
  });

  /** The confusables path. Cyrillic а (U+0430) and Cyrillic е (U+0435) render identically to
   *  the ASCII letters; without folding, `аgent-sam-harris` is a mintable impersonation. */
  test('reserves lookalike spellings a reader cannot distinguish', async () => {
    expect(await isReservedAgent('аgent-sam-harris'), 'Cyrillic a').toBe(true);
    expect(await isReservedAgent('agеnt-sam-harris'), 'Cyrillic e').toBe(true);
    expect(await isReservedAgent('ageпt-sam-harris'), 'Cyrillic n').toBe(true);
    // A zero-width joiner must not be able to split the token.
    expect(await isReservedAgent('age​nt-sam-harris'), 'zero-width space').toBe(true);
  });

  /**
   * THE COMBINING-MARK BYPASS. `20260824140000` closed exactly this hole in
   * is_reserved_machine_slug: U+0332 COMBINING LOW LINE renders as an underline UNDER the
   * letter, leaves it legible, and is NOT removed by NFKC — so `a` + U+0332 + `gent-x` reads
   * as "agent-x" to a human and, without decomposition, tests as a different first token.
   *
   * This test exists because `is_reserved_agent_slug` was first cloned from the PRE-FIX
   * definition in 20260824120000 rather than the corrected one in 20260824140000 — the older
   * file was found first and read like the current one.
   */
  test('reserves a spelling hidden behind a combining mark', async () => {
    expect(await isReservedAgent('a\u0332gent-sam-harris'), 'combining low line').toBe(true);
    expect(await isReservedAgent('a\u0301gent-sam-harris'), 'combining acute').toBe(true);
    expect(await isReservedAgent('age\u0332nt-sam-harris'), 'mark mid-token').toBe(true);
  });

  /** The false-positive side, which is the half a reservation test usually omits. The token
   *  test is exact: a real handle that merely STARTS with the letters must still be mintable. */
  test('does NOT reserve legitimate handles that merely begin with the letters', async () => {
    for (const slug of ['agentic-systems', 'agents-of-change', 'agenda-2030', 'my-agent', 'yann-lecun']) {
      expect(await isReservedAgent(slug), `${slug} must remain available to a real person`).toBe(false);
    }
  });

  /**
   * A KNOWN GAP, ASSERTED AS-IS SO IT CANNOT GO QUIET — filed as its own bug, NOT fixed here.
   *
   * The combining-mark strip allows `[:alnum:] [:space:] [:punct:]` through and drops the
   * rest. Unicode classifies TILDE (U+007E) as Sm, a MATH SYMBOL — not punctuation — so the
   * strip removes it and `agent~x` tokenises as `agentx`. The same is true of + < = > | $ ^ `.
   *
   * This is NOT introduced by the agent- namespace: the shipped `is_reserved_machine_slug`
   * behaves identically, which the second assertion below pins. It has been live since
   * 20260824140000. Both guards are equally affected, so the rename neither creates nor
   * worsens it — but a rename is not a licence to inherit a hole silently.
   *
   * These assertions record CURRENT behaviour. When the bug is fixed both flip to `true`
   * and this test fails loudly, which is the point: a gap nobody can see is a gap nobody
   * fixes, and a skipped test would have hidden it.
   */
  test('KNOWN GAP: a symbol separator defeats BOTH guards, identically', async () => {
    expect(await isReservedAgent('agent~x'), 'agent- guard, tilde').toBe(false);
    expect(await isReservedMachine('machine~x'), 'shipped machine- guard, same tilde').toBe(false);
    // The hyphen and underscore paths — real punctuation — are unaffected on both.
    expect(await isReservedAgent('agent-x')).toBe(true);
    expect(await isReservedMachine('machine-x')).toBe(true);
  });

  test('empty and null are not reserved', async () => {
    expect(await isReservedAgent('')).toBe(false);
    const { data } = await supabaseAdmin.rpc('is_reserved_agent_slug', { p_slug: null });
    expect(data).toBe(false);
  });

  /** THE RETIRED NAMESPACE STAYS CLOSED. Renaming the namespace for CREATION and opening the
   *  old one to CLIENTS are different decisions; only the first was taken. */
  test('machine- is STILL reserved after the rename — the old URLs stay unmintable', async () => {
    expect(await isReservedMachine('machine-sam-harris')).toBe(true);
    expect(await isReservedMachine('machine_x')).toBe(true);

    expect(await isReservedMachine('machinery-co'), 'exact token, not a prefix match').toBe(false);
  });
});
