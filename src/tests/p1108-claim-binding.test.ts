/**
 * P1108 — DW-4: the claim/column binding mechanism (Decision 4) must be demonstrated
 * to fail, not just asserted to work. `bindClaim` is unit-tested here in isolation
 * against fabricated arrays — no fetch, no handler — so the fail path stays exercised
 * on every run, not only during the one-time manual demonstration (delete a column
 * from a real *_COLUMNS array, re-run, paste the throw, restore) recorded separately.
 */
import { describe, it, expect } from 'vitest';
import { bindClaim } from '../../api/og';

describe('api/og.ts — bindClaim (P1108 Decision 4)', () => {
  it('throws when the claimed column is absent from the selected-columns array', () => {
    const COLUMNS = ['name', 'role'] as const;
    expect(() => bindClaim(COLUMNS, 'has_pledged', 'signed the Clarity Pledge')).toThrow(
      /og\.ts claim binding violated/,
    );
  });

  it('the thrown error names both the missing column and the claim it would back', () => {
    const COLUMNS = ['name', 'role'] as const;
    expect(() => bindClaim(COLUMNS, 'has_pledged', 'signed the Clarity Pledge')).toThrow(
      /has_pledged/,
    );
    expect(() => bindClaim(COLUMNS, 'has_pledged', 'signed the Clarity Pledge')).toThrow(
      /signed the Clarity Pledge/,
    );
  });

  it('does not throw when the claimed column is present', () => {
    const COLUMNS = ['name', 'role', 'has_pledged'] as const;
    expect(() => bindClaim(COLUMNS, 'has_pledged', 'signed the Clarity Pledge')).not.toThrow();
  });

  it('the real PROFILE_COLUMNS binding in api/og.ts does not throw at import time', async () => {
    // Importing the module runs every module-scope bindClaim call. If a future edit
    // deletes 'has_pledged' or the agent embed from PROFILE_COLUMNS while the binding
    // call stays in place, this import throws — the permanent regression for DW-4.
    await expect(import('../../api/og')).resolves.toBeDefined();
  });

  // Adversarial review (2026-08-20, HIGH): the original bindClaim used exact array
  // membership (`selectedColumns.includes(column)`), which only ever checked STORY_
  // COLUMNS/POINT_COLUMNS against themselves — those arrays were never used to build
  // the real select query, so the check was decorative. Fixed by (a) making bindClaim
  // match a column as a SUBSTRING of any selected-column entry (so a nested embed
  // selector like `profiles!fkey(name,agent_accounts(operator_name))` still matches
  // the bare embed name), and (b) making the arrays themselves the source the query
  // is built from (`STORY_COLUMNS.join(',')`), so editing the query without editing
  // the array is no longer possible. These two tests pin (a) directly.
  it('matches a claimed column when it appears NESTED inside a compound select entry (a to-one embed)', () => {
    const COLUMNS = ['title', 'content', 'profiles!fkey(name,agent_accounts(operator_name))'] as const;
    expect(() => bindClaim(COLUMNS, 'agent_accounts(operator_name)', 'operated by {operator}')).not.toThrow();
  });

  it('still throws when the nested embed is absent from every entry, not just missing as a bare element', () => {
    const COLUMNS = ['title', 'content', 'profiles!fkey(name)'] as const;
    expect(() => bindClaim(COLUMNS, 'agent_accounts(operator_name)', 'operated by {operator}')).toThrow(
      /og\.ts claim binding violated/,
    );
  });
});
