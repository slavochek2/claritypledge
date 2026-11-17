// Deno test: run with `deno test --config supabase/functions/deno.json --allow-env supabase/functions/_shared/p1675-hike-email.test.ts`
// @file p1675-hike-email.test.ts
// @description P1675: the hike's confirmation block and "offers preparation" rule; Clarity Night and mastermind stay byte-identical.
import { assert, assertEquals, assertFalse, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildConfirmation, buildReminder, escapeHtml, type EventRow } from './email-helpers.ts';
import {
  HIKE_GROUP_CHAT_LINE,
  HIKE_NEED_RIDE_LINE,
  HIKE_OFFLINE_MAPS_LINE,
  HIKE_ROLE_HEADING_SUFFIX,
  HIKE_ROLE_LEAD,
  HIKE_ROLE_SWEEP,
  HIKE_ROLE_TRANSPORT_LEAD,
  HIKE_ROLE_WELCOMER,
  HIKE_WHATSAPP_FREE_SEATS_LINE,
} from './hike-copy.ts';
import { hikeEmailLines, loadGroupChatUrl, safeHttpUrl, withHikeBlock, withPreparationOffered, withSeriesBlock } from './series-email-block.ts';

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
  // UAT R2: the ride line replaces the old "nothing" for need_ride
  assertEquals(hikeEmailLines({ transport: 'need_ride', free_seats: null, help: null }), [HIKE_NEED_RIDE_LINE]);
  // R6: transport not asked (NULL) must not crash and adds nothing
  assertEquals(hikeEmailLines({ transport: null, free_seats: null, help: null }), []);
  assertEquals(hikeEmailLines({ transport: null, free_seats: null, help: 'welcomer' }), [HIKE_ROLE_WELCOMER]);
});

Deno.test('hike lines: each role gets its approved text; lead and sweep end with the offline-maps line', () => {
  assertEquals(hikeEmailLines({ transport: 'bike_or_foot', free_seats: null, help: 'lead' }), [HIKE_ROLE_LEAD, HIKE_OFFLINE_MAPS_LINE]);
  assertEquals(hikeEmailLines({ transport: 'bike_or_foot', free_seats: null, help: 'sweep' }), [HIKE_ROLE_SWEEP, HIKE_OFFLINE_MAPS_LINE]);
  assertEquals(hikeEmailLines({ transport: 'bike_or_foot', free_seats: null, help: 'welcomer' }), [HIKE_ROLE_WELCOMER]);
  assertEquals(hikeEmailLines({ transport: 'need_ride', free_seats: null, help: 'transport_lead' }), [HIKE_NEED_RIDE_LINE, HIKE_ROLE_TRANSPORT_LEAD]);
  assertEquals(hikeEmailLines({ transport: 'car', free_seats: 2, help: 'welcomer' }), [HIKE_WHATSAPP_FREE_SEATS_LINE, HIKE_ROLE_WELCOMER]);
});

