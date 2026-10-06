/**
 * @file p1307-ready-screen.test.tsx
 * @description P1307 Part 5 / D1 / D2 / D10 / D12 — the event ready screen's transcription
 * switch, and D10's gate-routing change.
 *
 * Source-structure assertions, not DOM renders — the SAME convention
 * `src/tests/p1114-room-composition.test.tsx` already uses for these exact two files
 * (EventRoomGate.tsx, EventRoomReady.tsx), and for the same reason stated there: these
 * pages sit behind auth, a router and a live Supabase client, and prior rejections here
 * were about copy/arrangement, which a source read catches without mounting any of that.
 *
 * The founder-approved, dev-only prototype
 * (`src/app/prototypes/event-transcription/ReadyScreen.tsx`, "Founder approved the
 * prototype 2026-09-11") already implements the switch with this exact markup —
 * `role="switch"`, `aria-checked`, the two-line label/sub-line, the `aria-live="polite"`
 * announcement, and the consent line. These assertions pin that the REAL EventRoomReady.tsx
 * carries the same contract, not a re-invented one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const R = (p: string) => join(process.cwd(), p);
const GATE = R('src/app/prototypes/events/components/EventRoomGate.tsx');
const ROOM_READY = R('src/app/prototypes/events/components/EventRoomReady.tsx');

function read(path: string): string {
  expect(existsSync(path), `${path} does not exist.`).toBe(true);
  return readFileSync(path, 'utf-8');
}

const IDLE_BAR = R('src/app/components/session/room-capture-bar.tsx');

/**
 * P1337 founder walkthrough 7 (2026-10-05) moved the consent tap off this screen: transcription
 * starts in one place only, the room's top bar ("Transcribe"). D12 still holds there — nothing is
 * pre-selected, and the tap itself is the consent — and the approved strings moved with it.
 */
describe('P1307 D2/D12 after P1337 walkthrough 7: consent is the room bar\'s "Transcribe" tap', () => {
  it('the event ready screen has no switch and never starts capture', () => {
    const s = read(ROOM_READY);
    expect(/role=(["'])switch\1/.test(s), 'the switch left /ready (walkthrough 7)').toBe(false);
    expect(s.includes('startCapture'), 'Continue must never start capture: the tap on the bar is the consent').toBe(false);
  });

  it('the bar carries the approved strings: "Not transcribing" (walkthrough 9), what the tap does, and the terms reminder', () => {
    const s = read(IDLE_BAR);
    for (const copy of [
      'Not transcribing',
      'Record audio and share transcript with others in the room',
      // Founder, 2026-09-14: a reminder, not an agreement.
      'Transcription follows our Terms and Privacy Policy',
    ]) {
      expect(s.includes(copy), `room-capture-bar.tsx is missing the approved string: "${copy}"`).toBe(true);
    }
    expect(s.includes('By continuing, you agree to our'), 'the old agreement wording must be gone').toBe(false);
  });

  it('D12: the idle bar starts capture only from the tap (onClick), never on render or in an effect', () => {
    const s = read(IDLE_BAR);
    const bar = s.slice(s.indexOf('export function RoomTranscribeIdleBar'));
    const calls = bar.match(/startCapture\(/g) ?? [];
    expect(calls.length, 'exactly one startCapture call in the idle bar').toBe(1);
    expect(/onClick:\s*\(\)\s*=>\s*\{[\s\S]{0,200}startCapture\(/.test(bar), 'the one call sits inside the button\'s onClick').toBe(true);
    expect(/useEffect\([\s\S]{0,300}startCapture/.test(bar), 'no effect starts capture').toBe(false);
  });
});

describe('P1307 D10: the event gate routes to /ready whenever not already being transcribed', () => {
  it('EventRoomGate.tsx no longer routes on readinessValue alone', () => {
    const s = read(GATE);
    // Pre-P1307: `const destination = self?.readinessValue != null ? 'meet' : 'ready';`
    // (confirmed this session, EventRoomGate.tsx:76). D10 requires the destination to also
    // depend on whether this person is already being transcribed for this event — a
    // readinessValue-only ternary can no longer be the whole decision.
    expect(
      /const destination\s*=\s*self\?\.readinessValue\s*!=\s*null\s*\?\s*['"]meet['"]\s*:\s*['"]ready['"]\s*;/.test(s),
      'EventRoomGate.tsx still routes purely on self?.readinessValue — D10 requires it to ' +
      'also check whether this person is already being transcribed for this event.',
    ).toBe(false);
  });

  it('references a transcription-status signal somewhere in the gate\'s routing decision', () => {
    // Assumption, stated because the exact hook/field name is an /architect decision not
    // pinned by the spec: some identifier containing "transcri" (Transcribing / transcribed
    // / TranscriptionStatus / isBeingTranscribed) must appear near the destination
    // computation. This is intentionally loose — it checks a CONCEPT is wired in, not a
    // specific name, so it does not lock /dev into one API shape.
    const s = read(GATE);
    expect(
      /destination[\s\S]{0,400}/i.test(s) && /transcrib/i.test(s),
      'EventRoomGate.tsx has no reference to transcription status anywhere in the file — ' +
      'D10\'s routing rule cannot be implemented without reading SOME transcription signal.',
    ).toBe(true);
  });
});
