// Deno test: deno test --config supabase/functions/deno.json supabase/functions/_shared/p1603-rsvp-guard.test.ts
// P1603: the rsvp email goes only to someone who holds an RSVP row. Pure: a fake client, no mail, no network.
import { assert, assertEquals, assertFalse, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { callerHasRsvp } from './rsvp-guard.ts';

// A tiny fake of the query chain, backed by rows; records the filters it was given.
function fake(rows: Array<{ id: string; event_id: string; profile_id: string }>, fail = false) {
  const calls: Array<[string, string]> = [];
  const db = {
    from(table: string) {
      assertEquals(table, 'event_rsvps');
      const f: Record<string, string> = {};
      const q = {
        select: () => q,
        eq: (c: string, v: string) => { f[c] = v; calls.push([c, v]); return q; },
        maybeSingle: () => Promise.resolve(fail
          ? { data: null, error: { message: 'x' } }
          : { data: rows.find(r => r.event_id === f.event_id && r.profile_id === f.profile_id) ?? null, error: null }),
      };
      return q;
    },
  };
  return { db, calls };
}

const rows = [{ id: 'r1', event_id: 'public-evt', profile_id: 'member' }];

Deno.test('control: a registrant of a public event passes', async () => {
  assert(await callerHasRsvp(fake(rows).db, 'public-evt', 'member'));
});
Deno.test('a signed-in stranger who knows only the event id is refused (public or hidden alike)', async () => {
  assertFalse(await callerHasRsvp(fake(rows).db, 'public-evt', 'stranger'));
  assertFalse(await callerHasRsvp(fake(rows).db, 'hidden-evt', 'stranger'));
});
Deno.test('a registrant of one event is not a registrant of another', async () => {
  assertFalse(await callerHasRsvp(fake(rows).db, 'hidden-evt', 'member'));
});
Deno.test('a failed lookup fails closed (throws, sends nothing)', async () => {
  await assertRejects(() => callerHasRsvp(fake(rows, true).db, 'public-evt', 'member'));
});
Deno.test('the lookup is filtered on both the event and the caller', async () => {
  const f = fake(rows);
  await callerHasRsvp(f.db, 'public-evt', 'member');
  assertEquals(f.calls, [['event_id', 'public-evt'], ['profile_id', 'member']]);
});
