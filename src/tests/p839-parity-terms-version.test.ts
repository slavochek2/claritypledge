/**
 * @file p839-parity-terms-version.test.ts
 * @description P839 parity canary: ACCEPTED_TERMS_VERSIONS must be in lockstep
 * across the client (`src/lib/constants.ts`) and three edge functions that
 * gate writes on terms acceptance.
 *
 * Drift class: bumping the client `CURRENT_TERMS_VERSION` (and therefore what
 * the UI sends) without updating one or more server allowlists. The flow that
 * misses the bump silently rejects all submissions with a generic
 * "Invalid request" — exactly the P835 failure mode, applied to a different
 * field.
 *
 * SOURCE — keep verbatim copies in sync if these files are touched:
 *   - supabase/functions/request-letter-response-signin/index.ts:26
 *   - supabase/functions/create-and-open-letter/index.ts:23
 *   - supabase/functions/create-and-sign/index.ts:19
 */

import { describe, it, expect } from 'vitest';
import {
  CURRENT_TERMS_VERSION,
  ACCEPTED_TERMS_VERSIONS as CLIENT_ACCEPTED,
} from '@/lib/constants';

const SERVER_ACCEPTED_request_letter_response_signin = ['v1.3', 'v1.4'] as const;
const SERVER_ACCEPTED_create_and_open_letter = ['v1.3', 'v1.4'] as const;
const SERVER_ACCEPTED_create_and_sign = ['v1.3', 'v1.4'] as const;

const SERVER_ALLOWLISTS = [
  ['request-letter-response-signin', SERVER_ACCEPTED_request_letter_response_signin],
  ['create-and-open-letter', SERVER_ACCEPTED_create_and_open_letter],
  ['create-and-sign', SERVER_ACCEPTED_create_and_sign],
] as const;

describe('P839 parity: TERMS_VERSION across client + 3 edge functions', () => {
  it('CURRENT_TERMS_VERSION (the value the client actually sends) is accepted by every server allowlist', () => {
    for (const [fn, serverList] of SERVER_ALLOWLISTS) {
      expect(
        (serverList as readonly string[]).includes(CURRENT_TERMS_VERSION),
        `Edge function "${fn}" allowlist ${JSON.stringify(serverList)} does not accept CURRENT_TERMS_VERSION="${CURRENT_TERMS_VERSION}". A client-side terms bump landed without updating this function — submissions to it will 400.`,
      ).toBe(true);
    }
  });

  it('every value in client ACCEPTED_TERMS_VERSIONS is accepted by every server allowlist', () => {
    for (const v of CLIENT_ACCEPTED) {
      for (const [fn, serverList] of SERVER_ALLOWLISTS) {
        expect(
          (serverList as readonly string[]).includes(v),
          `Client accepts "${v}" but edge function "${fn}" does not.`,
        ).toBe(true);
      }
    }
  });

  it('all three server allowlists agree with each other (no inter-server drift)', () => {
    const reference = SERVER_ALLOWLISTS[0][1];
    for (let i = 1; i < SERVER_ALLOWLISTS.length; i++) {
      const [fn, list] = SERVER_ALLOWLISTS[i];
      expect(
        [...list].sort(),
        `Edge function "${fn}" allowlist diverges from "${SERVER_ALLOWLISTS[0][0]}".`,
      ).toEqual([...reference].sort());
    }
  });
});
