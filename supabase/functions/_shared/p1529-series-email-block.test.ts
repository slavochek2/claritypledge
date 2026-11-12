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

Deno.test('canvas at the event (default): preparation is required, the canvas is made there, no laptop or "10 minutes"', () => {
  const owner = withSeriesBlock(email, { ...base, series_slug: 'sales-mastermind' });
  assert(owner.text.includes('Preparation is required: about 15 minutes, at home or 15 minutes early at the venue.'));
  assert(owner.text.includes('We make your Clarity Canvas together at the event.'));
  assertFalse(owner.text.includes('laptop'));
  assertFalse(owner.text.includes('10 minutes'));
  assert(owner.html.indexOf('Preparation is required') < owner.html.indexOf('<!-- Footer -->'));
  const observer = withSeriesBlock(email, { ...base, flow: 'sales-mastermind' }, { observer: true });
  assert(observer.text.includes('Preparation is required'));
  assertFalse(observer.text.includes('Clarity Canvas together'));
  assert(observer.text.includes('Bring your phone'));
  assertEquals(observer.subject, 'S');
});

Deno.test('canvas before the event keeps today\'s block: laptop line for an owner, no required-preparation line', () => {
  const owner = withSeriesBlock(email, { ...base, series_slug: 'sales-mastermind', canvas_timing: 'before' });
  assert(owner.text.includes('laptop'));
  assertFalse(owner.text.includes('Preparation is required'));
  const observer = withSeriesBlock(email, { ...base, flow: 'sales-mastermind', canvas_timing: 'before' }, { observer: true });
  assertFalse(observer.text.includes('laptop'));
});

Deno.test('observer hero payoff swaps the canvas line; reminder text carries the payoff', async () => {
  const { buildReminder } = await import('./email-helpers.ts');
  const ev = { ...base, flow: 'sales-mastermind', preparation_enabled: true } as EventRow;
  const r = buildReminder(ev, 'A', { prep: 'not_started', prepareUrl: 'https://x' });
  assert(r.text.includes('We make your Clarity Canvas together at the event.'));
  assert(r.html.includes('We make your Clarity Canvas together at the event.'));
  const o = withSeriesBlock(r, ev, { observer: true });
  assertFalse(o.html.includes('Clarity Canvas together'));
  assertFalse(o.text.includes('Clarity Canvas together'));
  assert(o.html.includes('help others make their Clarity Canvas at the start'));
});
