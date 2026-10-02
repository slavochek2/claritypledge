// Deno test: run with `deno test --allow-env supabase/functions/_shared/p1380-event-emails.test.ts`
// P1380: which events get which email, when, and what each button is.
import { assert, assertEquals, assertFalse, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildConfirmation, buildReminder, buildStartingSoon, type EventRow } from './email-helpers.ts';
import { hashTicket, isOnlineLocation, newTicket, onTimeLine, purposePath, ticketExpiry, venueName } from './event-links.ts';
import { startingSoonClaimable, startingSoonDeliverAt, startingSoonEligible } from './starting-soon.ts';

const NOW = new Date('2026-10-06T11:00:00Z');
const at = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();

const night: EventRow & { status: string } = {
  id: 'e1',
  title: 'Clarity Night',
  datetime: '2026-10-06T11:30:00Z', // 18:30 Bangkok
  duration_minutes: 120,
  timezone: 'Asia/Bangkok',
  location: 'Zuzalu library, 4Seas Nimman, Chiang Mai',
  description: null,
  slug: 'clarity-night',
  host_id: 'h',
  preparation_enabled: true,
  status: 'upcoming',
};

// ── venue / online ───────────────────────────────────────────────────────────

Deno.test('venueName: first part before the comma', () => {
  assertEquals(venueName('Zuzalu library, 4Seas Nimman, Chiang Mai'), 'Zuzalu library');
});
Deno.test('venueName: no comma, street number, online → null', () => {
  assertEquals(venueName('Zuzalu library'), null);
  assertEquals(venueName('12 Nimman Road, Chiang Mai'), null);
  assertEquals(venueName('https://meet.google.com/abc-defg-hij'), null);
  assertEquals(venueName(null), null);
});
Deno.test('isOnlineLocation: only http(s) URLs', () => {
  assert(isOnlineLocation('https://zoom.us/j/1'));
  assertFalse(isOnlineLocation('Zuzalu library, Chiang Mai'));
  assertFalse(isOnlineLocation('javascript:alert(1)'));
});
Deno.test('onTimeLine: one short line, 24-hour, in the event time zone', () => {
  assertEquals(onTimeLine(night), 'We start at 18:30 sharp.');
});

// ── when the starting-soon email goes ────────────────────────────────────────

Deno.test('eligible: Preparation on, not cancelled, start within 45 min and in the future', () => {
  assert(startingSoonEligible({ ...night, datetime: at(30) }, NOW));
  assert(startingSoonEligible({ ...night, datetime: at(45) }, NOW));
  assert(startingSoonEligible({ ...night, datetime: at(5) }, NOW)); // late RSVP before start
  assertFalse(startingSoonEligible({ ...night, datetime: at(46) }, NOW));
  assertFalse(startingSoonEligible({ ...night, datetime: at(0) }, NOW)); // started
  assertFalse(startingSoonEligible({ ...night, datetime: at(30), status: 'cancelled' }, NOW));
  assertFalse(startingSoonEligible({ ...night, datetime: at(30), preparation_enabled: false }, NOW)); // a hike
});
Deno.test('deliverAt: start − 15 min, or now when that has passed', () => {
  assertEquals(startingSoonDeliverAt(at(30), NOW)?.toISOString(), at(15));
  assertEquals(startingSoonDeliverAt(at(15), NOW), undefined);
  assertEquals(startingSoonDeliverAt(at(5), NOW), undefined);
});
Deno.test('claimable: unclaimed or stuck PENDING only', () => {
  assert(startingSoonClaimable(null, null, NOW));
  assert(startingSoonClaimable({ reminder: 'x' }, null, NOW));
  assertFalse(startingSoonClaimable({ starting_soon: '<id@mg>' }, null, NOW));
  assertFalse(startingSoonClaimable({ starting_soon: 'SENT_NO_ID' }, null, NOW));
  assertFalse(startingSoonClaimable({ starting_soon: 'PENDING' }, at(-5), NOW));
  assert(startingSoonClaimable({ starting_soon: 'PENDING' }, at(-11), NOW));
});

// ── tickets ──────────────────────────────────────────────────────────────────

Deno.test('tickets: unguessable, hashed, expire two hours after the event ends', async () => {
  const t = newTicket();
  assert(/^[A-Za-z0-9_-]{43}$/.test(t), t);
  assert(newTicket() !== t);
  assert(/^[0-9a-f]{64}$/.test(await hashTicket(t)));
  assertEquals(ticketExpiry(night).toISOString(), '2026-10-06T15:30:00.000Z');
});
Deno.test('purposePath: destination fixed by purpose', () => {
  assertEquals(purposePath('prepare', 's'), '/events/s/prepare');
  assertEquals(purposePath('room', 's'), '/events/s/room');
  assertEquals(purposePath('arrived', 's'), '/events/s/room?arrived=1');
  assertEquals(purposePath('not_yet', 's'), '/events/s/arriving');
  // A slug cannot reshape the path (security review 2026-10-01).
  assertEquals(purposePath('room', 'a?b#c/../d'), '/events/a%3Fb%23c%2F..%2Fd/room');
});

