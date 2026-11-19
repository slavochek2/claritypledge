// Deno test: run with `deno test --config supabase/functions/deno.json --allow-env supabase/functions/_shared/p1675-r19-hike-arrival.test.ts`
// @file p1675-r19-hike-arrival.test.ts
// @description P1675 R19: a hiker who chose the meeting point gets the arrival line in place of the before-the-hike line.
import { assert, assertEquals, assertFalse, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildConfirmation, buildReminder, buildUpdate, type EventRow } from './email-helpers.ts';
import { hikeArrivalLine, hikeArrivalTime, hikeWhenOf, loadHikeWhenByProfile, withHikeArrival } from './hike-arrival-email.ts';
import { HIKE_PREP_QUESTION, HIKE_PREP_REMINDER_QUESTION } from './mastermind-prep-email.ts';
import { withPreparationOffered } from './series-email-block.ts';

const base: EventRow = { id: 'e', title: 'Clarity Hike: Trail', datetime: '2026-11-30T03:00:00+00:00', duration_minutes: 240, timezone: 'Asia/Bangkok', location: 'L', description: null, slug: 'trail', host_id: 'h', preparation_enabled: false };
const hike = withPreparationOffered({ ...base, series_slug: 'social-hike' });
const PREP_URL = 'https://example.test/prepare-ticket';

Deno.test('arrival time is start minus 15 minutes in the event zone, 24 hour', () => {
  assertEquals(hikeArrivalTime(base.datetime, 'Asia/Bangkok'), '09:45');
  assertEquals(hikeArrivalTime('2026-11-30T00:10:00+00:00', 'UTC'), '23:55');
  assertEquals(hikeArrivalLine('09:45'), 'Please come at 09:45 to do the short introduction at the meeting point.');
});

Deno.test('event answer: confirmation and reminder carry the arrival line, keep the link, drop the old line', () => {
  const line = hikeArrivalLine('09:45');
  const conf = withHikeArrival(buildConfirmation(hike, 'A', PREP_URL), hike, { when_choice: 'event' });
  assert(conf.text.includes(line) && conf.html.includes(line));
  assertFalse(conf.text.includes(HIKE_PREP_QUESTION) || conf.html.includes(HIKE_PREP_QUESTION));
  assert(conf.html.includes(PREP_URL) && conf.text.includes(PREP_URL));
  const rem = withHikeArrival(buildReminder(hike, 'A', { prep: 'not_started', prepareUrl: PREP_URL }), hike, { when_choice: 'event' });
  assert(rem.text.includes(line));
  assert(rem.html.includes(line));
  assertFalse(rem.html.includes(HIKE_PREP_REMINDER_QUESTION));
  assert(rem.html.includes(PREP_URL));
});

Deno.test('every confirmation and reminder state carries the arrival line in html and text for an event hiker', () => {
  const line = hikeArrivalLine('09:45');
  const plain = { ...base, series_slug: 'social-hike' }; // preparation not offered: no question at all
  const cases: Array<[string, ReturnType<typeof buildReminder>, EventRow]> = [
    ['not_started', buildReminder(hike, 'A', { prep: 'not_started', prepareUrl: PREP_URL }), hike],
    ['started', buildReminder(hike, 'A', { prep: 'started', prepareUrl: PREP_URL }), hike],
    ['complete', buildReminder(hike, 'A', { prep: 'complete', prepareUrl: PREP_URL }), hike],
    ['no prep', buildReminder(plain, 'A'), plain],
  ];
  for (const [name, email, ev] of cases) {
    const out = withHikeArrival(email, ev, { when_choice: 'event' }, 'reminder');
    assert(out.text.includes(line), `${name}: text`);
    assert(out.html.includes(line), `${name}: html`);
    // not duplicated where the stock question was swapped
    assertEquals(out.text.split(line).length - 1, 1, `${name}: text once`);
    assertEquals(out.html.split(line).length - 1, 1, `${name}: html once`);
    for (const a of [{ when_choice: 'now' }, { when_choice: 'later' }]) assertStrictEquals(withHikeArrival(email, ev, a, 'reminder'), email);
  }
  const noPrepConf = buildConfirmation(plain, 'A', null);
  const c = withHikeArrival(noPrepConf, plain, { when_choice: 'event' }, 'confirmation');
  assert(c.text.includes(line) && c.html.includes(line));
});

Deno.test('now, later, no answers, a failed read and a non-hike are unchanged (same object)', () => {
  const conf = buildConfirmation(hike, 'A', PREP_URL);
  for (const a of [{ when_choice: 'now' }, { when_choice: 'later' }, { when_choice: null }, {}, null]) {
    assertStrictEquals(withHikeArrival(conf, hike, a), conf);
  }
  const mm = { ...base, series_slug: 'sales-mastermind' };
  const mmConf = buildConfirmation(mm, 'A', null);
  assertStrictEquals(withHikeArrival(mmConf, mm, { when_choice: 'event' }), mmConf);
});

