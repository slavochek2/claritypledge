/**
 * @file p1114-room-composition.test.tsx
 * @description P1114 revision 2 — the composition contract, as source-structure assertions.
 *
 * WHY THIS FILE EXISTS: two builds of this feature were rejected on sight by the founder.
 * Neither failed a test, because nothing tested *composition* — which controls a page uses,
 * in what order, and which chrome it drops. Every assertion below encodes a specific thing
 * one of those builds got wrong. Read the failure messages; they name the rejection.
 *
 * Source-structure rather than DOM-render on purpose: these pages sit behind auth, a router
 * and a live Supabase client, and the two prior rejections were about *arrangement*, which
 * survives a source read intact. The behavioural half lives in `e2e/p1114-gate.spec.ts`.
 */
/**
 * RED-FIRST, via this repo's `it.fails` convention (P835/P895). Every assertion below is
 * written before the build and currently fails, so `it.fails` keeps `npm test` green until
 * the build lands — and flips the test RED the moment the behaviour becomes correct, forcing
 * whoever fixes it to delete the `.fails` and lock the assertion in.
 *
 * That convention opens a hole: while `.fails` is present, `npx vitest run <this file>` exits
 * 0 over assertions that are not actually satisfied. The Verification Contract closes it with
 * its own row — no `.fails` marker may survive in any p1114 test file — so the gate cannot go
 * green on a suite that is passing only because it expects to fail.
 *
 * The tests NOT marked `.fails` are the ones already true and required to stay true.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const R = (p: string) => join(process.cwd(), p);

const GATE = R('src/app/prototypes/events/components/EventRoomGate.tsx');
const ROOM_READY = R('src/app/prototypes/events/components/EventRoomReady.tsx');
const ROOM_MEET = R('src/app/prototypes/events/components/EventRoomMeet.tsx');
const EVENT_DETAIL = R('src/app/prototypes/events/components/EventDetail.tsx');
const APP = R('src/App.tsx');

function read(path: string): string {
  expect(existsSync(path), `${path} does not exist. Revision 2 splits the single merged room page into three: EventRoomGate (the registration gate), EventRoomReady (readiness), EventRoomMeet (the principle, roster and decision).`).toBe(true);
  return readFileSync(path, 'utf-8');
}

describe('P1114 rev2: the gate', () => {
  it.fails('renders the four approved gate strings verbatim', () => {
    const s = read(GATE);
    for (const copy of [
      'This is for people coming to the event',
      'Register for the event to see the Clarity Meeting Principle and who has opted in.',
      'Register for this event',
      'Sign in',
    ]) {
      expect(s.includes(copy), `EventRoomGate.tsx is missing the approved string: "${copy}". These were decided by the founder during /goalify and must appear verbatim — never paraphrased, never invented.`).toBe(true);
    }
  });

  it.fails('leaks nothing about the room to someone who cannot enter', () => {
    const s = read(GATE);
    for (const leak of ['SliderTrack', 'CertificateFrame', 'PersonRow', 'Who opted in', 'sectionsForLevel']) {
      expect(s.includes(leak), `EventRoomGate.tsx references "${leak}". The gate must show the four approved strings and nothing else — no roster, no readiness, no principle text, no count. "Learns nothing else about the room" is an acceptance criterion.`).toBe(false);
    }
  });

  it.fails('sends registration to the existing event page, and mints no second RSVP path', () => {
    const s = read(GATE);
    expect(/\/events\/\$\{[^}]*slug[^}]*\}(?!\/)/.test(s) || /to=\{`\/events\/\$\{/.test(s), 'EventRoomGate.tsx does not navigate to /events/:slug. "Register for this event" must go to the existing event page and reuse the RSVP button already there.').toBe(true);
    expect(/event_rsvps|createRsvp|rsvpToEvent/.test(s), 'EventRoomGate.tsx writes RSVPs itself. The founder chose the event page for this deliberately: a second RSVP-creating path has to stay in step with the first one forever.').toBe(false);
  });
});

describe('P1114 rev2: the readiness page mirrors the shipped /ready', () => {
  it.fails('uses the shared SliderTrack, not a bespoke control', () => {
    const s = read(ROOM_READY);
    expect(/import\s*\{[^}]*\bSliderTrack\b[^}]*\}\s*from\s*['"]@\/app\/components\/partners\/slider-track['"]/.test(s), 'EventRoomReady.tsx does not import SliderTrack. A rejected build reinvented this as eleven bare 0-10 buttons.').toBe(true);
    expect(/Array\.from\(\s*\{\s*length:\s*11\s*\}/.test(s), 'EventRoomReady.tsx contains Array.from({length: 11}) — the exact shape of the rejected 0-10 button ladder.').toBe(false);
  });

  it.fails('carries no caption under the slider', () => {
    const s = read(ROOM_READY);
    expect(/Shown on the wall|Not labelled|not anonymous either/.test(s), 'EventRoomReady.tsx still renders the readiness caption. The founder annotated it "delete" on 2026-08-20; the UI Contract row is retired.').toBe(false);
  });
});

describe('P1114 rev2: the principle page mirrors the shipped /meet', () => {
  it.fails('uses the shipped certificate shell and fixed bottom bar', () => {
    const s = read(ROOM_MEET);
    expect(/from\s*['"]@\/app\/components\/agreements\/certificate-frame['"]/.test(s), 'EventRoomMeet.tsx does not import the shared CertificateFrame. The principle must render as the same document the standalone /meet shows, never a re-authored copy.').toBe(true);
    expect(/FixedBottomBar/.test(s), 'EventRoomMeet.tsx does not use FixedBottomBar. The Opt in / Opt out decision lives in the pinned bar, exactly as it does on the shipped /meet.').toBe(true);
    expect(/PersonRow/.test(s), 'EventRoomMeet.tsx does not import PersonRow. Signed-in attendees render as the normal person row — full name, profile link, avatar, pledge ring, ear badge.').toBe(true);
  });

  it.fails('places the roster ABOVE the decision bar', () => {
    const s = read(ROOM_MEET);
    const roster = s.indexOf('Who opted in');
    const bar = s.indexOf('FixedBottomBar');
    expect(roster, 'EventRoomMeet.tsx has no "Who opted in" roster heading.').toBeGreaterThan(-1);
    expect(roster < bar, 'The roster renders after the decision bar in EventRoomMeet.tsx. Seeing who has already opted in is the strongest thing that can sit in front of the next person; placing it after the decision wastes it.').toBe(true);
  });

  it.fails('carries no loose duplicate of the decision buttons', () => {
    const s = read(ROOM_MEET);
    const optIns = (s.match(/>\s*Opt in\s*</g) ?? []).length;
    expect(optIns, `EventRoomMeet.tsx renders "Opt in" ${optIns} times. It belongs once, in the fixed bar. A rejected build rendered a loose copy at the end of the scroll, duplicating a control the shipped page already carries.`).toBeLessThanOrEqual(1);
  });

  it.fails('has no understanding-number step and no Start meeting button', () => {
    const s = read(ROOM_MEET);
    expect(/ComprehensionRatingCard|Start meeting/.test(s), 'EventRoomMeet.tsx carries the understanding number or "Start meeting". Both exist for one situation — two people, one phone, a host standing there to ask the follow-up out loud. In a room of forty nobody asks, and there is no phone to hand back. This is the one deliberate divergence from /meet (spec revision 2).').toBe(false);
  });
});

describe('P1114 rev2: the guest door is gone from the room, and only from the room', () => {
  it.fails('no room page imports the guest join form', () => {
    for (const p of [GATE, ROOM_READY, ROOM_MEET]) {
      expect(/GuestOrAccountJoin/.test(read(p)), `${p} still imports GuestOrAccountJoin. Entry is gated by event registration + sign-in; there is no guest door in the room any more.`).toBe(false);
    }
  });

  it('but /live still imports it — the extraction survives', () => {
    const s = readFileSync(R('src/app/pages/clarity-live-page.tsx'), 'utf-8');
    expect(/import\s*\{[^}]*\bGuestOrAccountJoin\b[^}]*\}\s*from\s*['"]@\/app\/components\/auth\/guest-or-account-join['"]/.test(s), 'clarity-live-page.tsx no longer imports GuestOrAccountJoin. That component is /live\'s production join form; P1114 only extracted it. Removing the room\'s guest door must not touch /live.').toBe(true);
  });
});

describe('P1114 rev2: chrome and routing', () => {
  it.fails('all three room routes mount under the compact layout', () => {
    const s = read(APP);
    for (const route of ['/events/:slug/room', '/events/:slug/ready', '/events/:slug/meet']) {
      const i = s.indexOf(route);
      expect(i, `src/App.tsx has no explicit route for ${route}. The room routes must be hoisted out of the /events/* wildcard, which wraps them in the full ClarityLandingLayout — that is where the marketing nav and the footer come from.`).toBeGreaterThan(-1);
      const window_ = s.slice(i, i + 400);
      expect(/ClarityLandingLayout\s+compact/.test(window_), `${route} does not mount under <ClarityLandingLayout compact>. The founder annotated "hide footer" and "delete" on the projected-chrome control; compact resolves both, and it is what the shipped /ready and /meet already use.`).toBe(true);
    }
  });

  it.fails('the event page tab bar sits above the event card', () => {
    const s = read(EVENT_DETAIL);
    const tabs = s.indexOf('<Tabs');
    const title = s.indexOf('{event.title}</h1>');
    expect(tabs, 'EventDetail.tsx has no <Tabs>.').toBeGreaterThan(-1);
    expect(title, 'EventDetail.tsx no longer renders the event title heading.').toBeGreaterThan(-1);
    expect(tabs < title, 'The tab bar renders after the event card in EventDetail.tsx. The founder annotated "the menu should be here!" pointing above the card — tabs switch the whole page body, not a strip beneath it.').toBe(true);
  });

  it.fails('Practice Rooms is not inside a tab', () => {
    const s = read(EVENT_DETAIL);
    const pr = s.lastIndexOf('<PracticeRooms');
    const tabContentOpen = s.indexOf('<TabsContent');
    expect(pr, 'EventDetail.tsx no longer renders PracticeRooms.').toBeGreaterThan(-1);
    const insideATab = tabContentOpen > -1 && pr > tabContentOpen;
    expect(insideATab, 'PracticeRooms renders inside a TabsContent. The founder annotated "leave it where it was!" — it belongs in the left column after the description, exactly where it sits on main. Moving it was uninstructed scope creep.').toBe(false);
  });
});