Deno.test('hike block: other adds nothing and help_other never reaches an email; placement before the footer', () => {
  const answers = { transport: 'bike_or_foot', free_seats: null, help: 'other', help_other: 'dog food <b>x</b>' } as never;
  assertStrictEquals(withHikeBlock(email, hike, answers), email);
  const out = withHikeBlock(email, hike, { transport: 'car', free_seats: 2, help: 'lead' });
  assert(out.html.includes(escapeHtml(HIKE_WHATSAPP_FREE_SEATS_LINE)));
  assert(out.html.indexOf('WhatsApp group') < out.html.indexOf('<!-- Footer -->'));
  // UAT R4: the role's heading sits between the bullets and the role text
  assert(out.text.endsWith(`${HIKE_WHATSAPP_FREE_SEATS_LINE}\n\nLead${HIKE_ROLE_HEADING_SUFFIX}\n${HIKE_ROLE_LEAD}\n${HIKE_OFFLINE_MAPS_LINE}`));
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

// ── UAT round 1 (R2, R4, R6, R7) ─────────────────────────────────────────────

Deno.test('R2: the ride line is in the confirmation for need_ride only', () => {
  const ride = withHikeBlock(email, hike, { transport: 'need_ride', free_seats: null, help: null });
  assert(ride.text.includes(HIKE_NEED_RIDE_LINE) && ride.html.includes(escapeHtml(HIKE_NEED_RIDE_LINE)));
  for (const transport of ['car', 'motorbike', 'bike_or_foot']) {
    const out = withHikeBlock(email, hike, { transport, free_seats: transport === 'bike_or_foot' ? null : 0, help: null });
    assertStrictEquals(out, email); // nothing to add, same object
  }
  assertStrictEquals(withHikeBlock(email, hike, { transport: null, free_seats: null, help: null }), email);
});

Deno.test('R4: a chosen role renders a heading above its text, in text and HTML, with the display label', () => {
  const out = withHikeBlock(email, hike, { transport: 'need_ride', free_seats: null, help: 'transport_lead' });
  const heading = `Transport lead${HIKE_ROLE_HEADING_SUFFIX}`;
  assert(out.text.includes(`${heading}\n${HIKE_ROLE_TRANSPORT_LEAD}`));
  assertFalse(out.text.includes('transport_lead'));
  assertFalse(out.html.includes('transport_lead'));
  assert(out.html.includes(`>${escapeHtml(heading)}</p>`)); // a heading element, not an <li>
  assertFalse(out.html.includes(`<li style="margin:0 0 4px;">${escapeHtml(heading)}`));
  assert(out.html.indexOf(escapeHtml(heading)) < out.html.indexOf(escapeHtml(HIKE_ROLE_TRANSPORT_LEAD)));
  // each role label
  for (const [help, label] of [['lead', 'Lead'], ['sweep', 'Sweep'], ['welcomer', 'Welcomer']]) {
    assert(withHikeBlock(email, hike, { transport: 'bike_or_foot', free_seats: null, help }).text.includes(`${label}${HIKE_ROLE_HEADING_SUFFIX}`));
  }
  // other and a null help: no heading
  assertStrictEquals(withHikeBlock(email, hike, { transport: 'bike_or_foot', free_seats: null, help: 'other' }), email);
});

Deno.test('R7: group chat link is shown only for http(s); javascript: and garbage are refused', () => {
  assertEquals(safeHttpUrl('https://chat.whatsapp.com/abc'), 'https://chat.whatsapp.com/abc');
  assertEquals(safeHttpUrl('http://example.test/x'), 'http://example.test/x');
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'ftp://x.test/a', 'not a url', '', null, undefined]) {
    assertEquals(safeHttpUrl(bad as string | null), null, String(bad));
  }
  const out = withHikeBlock(email, hike, null, 'https://chat.whatsapp.com/abc?a=1&b=<2>');
  assert(out.text.includes(`${HIKE_GROUP_CHAT_LINE} https://chat.whatsapp.com/abc?a=1&b=%3C2%3E`));
  assert(out.html.includes('href="https://chat.whatsapp.com/abc?a=1&amp;b=%3C2%3E"')); // escaped in HTML
  assert(out.html.indexOf(HIKE_GROUP_CHAT_LINE.slice(0, 10)) < out.html.indexOf('<!-- Footer -->'));
  // javascript: refused even if it reaches the block
  assertStrictEquals(withHikeBlock(email, hike, null, 'javascript:alert(1)'), email);
  // not set: no line
  assertStrictEquals(withHikeBlock(email, hike, null, null), email);
  assertFalse(withHikeBlock(email, hike, { transport: 'need_ride', free_seats: null, help: null }).text.includes(HIKE_GROUP_CHAT_LINE));
  // Clarity Night and mastermind never get it
  assertStrictEquals(withHikeBlock(email, night, null, 'https://chat.whatsapp.com/abc'), email);
  assertStrictEquals(withHikeBlock(email, mm, null, 'https://chat.whatsapp.com/abc'), email);
  // the ride line is sent with or without a link
  const both = withHikeBlock(email, hike, { transport: 'need_ride', free_seats: null, help: null }, 'https://chat.whatsapp.com/abc');
  assert(both.text.includes(HIKE_NEED_RIDE_LINE) && both.text.includes(HIKE_GROUP_CHAT_LINE));
});

// A tiny stand-in for the supabase client: records which tables were read.
function fakeClient(rows: { rsvp: unknown; url: string | null; rsvpError?: boolean }) {
  const reads: string[] = [];
  const client = {
    from(table: string) {
      reads.push(table);
      const result = table === 'event_rsvps'
        ? { data: rows.rsvp, error: rows.rsvpError ? { message: 'boom' } : null }
        : { data: { group_chat_url: rows.url }, error: null };
      const chain = { select: () => chain, eq: () => chain, maybeSingle: () => Promise.resolve(result) };
      return chain;
    },
  };
  return { client: client as never, reads };
}

Deno.test('R7: loadGroupChatUrl reads the private info only after an active registration row is found', async () => {
  const ok = fakeClient({ rsvp: { id: 'r1' }, url: 'https://chat.whatsapp.com/abc' });
  assertEquals(await loadGroupChatUrl(ok.client, 'e', 'p'), 'https://chat.whatsapp.com/abc');
  assertEquals(ok.reads, ['event_rsvps', 'event_private_info']);

  const none = fakeClient({ rsvp: null, url: 'https://chat.whatsapp.com/abc' });
  assertEquals(await loadGroupChatUrl(none.client, 'e', 'p'), null);
  assertEquals(none.reads, ['event_rsvps']); // the private table is never touched

  const failed = fakeClient({ rsvp: null, url: 'https://x.test', rsvpError: true });
  assertEquals(await loadGroupChatUrl(failed.client, 'e', 'p'), null);

  const unset = fakeClient({ rsvp: { id: 'r1' }, url: null });
  assertEquals(await loadGroupChatUrl(unset.client, 'e', 'p'), null);
  const js = fakeClient({ rsvp: { id: 'r1' }, url: 'javascript:alert(1)' });
  assertEquals(await loadGroupChatUrl(js.client, 'e', 'p'), null);
  assertEquals(await loadGroupChatUrl(ok.client, 'e', null), null);
});

