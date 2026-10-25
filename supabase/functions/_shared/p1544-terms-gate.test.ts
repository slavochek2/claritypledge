// Deno test, no network: deno test --config supabase/functions/deno.json supabase/functions/_shared/p1544-terms-gate.test.ts
// P1544: the gate lets only a caller whose recorded acceptance is the current version through, and
// fails closed on everything else (old version, no row, read error, empty value).
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { callerHasCurrentTerms, TERMS_NOT_ACCEPTED_BODY, TERMS_NOT_ACCEPTED_STATUS } from './terms-gate.ts';
import { SERVER_CURRENT_TERMS_VERSION } from './terms-version.ts';

function stub(result: { data: { accepted_terms_version?: unknown } | null; error: unknown }, seen: string[] = []) {
  return {
    from: (_t: 'profiles') => ({
      select: (_c: 'accepted_terms_version') => ({
        eq: (_col: 'id', value: string) => {
          seen.push(value);
          return { maybeSingle: () => Promise.resolve(result) };
        },
      }),
    }),
  };
}

Deno.test('P1544: the current version passes, and the profile read is by the given user id', async () => {
  const seen: string[] = [];
  assertEquals(await callerHasCurrentTerms(stub({ data: { accepted_terms_version: SERVER_CURRENT_TERMS_VERSION }, error: null }, seen), 'u-1'), true);
  assertEquals(seen, ['u-1']);
});

Deno.test('P1544: a superseded version, a null, an empty string and a missing row are refused', async () => {
  for (const v of ['v1.4', 'v1.3', '', null, undefined]) {
    assertEquals(await callerHasCurrentTerms(stub({ data: { accepted_terms_version: v }, error: null }), 'u-1'), false, String(v));
  }
  assertEquals(await callerHasCurrentTerms(stub({ data: null, error: null }), 'u-1'), false);
});

Deno.test('P1544: a read error refuses (fail closed), even when a current value came back with it', async () => {
  assertEquals(await callerHasCurrentTerms(stub({ data: { accepted_terms_version: SERVER_CURRENT_TERMS_VERSION }, error: { message: 'boom' } }), 'u-1'), false);
});

Deno.test('P1544: the refusal is a typed 409', () => {
  assertEquals(TERMS_NOT_ACCEPTED_STATUS, 409);
  assertEquals(TERMS_NOT_ACCEPTED_BODY.error, 'terms_not_accepted');
});