// ── email content ────────────────────────────────────────────────────────────

Deno.test('confirmation: the question is the subject and the headline; registered is small; one box', () => {
  const m = buildConfirmation(night, 'Anna Lee', 'https://x/l?t=1');
  assertEquals(m.subject, '10 minutes to prepare for Clarity Night?');
  assertStringIncludes(m.html, "✓ You're registered for Clarity Night");
  assertStringIncludes(m.html, 'Do you have 10 minutes to prepare for the event?');
  assert(m.html.indexOf('Our events are different') < m.html.indexOf('Prepare now'));
  assertStringIncludes(m.html, 'We start at 18:30 sharp.');
  assertStringIncludes(m.html, 'display:none'); // preheader
  assertFalse(m.html.includes('GMT')); // local event: no time-zone label
  assertFalse(buildConfirmation(night, 'Anna Lee').html.includes('Prepare now'));
  assertFalse(buildConfirmation({ ...night, preparation_enabled: false }, 'Anna').html.includes('sharp'));
});
Deno.test('reminder: Preparation off → today\'s reminder, unchanged', () => {
  const hike = { ...night, preparation_enabled: false };
  const r = buildReminder(hike, 'Anna', { prep: 'not_started', prepareUrl: 'https://x' });
  assertEquals(r.subject, 'Tomorrow: Clarity Night');
  assertFalse(r.html.includes('Prepare now'));
  assertFalse(r.html.includes('sharp'));
});
Deno.test('reminder: not started → the same question, Prepare now', () => {
  const r = buildReminder(night, 'Anna', { prep: 'not_started', prepareUrl: 'https://x/l?t=1' });
  assertEquals(r.subject, 'Tomorrow 18:30 · 10 minutes to prepare?');
  assertStringIncludes(r.html, 'Do you have 10 minutes to prepare for the event?');
  assertStringIncludes(r.html, 'Prepare now');
  assertStringIncludes(r.html, 'We start at 18:30 sharp.');
});
Deno.test('reminder: started → Finish your preparation / Continue your preparation', () => {
  const r = buildReminder(night, 'Anna', { prep: 'started', prepareUrl: 'https://x/l?t=1' });
  assertEquals(r.subject, 'Tomorrow 18:30 · finish your preparation');
  assertStringIncludes(r.html, 'Continue your preparation');
  assertFalse(r.html.includes('>Prepare now<'));
});
Deno.test('reminder: prepared → no button, primes the I\'m here email', () => {
  const r = buildReminder(night, 'Anna', { prep: 'complete' });
  assertEquals(r.subject, 'See you tomorrow 18:30 · Zuzalu library');
  assertStringIncludes(r.html, "You're prepared for Clarity Night");
  assertStringIncludes(r.html, 'tap &quot;I\'m here&quot; when you walk in');
  assertFalse(r.html.includes('keep it to yourself')); // no buttons → no button note
});
Deno.test('starting soon: glanceable — question, one big I\'m here, Not yet as a link, directions', () => {
  const m = buildStartingSoon(night, 'Anna', { arrivedUrl: 'https://x/a', notYetUrl: 'https://x/n', roomUrl: null });
  assertEquals(m.subject, 'At Zuzalu library? Tap "I\'m here"');
  const ask = m.html.indexOf('Have you arrived at Zuzalu library?');
  const here = m.html.indexOf('href="https://x/a"');
  const notYet = m.html.indexOf('href="https://x/n"');
  assert(ask > 0 && here > ask && notYet > here, 'question, then I\'m here, then Not yet');
  assertStringIncludes(m.html, 'Directions');
  assertFalse(m.html.includes('Add to calendar'));
  assertFalse(m.html.includes('sharp'));
});
Deno.test('starting soon: no place name → Have you arrived? + address', () => {
  const m = buildStartingSoon({ ...night, location: '12 Nimman Road, Chiang Mai' }, 'Anna', { arrivedUrl: 'a', notYetUrl: 'n', roomUrl: null });
  assertEquals(m.subject, 'Arrived? Tap "I\'m here"');
  assertStringIncludes(m.html, 'Have you arrived?</h1>');
  assertStringIncludes(m.html, '12 Nimman Road');
});
Deno.test('starting soon: online → Join now, no arrival question', () => {
  const m = buildStartingSoon({ ...night, location: 'https://meet.google.com/x' }, 'Anna', { arrivedUrl: null, notYetUrl: null, roomUrl: 'https://x/r' });
  assertStringIncludes(m.html, 'Join now');
  assertFalse(m.html.includes('Have you arrived'));
});
Deno.test('starting soon: HTML in the title is escaped', () => {
  const m = buildStartingSoon({ ...night, title: '<script>x</script>' }, null, { arrivedUrl: 'a', notYetUrl: 'n', roomUrl: null });
  assertFalse(m.html.includes('<script>x'));
});
