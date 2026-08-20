/**
 * @file p1114-shared-component-reuse.test.tsx
 * @description P1114 — a mechanical guard against re-reinvention.
 *
 * WHY THIS FILE EXISTS: an earlier build of `EventRoomPage.tsx` reinvented UI that
 * already shipped elsewhere — eleven bare 0-10 buttons instead of `/ready`'s
 * `SliderTrack`, and inline guest-join markup instead of `/live`'s guest-join form.
 * The founder saw it and rejected it (see `EventRoomPage.tsx`'s file header, "REUSE,
 * NOT REINVENTION"). This test reads the two files' own source and asserts they keep
 * importing the shared components instead of growing a second copy. It is the thing
 * that is supposed to stop that happening again — read the failure messages, they say
 * so directly.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOM_PAGE = join(process.cwd(), 'src/app/prototypes/events/components/EventRoomPage.tsx');
const LIVE_PAGE = join(process.cwd(), 'src/app/pages/clarity-live-page.tsx');

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('P1114: room reuses shared components instead of reinventing them', () => {
  it('EventRoomPage imports SliderTrack — the shared /ready slider, not a bespoke control', () => {
    const source = read(ROOM_PAGE);
    expect(
      /import\s*\{[^}]*\bSliderTrack\b[^}]*\}\s*from\s*['"]@\/app\/components\/partners\/slider-track['"]/.test(source),
      'EventRoomPage.tsx no longer imports SliderTrack. A previous build reinvented ' +
        'the readiness question as an eleven-button 0-10 grid instead of reusing the ' +
        '/ready slider; the founder rejected that build. Import SliderTrack from ' +
        '@/app/components/partners/slider-track instead of adding a new control.',
    ).toBe(true);
  });

  it('EventRoomPage does NOT hand-roll a 0-10 button ladder', () => {
    const source = read(ROOM_PAGE);
    expect(
      /Array\.from\(\s*\{\s*length:\s*11\s*\}/.test(source),
      'EventRoomPage.tsx contains an Array.from({length: 11}) — the exact shape of ' +
        'the reinvented 0-10 button grid the founder rejected. Readiness must render ' +
        'via SliderTrack, not a hand-rolled button ladder.',
    ).toBe(false);
  });

  it('EventRoomPage imports the shared GuestOrAccountJoin component', () => {
    const source = read(ROOM_PAGE);
    expect(
      /import\s*\{[^}]*\bGuestOrAccountJoin\b[^}]*\}\s*from\s*['"]@\/app\/components\/auth\/guest-or-account-join['"]/.test(
        source,
      ),
      'EventRoomPage.tsx no longer imports GuestOrAccountJoin. A previous build ' +
        'reinvented the guest-join door inline instead of reusing /live\'s shipped ' +
        'form; the founder rejected that build. Import GuestOrAccountJoin from ' +
        '@/app/components/auth/guest-or-account-join instead of rebuilding the join ' +
        'screen inline.',
    ).toBe(true);
  });

  it('clarity-live-page (the source of truth for guest-join copy) also imports GuestOrAccountJoin', () => {
    const source = read(LIVE_PAGE);
    expect(
      /import\s*\{[^}]*\bGuestOrAccountJoin\b[^}]*\}\s*from\s*['"]@\/app\/components\/auth\/guest-or-account-join['"]/.test(
        source,
      ),
      'clarity-live-page.tsx no longer imports GuestOrAccountJoin. The guest-join ' +
        'door was extracted out of this page into a shared component specifically so ' +
        '/live and the event room render the same markup — /live must consume the ' +
        'extraction, not keep its own inline copy alongside it.',
    ).toBe(true);
  });
});
