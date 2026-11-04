// Deno test: run with `deno test --config supabase/functions/deno.json --allow-env supabase/functions/_shared/p1529-series-email-block.test.ts`
// P1529: the per-series email block, byte-identical for every other series.
import { assert, assertEquals, assertFalse, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { EventRow } from './email-helpers.ts';
import { withSeriesBlock } from './series-email-block.ts';

const base: EventRow = { id: 'e', title: 'T', datetime: '2026-11-14T11:30:00+00:00', duration_minutes: 150, timezone: 'Asia/Bangkok', location: 'L', description: null, slug: 's', host_id: 'h' };
const email = { subject: 'S', html: '<table><tr><td>body</td></tr><!-- Footer --><tr><td>foot</td></tr></table>', text: 'body' };

Deno.test('every other series stays byte-identical', () => {
  for (const e of [base, { ...base, series_slug: 'social-hike' }, { ...base, flow: 'clarity-night', series_slug: 'sales-mastermind' }]) {
    assertStrictEquals(withSeriesBlock(email, e), email);
  }
});

Deno.test('the mastermind gets the block; only someone making a canvas gets the laptop line', () => {
  const owner = withSeriesBlock(email, { ...base, series_slug: 'sales-mastermind' });
  assert(owner.text.includes('laptop'));
  assert(owner.html.indexOf('laptop') < owner.html.indexOf('<!-- Footer -->'));
  const observer = withSeriesBlock(email, { ...base, flow: 'sales-mastermind' }, { observer: true });
  assertFalse(observer.text.includes('laptop'));
  assert(observer.text.includes('Bring your phone'));
  assertEquals(observer.subject, 'S');
});
