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
 * Was RED-FIRST via this repo's red-first-marker convention (P835/P895) — every
 * assertion below was written before the build and marked to expect failure until the
 * build landed. The build has landed and every marker is gone: these assertions are
 * now real, permanently-passing locks on the composition, not placeholders.
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
  it('renders the four approved gate strings verbatim', () => {
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

  it('leaks nothing about the room to someone who cannot enter', () => {
    const s = read(GATE);
    for (const leak of ['SliderTrack', 'CertificateFrame', 'PersonRow', 'Who opted in', 'sectionsForLevel']) {
      expect(s.includes(leak), `EventRoomGate.tsx references "${leak}". The gate must show the four approved strings and nothing else — no roster, no readiness, no principle text, no count. "Learns nothing else about the room" is an acceptance criterion.`).toBe(false);
    }
  });

  it('sends registration to the existing event page, and mints no second RSVP path', () => {
    const s = read(GATE);
    expect(/\/events\/\$\{[^}]*slug[^}]*\}(?!\/)/.test(s) || /to=\{`\/events\/\$\{/.test(s), 'EventRoomGate.tsx does not navigate to /events/:slug. "Register for this event" must go to the existing event page and reuse the RSVP button already there.').toBe(true);
    expect(/event_rsvps|createRsvp|rsvpToEvent/.test(s), 'EventRoomGate.tsx writes RSVPs itself. The founder chose the event page for this deliberately: a second RSVP-creating path has to stay in step with the first one forever.').toBe(false);
  });
});

describe('P1114 rev2: the readiness page mirrors the shipped /ready', () => {
  it('uses the shared SliderTrack, not a bespoke control', () => {
    const s = read(ROOM_READY);
    expect(/import\s*\{[^}]*\bSliderTrack\b[^}]*\}\s*from\s*['"]@\/app\/components\/partners\/slider-track['"]/.test(s), 'EventRoomReady.tsx does not import SliderTrack. A rejected build reinvented this as eleven bare 0-10 buttons.').toBe(true);
    expect(/Array\.from\(\s*\{\s*length:\s*11\s*\}/.test(s), 'EventRoomReady.tsx contains Array.from({length: 11}) — the exact shape of the rejected 0-10 button ladder.').toBe(false);
  });

  it('carries no caption under the slider', () => {
    const s = read(ROOM_READY);
    expect(/Shown on the wall|Not labelled|not anonymous either/.test(s), 'EventRoomReady.tsx still renders the readiness caption. The founder annotated it "delete" on 2026-08-20; the UI Contract row is retired.').toBe(false);
  });
});

describe('P1114 rev2: the principle page mirrors the shipped /meet', () => {
  it('uses the shipped certificate shell and fixed bottom bar', () => {
    const s = read(ROOM_MEET);
    expect(/from\s*['"]@\/app\/components\/agreements\/certificate-frame['"]/.test(s), 'EventRoomMeet.tsx does not import the shared CertificateFrame. The principle must render as the same document the standalone /meet shows, never a re-authored copy.').toBe(true);
    expect(/FixedBottomBar/.test(s), 'EventRoomMeet.tsx does not use FixedBottomBar. The Opt in / Opt out decision lives in the pinned bar, exactly as it does on the shipped /meet.').toBe(true);
    expect(/PersonRow/.test(s), 'EventRoomMeet.tsx does not import PersonRow. Signed-in attendees render as the normal person row — full name, profile link, avatar, pledge ring, ear badge.').toBe(true);
  });

  it('places the roster ABOVE the decision bar', () => {
    const s = read(ROOM_MEET);
    const roster = s.indexOf('data-testid="room-roster"');
    // <FixedBottomBar (the JSX open tag), not the bare word — the bare word also matches
    // this file's own import statement, which always precedes any JSX in source order and
    // would make this assertion pass for the wrong reason regardless of actual render order
    // (caught 2026-08-21: the previous version of this check, `s.indexOf('FixedBottomBar')`,
    // only ever passed because an unrelated doc-comment happened to mention "Who opted in"
    // even earlier in the file than the import — a coincidence, not a real ordering check).
    const bar = s.indexOf('<FixedBottomBar');
    expect(roster, 'EventRoomMeet.tsx has no room-roster element.').toBeGreaterThan(-1);
    expect(bar, 'EventRoomMeet.tsx does not render <FixedBottomBar as JSX.').toBeGreaterThan(-1);
    expect(roster < bar, 'The roster renders after the decision bar in EventRoomMeet.tsx. Seeing who has already answered is the strongest thing that can sit in front of the next person; placing it after the decision wastes it.').toBe(true);
  });

  it('carries no loose duplicate of the decision buttons', () => {
    const s = read(ROOM_MEET);
    const optIns = (s.match(/>\s*Opt in\s*</g) ?? []).length;
    expect(optIns, `EventRoomMeet.tsx renders "Opt in" ${optIns} times. It belongs once, in the fixed bar. A rejected build rendered a loose copy at the end of the scroll, duplicating a control the shipped page already carries.`).toBeLessThanOrEqual(1);
  });

  it('asks the comprehension rating through the shared card, with the shared question, and has no Start meeting button', () => {
    const s = read(ROOM_MEET);
    // REVISED TWICE, both on 2026-08-21 — read both halves before changing this.
    //
    // (1) The room build originally cut the understanding-number step entirely (spec
    //     revision 2 — two-person phone-handoff reasoning). The founder reinstated it,
    //     required before BOTH opt-in and opt-out.
    // (2) That reinstatement first composed the bare RatingButtons primitive, so one
    //     rating could gate two buttons; this very assertion used to REQUIRE that and
    //     to FORBID the card import. The founder then annotated the result "ugly!" and
    //     annotated the shipped page's card "lets reuse same component, content and
    //     behaviour please for event room!" — so the room now runs /meet's own three
    //     steps and the card is mandatory rather than forbidden. The rating still gates
    //     both answers; it is asked after the answer instead of before it.
    expect(
      /from\s*['"]@\/app\/components\/shared\/comprehension-rating-card['"]/.test(s),
      'EventRoomMeet.tsx does not import ComprehensionRatingCard. The founder asked for the shipped /meet\'s own rating card, content and behaviour — a bespoke rating control in the room is the shape that got annotated "ugly!".',
    ).toBe(true);
    expect(
      /UNDERSTANDING_QUESTION/.test(s),
      'EventRoomMeet.tsx does not use the shared UNDERSTANDING_QUESTION from meeting-terms-page. "Same content" means the same sentence, imported — a second literal is how the two surfaces drift apart.',
    ).toBe(true);
    // Anchored to the CARD's own JSX element, not a bare /disabled={submitting}/ — that
    // bare form matches five places in this file (two comments and three other controls),
    // so deleting the prop from the card would leave the test green while the defect it
    // names is live (adversarial code review, 2026-08-21).
    expect(
      /<ComprehensionRatingCard[\s\S]*?disabled=\{submitting\}[\s\S]*?\/>/.test(s),
      'The ComprehensionRatingCard in EventRoomMeet.tsx is not disabled while submitting. Its own Submit guards only on "no rating picked", and this page awaits a round trip — every call INSERTs a cascade-counted row into event_room_answers, so a double tap writes two history rows into the table the research question reads.',
    ).toBe(true);
    // The synchronous latch is the real guard (the disabled prop only styles, and React
    // state cannot close a same-frame double tap) — proven by e2e, asserted here so it
    // cannot be quietly dropped.
    expect(
      /inFlight\.current/.test(s),
      'EventRoomMeet.tsx no longer holds a synchronous in-flight latch. `submitting` is React state and cannot prevent two taps dispatched in the same frame from both passing the guard — measured: three taps wrote three answer-history rows.',
    ).toBe(true);
    expect(/Start meeting/.test(s), 'EventRoomMeet.tsx carries "Start meeting". That exists for one situation — two people, one phone, a host standing there to ask the follow-up out loud. In a room of forty nobody asks, and there is no phone to hand back. This remains the one deliberate divergence from /meet.').toBe(false);
  });

  it('"change your choice" resets both the answer and the rating, not just one', () => {
    const s = read(ROOM_MEET);
    expect(/resetRoomAnswer/.test(s), 'EventRoomMeet.tsx does not call resetRoomAnswer. "Change your choice" must clear BOTH the opt-in/out answer and the comprehension rating back to undecided (founder: "they go back to Undecided") — overwriting just one with a new answer is a different, rejected shape.').toBe(true);
  });

  it('keeps the roster readable when it is empty, rather than rendering nothing', () => {
    const s = read(ROOM_MEET);
    // Every group hides itself at zero (founder: "hide groups that have 0, no need to
    // count totals"). That makes a top-level fallback load-bearing rather than decorative:
    // getRoomRoster returns [] on ANY failure and the 30s reconciliation poll pushes that
    // [] through unconditionally, so without this the whole section renders as blank space
    // on a transient fetch failure — the "empty wall" the spec's Risks forbid.
    expect(
      /roster\.length === 0/.test(s),
      'EventRoomMeet.tsx has no top-level empty-roster branch. With every group hiding itself when empty, a failed poll would render the roster section as nothing at all.',
    ).toBe(true);
    expect(
      /\(\{members\.length\}\)|\{members\.length\}\)/.test(s),
      'EventRoomMeet.tsx still renders a "(N)" count in a roster group heading. The founder removed the counts ("no need to count totals, not needed").',
    ).toBe(false);
  });
});

describe('P1114 rev2: the guest door is gone from the room, and only from the room', () => {
  it('no room page imports the guest join form', () => {
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
  it('all three room routes mount under the compact layout', () => {
    const s = read(APP);
    for (const route of ['/events/:slug/room', '/events/:slug/ready', '/events/:slug/meet']) {
      const i = s.indexOf(route);
      expect(i, `src/App.tsx has no explicit route for ${route}. The room routes must be hoisted out of the /events/* wildcard, which wraps them in the full ClarityLandingLayout — that is where the marketing nav and the footer come from.`).toBeGreaterThan(-1);
      const window_ = s.slice(i, i + 400);
      expect(/ClarityLandingLayout\s+compact/.test(window_), `${route} does not mount under <ClarityLandingLayout compact>. The founder annotated "hide footer" and "delete" on the projected-chrome control; compact resolves both, and it is what the shipped /ready and /meet already use.`).toBe(true);
    }
  });

  it('the "View Principle" row sits above the event card', () => {
    const s = read(EVENT_DETAIL);
    const row = s.indexOf('View Principle');
    const title = s.indexOf('{event.title}</h1>');
    expect(row, 'EventDetail.tsx no longer renders "View Principle" (was "Clarity Principle" — shortened 2026-08-21).').toBeGreaterThan(-1);
    expect(title, 'EventDetail.tsx no longer renders the event title heading.').toBeGreaterThan(-1);
    expect(row < title, 'The "View Principle" row renders after the event card in EventDetail.tsx. The founder annotated "the menu should be here!" pointing above the card.').toBe(true);
  });

  it('Practice Rooms is not gated by tab state — the "cmp" tab concept no longer exists in this file', () => {
    const s = read(EVENT_DETAIL);
    expect(/\bactiveTab\b/.test(s), 'EventDetail.tsx still references activeTab. The redesign removed the embedded "cmp" tab entirely — "View Principle" is a plain navigation Link to the room now, not a second page state, so no tab-state variable (or Radix <Tabs>) should remain in this file.').toBe(false);
    expect(/<Tabs[\s>]|<TabsList|<TabsTrigger|<TabsContent/.test(s), 'EventDetail.tsx still imports/renders a Radix Tabs component. onValueChange double-fires per click and roving-focus arrow keys would fire it too — wrong tool for a same-row link that performs a real route change.').toBe(false);
    const pr = s.lastIndexOf('<PracticeRooms');
    expect(pr, 'EventDetail.tsx no longer renders PracticeRooms.').toBeGreaterThan(-1);
  });

  it('"View Principle" links to /room, not directly to /meet — /room is what decides readiness-vs-principle', () => {
    const s = read(EVENT_DETAIL);
    expect(
      /to=\{`\/events\/\$\{slug\}\/room`\}/.test(s),
      'EventDetail.tsx does not link "View Principle" to /events/:slug/room. Linking straight to /meet skips the readiness question for a first-time visitor — /room (EventRoomGate) is the route that checks readiness_value and decides whether to send them to /ready or /meet (founder repro, 2026-08-21: a fresh account went straight to the principle page).',
    ).toBe(true);
    expect(
      /to=\{`\/events\/\$\{slug\}\/meet`\}/.test(s),
      'EventDetail.tsx still links "View Principle" directly to /meet.',
    ).toBe(false);
  });
});

describe('P1114 rev2: back navigation out of the room', () => {
  it('EventRoomReady.tsx and EventRoomMeet.tsx use FocusHeader, not a hand-rolled back button', () => {
    for (const p of [ROOM_READY, ROOM_MEET]) {
      const s = read(p);
      expect(
        /from\s*['"]@\/app\/components\/layout\/focus-header['"]/.test(s),
        `${p} does not import FocusHeader. src.md: "Never define inline BackButton components — use FocusHeader." Without a back control, a signed-in attendee on /ready or /meet has no way out except the browser's own back button.`,
      ).toBe(true);
    }
  });
});
