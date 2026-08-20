/**
 * @file p1114-shared-component-reuse.test.tsx
 * @description P1114 — a mechanical guard against re-reinvention.
 *
 * WHY THIS FILE EXISTS: an earlier build of the room reinvented UI that already
 * shipped elsewhere — eleven bare 0-10 buttons instead of `/ready`'s `SliderTrack`,
 * and inline guest-join markup instead of `/live`'s guest-join form. The founder saw
 * it and rejected it. This test reads the room's own source and asserts it keeps
 * importing the shared components instead of growing a second copy.
 *
 * REVISED 2026-08-20 (spec Solution, "REVISED (2)" block): the room split into three
 * files (EventRoomGate / EventRoomReady / EventRoomMeet) and the guest-join door left
 * the room entirely — "GuestOrAccountJoin is NOT deleted... this spec only extracted
 * it... the assertion that the room imports it is retired; the assertion that /live
 * does must stay." This file's targets and assertions are updated to match; the
 * underlying WHY (stop a second copy of a shared control from growing back) is
 * unchanged.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOM_READY = join(process.cwd(), 'src/app/prototypes/events/components/EventRoomReady.tsx');
const ROOM_MEET = join(process.cwd(), 'src/app/prototypes/events/components/EventRoomMeet.tsx');
const ROOM_GATE = join(process.cwd(), 'src/app/prototypes/events/components/EventRoomGate.tsx');
const LIVE_PAGE = join(process.cwd(), 'src/app/pages/clarity-live-page.tsx');

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('P1114 rev2: room reuses shared components instead of reinventing them', () => {
  it('EventRoomReady imports SliderTrack — the shared /ready slider, not a bespoke control', () => {
    const source = read(ROOM_READY);
    expect(
      /import\s*\{[^}]*\bSliderTrack\b[^}]*\}\s*from\s*['"]@\/app\/components\/partners\/slider-track['"]/.test(source),
      'EventRoomReady.tsx no longer imports SliderTrack. A previous build reinvented ' +
        'the readiness question as an eleven-button 0-10 grid instead of reusing the ' +
        '/ready slider; the founder rejected that build.',
    ).toBe(true);
  });

  it('EventRoomReady does NOT hand-roll a 0-10 button ladder', () => {
    const source = read(ROOM_READY);
    expect(
      /Array\.from\(\s*\{\s*length:\s*11\s*\}/.test(source),
      'EventRoomReady.tsx contains an Array.from({length: 11}) — the exact shape of ' +
        'the reinvented 0-10 button grid the founder rejected.',
    ).toBe(false);
  });

  it('EventRoomMeet imports the shared CertificateFrame, FixedBottomBar, and PersonRow — not bespoke copies', () => {
    const source = read(ROOM_MEET);
    expect(
      /from\s*['"]@\/app\/components\/agreements\/certificate-frame['"]/.test(source),
      'EventRoomMeet.tsx no longer imports the shared certificate shell.',
    ).toBe(true);
    expect(/FixedBottomBar/.test(source), 'EventRoomMeet.tsx no longer uses FixedBottomBar.').toBe(true);
    expect(/PersonRow/.test(source), 'EventRoomMeet.tsx no longer imports PersonRow.').toBe(true);
  });

  it('no room file (gate, ready, or meet) imports GuestOrAccountJoin — the guest door left the room in revision 2', () => {
    for (const path of [ROOM_GATE, ROOM_READY, ROOM_MEET]) {
      expect(
        /GuestOrAccountJoin/.test(read(path)),
        `${path} references GuestOrAccountJoin. Revision 2 gates entry by registration ` +
          '+ sign-in and removed the name-only join screen; there is no guest door in ' +
          'the room any more.',
      ).toBe(false);
    }
  });

  it('clarity-live-page (the source of truth for guest-join copy) still imports GuestOrAccountJoin', () => {
    const source = read(LIVE_PAGE);
    expect(
      /import\s*\{[^}]*\bGuestOrAccountJoin\b[^}]*\}\s*from\s*['"]@\/app\/components\/auth\/guest-or-account-join['"]/.test(
        source,
      ),
      'clarity-live-page.tsx no longer imports GuestOrAccountJoin. That component is ' +
        '/live\'s production join form; P1114 only ever extracted it. Removing the ' +
        'room\'s guest door must not touch /live.',
    ).toBe(true);
  });
});
