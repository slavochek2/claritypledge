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
Deno.test('onTimeLine: start sharp, doors 15 min before, in the event time zone', () => {
  assertEquals(
    onTimeLine(night),
    'We start at 18:30 sharp (doors open 18:15). Round 1 pairs whoever is in the room at 18:30; later arrivals join from round 2.',
  );
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

Deno.test('tickets: unguessable, hashed, expire an hour after the event ends', async () => {
  const t = newTicket();
  assert(/^[A-Za-z0-9_-]{43}$/.test(t), t);
  assert(newTicket() !== t);
  assert(/^[0-9a-f]{64}$/.test(await hashTicket(t)));
  assertEquals(ticketExpiry(night).toISOString(), '2026-10-06T14:30:00.000Z');
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

Deno.test('confirmation: Prepare now only when a link is given', () => {
  assertStringIncludes(buildConfirmation(night, 'Anna Lee', 'https://x/l?t=1').html, 'Prepare now');
  assertFalse(buildConfirmation(night, 'Anna Lee').html.includes('Prepare now'));
});
Deno.test('reminder: Preparation off → today\'s reminder, unchanged', () => {
  const hike = { ...night, preparation_enabled: false };
  const r = buildReminder(hike, 'Anna', { prep: 'not_started', prepareUrl: 'https://x' });
  assertEquals(r.subject, 'Tomorrow: Clarity Night');
  assertFalse(r.html.includes('Prepare now'));
  assertFalse(r.html.includes('sharp'));
});
Deno.test('reminder: not started → about preparing, Prepare now', () => {
  const r = buildReminder(night, 'Anna', { prep: 'not_started', prepareUrl: 'https://x/l?t=1' });
  assertStringIncludes(r.subject, 'prepare before tomorrow');
  assertStringIncludes(r.html, 'Prepare now');
  assertStringIncludes(r.html, '18:30 sharp');
});
Deno.test('reminder: started → Finish preparing', () => {
  const r = buildReminder(night, 'Anna', { prep: 'started', prepareUrl: 'https://x/l?t=1' });
  assertStringIncludes(r.html, 'Finish preparing');
  assertFalse(r.html.includes('>Prepare now<'));
});
Deno.test('reminder: prepared → today\'s copy plus You\'re prepared ✓, no button', () => {
  const r = buildReminder(night, 'Anna', { prep: 'complete' });
  assertEquals(r.subject, 'Tomorrow: Clarity Night');
  assertStringIncludes(r.html, "You're prepared ✓");
  assertFalse(r.html.includes('Finish preparing'));
});
Deno.test('starting soon: why first, venue question, two buttons', () => {
  const m = buildStartingSoon(night, 'Anna', { arrivedUrl: 'https://x/a', notYetUrl: 'https://x/n', roomUrl: null });
  const why = m.html.indexOf('We use our app to guide you');
  const ask = m.html.indexOf('Have you arrived at Zuzalu library?');
  assert(why > 0 && ask > why, 'why comes before the question');
  assertStringIncludes(m.html, "I'm here");
  assertStringIncludes(m.html, 'Not yet');
  assertStringIncludes(m.html, 'href="https://x/a"');
  assertStringIncludes(m.html, 'href="https://x/n"');
});
Deno.test('starting soon: no place name → Have you arrived? + address', () => {
  const m = buildStartingSoon({ ...night, location: '12 Nimman Road, Chiang Mai' }, 'Anna', { arrivedUrl: 'a', notYetUrl: 'n', roomUrl: null });
  assertStringIncludes(m.html, 'Have you arrived?</p>');
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
