// Deno test: run with `deno test --config supabase/functions/deno.json --allow-env supabase/functions/_shared/p1675-hike-email.test.ts`
// @file p1675-hike-email.test.ts
// @description P1675: the hike's confirmation block and "offers preparation" rule; Clarity Night and mastermind stay byte-identical.
import { assert, assertEquals, assertFalse, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildConfirmation, buildReminder, escapeHtml, type EventRow } from './email-helpers.ts';
import {
  HIKE_OFFLINE_MAPS_LINE,
  HIKE_ROLE_LEAD,
  HIKE_ROLE_SWEEP,
  HIKE_ROLE_TRANSPORT_LEAD,
  HIKE_ROLE_WELCOMER,
  HIKE_WHATSAPP_FREE_SEATS_LINE,
} from './hike-copy.ts';
import { hikeEmailLines, withHikeBlock, withPreparationOffered, withSeriesBlock } from './series-email-block.ts';

const base: EventRow = { id: 'e', title: 'Clarity Hike: Trail', datetime: '2026-11-30T03:00:00+00:00', duration_minutes: 240, timezone: 'Asia/Bangkok', location: 'L', description: null, slug: 'trail', host_id: 'h', preparation_enabled: false };
const hike = { ...base, series_slug: 'social-hike' };
const night = { ...base, series_slug: 'clarity-night' };
const mm = { ...base, series_slug: 'sales-mastermind' };
const email = { subject: 'S', html: '<table><tr><td>body</td></tr><!-- Footer --><tr><td>foot</td></tr></table>', text: 'body' };
const PREP_URL = 'https://example.test/prepare-ticket';

Deno.test('offers preparation: a hike with the stored flag off gets the link; the flag is not written', () => {
  const offered = withPreparationOffered(hike);
  assertEquals(offered.preparation_enabled, true);
  assertEquals(hike.preparation_enabled, false); // original untouched
  const conf = buildConfirmation(offered, 'A', PREP_URL);
  assert(conf.html.includes(PREP_URL) && conf.text.includes(PREP_URL));
  const rem = buildReminder(offered, 'A', { prep: 'not_started', prepareUrl: PREP_URL });
  assert(rem.html.includes(PREP_URL));
  // control: without the rule the same hike has no link
  assertFalse(buildConfirmation(hike, 'A', PREP_URL).html.includes(PREP_URL));
  // flow column wins over series_slug
  assertEquals(withPreparationOffered({ ...base, flow: 'social-hike' }).preparation_enabled, true);
});

Deno.test('Clarity Night and mastermind: same object, byte-identical emails', () => {
  for (const e of [night, base, mm, { ...mm, flow: 'sales-mastermind' }]) {
    assertStrictEquals(withPreparationOffered(e), e);
    assertStrictEquals(withHikeBlock(email, e, { transport: 'car', free_seats: 3, help: 'lead' }), email);
    assertEquals(buildConfirmation(withPreparationOffered(e), 'A', null), buildConfirmation(e, 'A', null));
    assertEquals(buildReminder(withPreparationOffered(e), 'A', {}), buildReminder(e, 'A', {}));
  }
  // flag on stays on, untouched
  const on = { ...night, preparation_enabled: true };
  assertStrictEquals(withPreparationOffered(on), on);
  // the series block is untouched for a night
  assertStrictEquals(withSeriesBlock(email, night), email);
});

Deno.test('hike lines: free seats line for car/motorbike with 1+ seats only', () => {
  assertEquals(hikeEmailLines({ transport: 'car', free_seats: 2, help: null }), [HIKE_WHATSAPP_FREE_SEATS_LINE]);
  assertEquals(hikeEmailLines({ transport: 'motorbike', free_seats: 1, help: null }), [HIKE_WHATSAPP_FREE_SEATS_LINE]);
  assertEquals(hikeEmailLines({ transport: 'car', free_seats: 0, help: null }), []);
  assertEquals(hikeEmailLines({ transport: 'bike_or_foot', free_seats: null, help: null }), []);
  assertEquals(hikeEmailLines({ transport: 'need_ride', free_seats: null, help: null }), []);
});

Deno.test('hike lines: each role gets its approved text; lead and sweep end with the offline-maps line', () => {
  assertEquals(hikeEmailLines({ transport: 'bike_or_foot', free_seats: null, help: 'lead' }), [HIKE_ROLE_LEAD, HIKE_OFFLINE_MAPS_LINE]);
  assertEquals(hikeEmailLines({ transport: 'bike_or_foot', free_seats: null, help: 'sweep' }), [HIKE_ROLE_SWEEP, HIKE_OFFLINE_MAPS_LINE]);
  assertEquals(hikeEmailLines({ transport: 'bike_or_foot', free_seats: null, help: 'welcomer' }), [HIKE_ROLE_WELCOMER]);
  assertEquals(hikeEmailLines({ transport: 'need_ride', free_seats: null, help: 'transport_lead' }), [HIKE_ROLE_TRANSPORT_LEAD]);
  assertEquals(hikeEmailLines({ transport: 'car', free_seats: 2, help: 'welcomer' }), [HIKE_WHATSAPP_FREE_SEATS_LINE, HIKE_ROLE_WELCOMER]);
});

Deno.test('hike block: other adds nothing and help_other never reaches an email; placement before the footer', () => {
  const answers = { transport: 'bike_or_foot', free_seats: null, help: 'other', help_other: 'dog food <b>x</b>' } as never;
  assertStrictEquals(withHikeBlock(email, hike, answers), email);
  const out = withHikeBlock(email, hike, { transport: 'car', free_seats: 2, help: 'lead' });
  assert(out.html.includes(escapeHtml(HIKE_WHATSAPP_FREE_SEATS_LINE)));
  assert(out.html.indexOf('WhatsApp group') < out.html.indexOf('<!-- Footer -->'));
  assert(out.text.endsWith(`${HIKE_WHATSAPP_FREE_SEATS_LINE}\n${HIKE_ROLE_LEAD}\n${HIKE_OFFLINE_MAPS_LINE}`));
  assertFalse(out.text.includes('call another number'));
  assertStrictEquals(withHikeBlock(email, hike, null), email);
});

Deno.test('hike block escapes through escapeHtml', () => {
  // Every line goes through the shared escapeHtml in html and stays verbatim in text; markup in a line cannot pass.
  const out = withHikeBlock(email, hike, { transport: 'bike_or_foot', free_seats: null, help: 'sweep' });
  assert(out.html.includes(`<li style="margin:0 0 4px;">${escapeHtml(HIKE_ROLE_SWEEP)}</li>`));
  assert(out.text.includes(HIKE_ROLE_SWEEP));
  assertEquals(escapeHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});
