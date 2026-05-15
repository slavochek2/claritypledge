/**
 * @file p839-parity-positions.test.ts
 * @description P839 parity canary for the POSITIONS payload between
 * `letter-reading-page → signup-page` (client) and
 * `request-letter-response-signin/index.ts:isValidPositionsArray` (server).
 *
 * Surface state at write time:
 *   - Client emits POSITION_VALUES values in the integer range [-3, +3].
 *   - Server `isValidPositionsArray` checks `typeof item.position === 'number'`
 *     and the pointId is a UUID — but does NOT bound-check `position`.
 *   - DB column constraint (target table for these positions) — to confirm
 *     during execution; if a CHECK exists, this canary should also assert it.
 *
 * Two audit conclusions captured here:
 *   (1) Every value the client can send round-trips through the current
 *       server predicate. (Trivially true today — typeof===number passes for
 *       every POSITION_VALUES value.) The canary still asserts it explicitly
 *       so that any future tightening of the server predicate (e.g. adding a
 *       range check that excludes 0) immediately breaks this test.
 *   (2) The server has no defensive bound. A malformed or hostile client
 *       could submit `position: 999` or `position: -Infinity` and the
 *       server would forward it. This is a separate bug worth filing — see
 *       the `it.fails` block at the bottom; flipping it from `it.fails` to
 *       `it()` after the server adds a `>=-3 && <=3 && Number.isInteger`
 *       guard is the closure signal.
 *
 * SOURCE — keep verbatim copy in sync if this file is touched:
 *   supabase/functions/request-letter-response-signin/index.ts:214-225
 */

import { describe, it, expect } from 'vitest';
import { POSITION_VALUES } from '@/app/types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORY_ID = '11111111-1111-1111-1111-111111111111';

// Verbatim copy of edge function predicate (request-letter-response-signin/index.ts:214-225).
function isValidPositionsArrayEdge(arr: unknown): boolean {
  if (!Array.isArray(arr)) return false;
  return arr.every(
    (item) =>
      item !== null &&
      typeof item === 'object' &&
      typeof (item as { pointId: unknown }).pointId === 'string' &&
      UUID_REGEX.test((item as { pointId: string }).pointId) &&
      typeof (item as { position: unknown }).position === 'number',
  );
}

describe('P839 parity: POSITIONS — client values round-trip through server predicate', () => {
  it('every POSITION_VALUES value is accepted by isValidPositionsArray', () => {
    const rejected: number[] = [];
    for (const value of Object.values(POSITION_VALUES)) {
      if (!isValidPositionsArrayEdge([{ pointId: STORY_ID, position: value }])) {
        rejected.push(value);
      }
    }
    expect(rejected).toEqual([]);
  });

  it('client POSITION_VALUES range is the documented [-3, +3] integer range', () => {
    const values = Object.values(POSITION_VALUES);
    expect(Math.min(...values)).toBe(-3);
    expect(Math.max(...values)).toBe(3);
    expect(values.every((v) => Number.isInteger(v))).toBe(true);
  });
});

describe('P839 audit gap: POSITIONS — server has no defensive bound', () => {
  // These two `it.fails` blocks document a known gap surfaced by the P835
  // backfill audit. The server predicate accepts any number for `position`,
  // so values outside the client's [-3, +3] range pass without rejection.
  // When/if the server is hardened (Number.isInteger + bound check), flip
  // `it.fails` → `it()` to lock in the new behavior.

  it.fails('server should reject position=999 (out of any reasonable range)', () => {
    expect(isValidPositionsArrayEdge([{ pointId: STORY_ID, position: 999 }])).toBe(false);
  });

  it.fails('server should reject non-integer position (e.g. 1.5)', () => {
    expect(isValidPositionsArrayEdge([{ pointId: STORY_ID, position: 1.5 }])).toBe(false);
  });
});
