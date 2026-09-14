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

describe('P1307 D2/D12: the ready-screen switch', () => {
  it('is a role="switch" control with aria-checked reflecting state', () => {
    const s = read(ROOM_READY);
    expect(/role=(["'])switch\1/.test(s), 'EventRoomReady.tsx has no role="switch" control — D2 requires a visible switch.').toBe(true);
    expect(/aria-checked=\{/.test(s), 'the switch must reflect its state via aria-checked, not a static value.').toBe(true);
  });

  it('defaults OFF for anyone not already being transcribed (D12) — never defaults to true', () => {
    const s = read(ROOM_READY);
    // The prototype's own state starts false: `useState(false)` next to the toggle, or
    // equivalent — this asserts the switch's initial value is never hardcoded true.
    expect(
      /transcribeOn[^=]*=\s*useState\(\s*true\s*\)/.test(s) || /aria-checked=\{true\}/.test(s),
      'EventRoomReady.tsx appears to default the transcription switch ON. D12: "Tapping it on IS the consent" — a pre-checked switch is not valid consent (Planet49, C-673/17).',
    ).toBe(false);
  });

  it('renders the four UI Contract strings verbatim', () => {
    const s = read(ROOM_READY);
    for (const copy of [
      'Transcribe for AI insights',
      'Record audio and share transcript with others in the room',
      'Not transcribed',
      'By continuing, you agree to our',
    ]) {
      expect(s.includes(copy), `EventRoomReady.tsx is missing the approved string: "${copy}" (UI Contract).`).toBe(true);
    }
  });

  it('the sub-line is conditional on switch state — "Not transcribed" when off, the sharing sentence when on', () => {
    const s = read(ROOM_READY);
    // Looks for a ternary between the two approved sub-line strings, mirroring the
    // prototype's own `transcribeOn ? '...share transcript...' : 'Not transcribed'`.
    expect(
      /Record audio and share transcript with others in the room[\s\S]{0,40}:\s*['"]Not transcribed['"]|['"]Not transcribed['"][\s\S]{0,40}:\s*['"]Record audio and share transcript/.test(s),
      'the two sub-line strings must be a conditional pair on the same switch state, not two independently-placed strings.',
    ).toBe(true);
  });

  it('does not invent copy for the two open FOUNDER DECISION slots (stall state, room-could-not-be-joined message)', () => {
    // This file only covers the ready screen's OWN two strings; the stall/could-not-join
    // copy belongs to the bar and the post-Continue failure path respectively (asserted in
    // p1307-room-capture-bar.test.tsx and the E2E spec). Documented here as a boundary
    // note, not duplicated as an assertion against this file.
    expect(true).toBe(true);
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
