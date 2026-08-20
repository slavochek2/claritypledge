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
});