Deno.test('round-4 fold: subject, headline, link label and calendar links for an event hiker', () => {
  const when = { when_choice: 'event' };
  const conf = withHikeArrival(buildConfirmation(hike, 'A', PREP_URL), hike, when, 'confirmation');
  assertEquals(conf.subject, 'Please come at 09:45: Clarity Hike: Trail');
  assert(conf.html.includes('Want to do it at home instead?') && conf.text.includes('Want to do it at home instead?'));
  assertFalse(conf.html.includes('Prepare now') || conf.text.includes('Prepare now'));
  // calendar links start at the arrival (03:00Z - 15 min = 02:45Z); the end stays the event's end (07:00Z)
  assert(conf.html.includes('dates=20261130T024500Z/20261130T070000Z'));
  assert(conf.html.includes('startdt=2026-11-30T02:45:00.000Z') && conf.html.includes('enddt=2026-11-30T07:00:00.000Z'));
  assertFalse(conf.html.includes('dates=20261130T030000Z/'));
  const rem = withHikeArrival(buildReminder(hike, 'A', { prep: 'not_started', prepareUrl: PREP_URL }), hike, when, 'reminder');
  assertEquals(rem.subject, 'Tomorrow: please come at 09:45 · Clarity Hike: Trail');
  assert(rem.html.includes('<title>Tomorrow: please come at 09:45 · Clarity Hike: Trail</title>'));
});

Deno.test('F12: the arrival subject is only for the not-started reminder; the other states keep their own subject', () => {
  const plain = { ...base, series_slug: 'social-hike' };
  for (const [prep, ev] of [['started', hike], ['complete', hike], [null, plain]] as const) {
    const email = prep ? buildReminder(ev, 'A', { prep, prepareUrl: PREP_URL }) : buildReminder(ev, 'A');
    assertEquals(withHikeArrival(email, ev, { when_choice: 'event' }, 'reminder').subject, email.subject, String(prep));
  }
});

Deno.test('F11: the arrival line sits inside the card, before the footer row and before </body>, in every real email', () => {
  const line = hikeArrivalLine('09:45');
  const plain = { ...base, series_slug: 'social-hike' };
  const emails: Array<[string, { subject: string; html: string; text: string }, EventRow, 'confirmation' | 'reminder' | 'update']> = [
    ['update', buildUpdate(hike, 'A'), hike, 'update'],
    ['reminder not_started', buildReminder(hike, 'A', { prep: 'not_started', prepareUrl: PREP_URL }), hike, 'reminder'],
    ['reminder started', buildReminder(hike, 'A', { prep: 'started', prepareUrl: PREP_URL }), hike, 'reminder'],
    ['reminder complete', buildReminder(hike, 'A', { prep: 'complete', prepareUrl: PREP_URL }), hike, 'reminder'],
    ['reminder no prep', buildReminder(plain, 'A'), plain, 'reminder'],
    ['confirmation no prep', buildConfirmation(plain, 'A', null), plain, 'confirmation'],
  ];
  for (const [name, email, ev, kind] of emails) {
    const out = withHikeArrival(email, ev, { when_choice: 'event' }, kind);
    const at = out.html.indexOf(line);
    assert(at >= 0, `${name}: html has the line`);
    assert(at < out.html.indexOf('<!-- Footer -->'), `${name}: before the footer`);
    assert(at < out.html.indexOf('</body>'), `${name}: before </body>`);
    assert(out.html.trimEnd().endsWith('</html>'), `${name}: nothing after </html>`);
    assert(out.text.includes(line), `${name}: text has the line`);
  }
});

Deno.test('round-4 fold: an update email after a time change carries the new arrival for an event hiker only', () => {
  const moved = { ...hike, datetime: '2026-11-30T05:30:00+00:00' };
  const upd = buildUpdate(moved, 'A');
  const out = withHikeArrival(upd, moved, { when_choice: 'event' }, 'update');
  assert(out.text.includes('Please come at 12:15 to do the short introduction at the meeting point.'));
  assert(out.html.includes('Please come at 12:15'));
  assertStrictEquals(withHikeArrival(upd, moved, { when_choice: 'now' }, 'update'), upd);
  // without a footer marker the line is appended, never lost
  const bare = { subject: 'Updated: T', html: '<p>x</p>', text: 'x' };
  assert(withHikeArrival(bare, moved, { when_choice: 'event' }, 'update').html.includes('Please come at 12:15'));
});

Deno.test('F14: one batch read of the event answers; a lookup per recipient; a failed batch leaves every email unchanged', async () => {
  let calls = 0;
  const stub = (result: { data?: unknown; error?: { message: string } | null }) => ({
    from: (_t: string) => ({ select: (_c: string) => ({ eq: (_k: string, _v: string) => { calls++; return Promise.resolve({ data: null, error: null, ...result }); } }) }),
  });
  const ok = await loadHikeWhenByProfile(stub({ data: [{ profile_id: 'a', when_choice: 'event' }, { profile_id: 'b', when_choice: 'now' }] }), 'e');
  assertEquals(calls, 1);
  assertEquals(hikeWhenOf(ok, 'a'), { when_choice: 'event' });
  assertEquals(hikeWhenOf(ok, 'b'), { when_choice: 'now' });
  assertEquals(hikeWhenOf(ok, 'nobody'), null);
  assertEquals(hikeWhenOf(ok, null), null);
  const failed = await loadHikeWhenByProfile(stub({ error: { message: 'down' } }), 'e');
  assertEquals(failed, null);
  assertEquals(hikeWhenOf(failed, 'a'), null);
});

Deno.test('F13: a malformed event timezone falls back to UTC and still builds the email', () => {
  assertEquals(hikeArrivalTime('2026-11-30T03:00:00+00:00', 'Not/AZone'), '02:45');
  const bad = { ...hike, timezone: 'Not/AZone' };
  const out = withHikeArrival({ subject: 'S', html: '<table><!-- Footer --></table>', text: 't' }, bad, { when_choice: 'event' }, 'update');
  assert(out.text.includes('Please come at 02:45'));
});