Deno.test('R7: a lookup that throws costs only the link, never the email (returns null)', async () => {
  const throwing = { from: () => { throw new Error('network down'); } } as unknown as Parameters<typeof loadGroupChatUrl>[0];
  assertEquals(await loadGroupChatUrl(throwing, 'e', 'p'), null);
});

// ── Round 2: dispatcher skips hike feedback; hike preparation emails state no minute count ──

import { FEEDBACK_HOST_ID } from './email-helpers.ts';
import { dispatchFeedback, type RsvpRow } from './event-dispatch.ts';

function feedbackRow(series_slug: string, flow?: string): RsvpRow {
  const start = new Date(Date.now() - 5 * 3600_000);
  const scheduled = new Date(start.getTime() + 240 * 60_000 + 2 * 3600_000).toISOString();
  return {
    id: 'r', event_id: 'e', profile_id: 'p', reminder_scheduled_at: null, feedback_scheduled_at: scheduled,
    reminder_attempted_at: null, feedback_attempted_at: null, mailgun_message_ids: null,
    profiles: { email: 'test@example.com', name: 'T' },
    events: { ...base, datetime: start.toISOString(), host_id: FEEDBACK_HOST_ID, status: 'upcoming', series_slug, ...(flow ? { flow } : {}) },
  } as unknown as RsvpRow;
}
function recordingClient() {
  const calls: string[] = [];
  const client = {
    rpc: (name: string) => { calls.push(`rpc:${name}`); return Promise.resolve({ data: null, error: { message: 'stub' } }); },
    from: (t: string) => { calls.push(`from:${t}`); throw new Error('no table access expected'); },
  };
  return { client: client as never, calls };
}

Deno.test('R7: dispatchFeedback skips a hike (series_slug or flow) before any claim; a non-hike still reaches the claim', async () => {
  for (const row of [feedbackRow('social-hike'), feedbackRow('clarity-night', 'social-hike')]) {
    const { client, calls } = recordingClient();
    assertEquals(await dispatchFeedback(client, row, new Date(), true), 'skipped:hike');
    assertEquals(calls, []); // no claim rpc, no table read or update
  }
  for (const row of [feedbackRow('clarity-night'), feedbackRow('sales-mastermind')]) {
    const { client, calls } = recordingClient();
    const out = await dispatchFeedback(client, row, new Date(), true);
    assert(out !== 'skipped:hike');
    assert(calls.length > 0, 'control: a non-hike goes on to the claim');
  }
});

const MINUTES = /\d+\s*-?\s*minutes?/i;
const allText = (e: { subject: string; html: string; text: string }) => `${e.subject}\n${e.text}\n${e.html}`;

Deno.test('R7: hike preparation emails state no minute count; Clarity Night and mastermind are unchanged', () => {
  const hikeOffered = withPreparationOffered(hike);
  const conf = buildConfirmation(hikeOffered, 'A', PREP_URL);
  assertFalse(MINUTES.test(allText(conf)), 'hike confirmation has no minute count');
  assert(conf.subject.includes('short introduction') && conf.subject.includes(hike.title));
  for (const prep of ['not_started', 'started'] as const) {
    const rem = buildReminder(hikeOffered, 'A', { prep, prepareUrl: PREP_URL });
    assertFalse(MINUTES.test(`${rem.subject}\n${rem.text}`), `hike reminder (${prep}) subject and text`);
    assertFalse(MINUTES.test(rem.html), `hike reminder (${prep}) html`);
  }
  assert(buildReminder(hikeOffered, 'A', { prep: 'not_started', prepareUrl: PREP_URL }).text.includes('Have you done the short introduction for the hike?'));
  // control: the same regex does catch Clarity Night's number
  const nightOn = { ...night, preparation_enabled: true };
  assert(MINUTES.test(allText(buildConfirmation(nightOn, 'A', PREP_URL))));
  assert(buildConfirmation(nightOn, 'A', PREP_URL).subject.startsWith('15 minutes to prepare for'));
  assert(buildReminder(nightOn, 'A', { prep: 'not_started', prepareUrl: PREP_URL }).subject.includes('15 minutes to prepare?'));
  assert(buildConfirmation(nightOn, 'A', PREP_URL).text.includes('Do you have 15 minutes to prepare for the event?'));
  assert(buildReminder(nightOn, 'A', { prep: 'not_started', prepareUrl: PREP_URL }).text.includes('Do you have 15 minutes to prepare for the event?'));
  const mmOn = { ...mm, preparation_enabled: true };
  assert(buildConfirmation(mmOn, 'A', PREP_URL).subject.startsWith('Your 15-minute preparation for'));
  assert(buildReminder(mmOn, 'A', { prep: 'not_started', prepareUrl: PREP_URL }).text.includes('Do your 15-minute preparation'));
});
