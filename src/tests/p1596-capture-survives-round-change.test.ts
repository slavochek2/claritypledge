/**
 * P1596: one tap transcribes for the whole event. Capture belongs to the RoomCaptureProvider, not to a page or a
 * round, so a round change must not be able to stop it. Pinned structurally: the provider neither reads round
 * state nor reacts to it, and the only things that end capture are its own explicit paths.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../app/contexts/room-capture-context.tsx'), 'utf8');

describe('capture across rounds', () => {
  it('the capture provider has no dependency on round state', () => {
    expect(src).not.toMatch(/use-event-rounds|useEventRounds|event_rounds|event_round_seats|round_no|roundNo/);
  });
  it('does not end capture on route changes (Open navigates away and recording continues)', () => {
    expect(src).not.toMatch(/useLocation\(\)[\s\S]{0,200}(endMyCapture|stopCapture)/);
    expect(src).toMatch(/openCapturedRoom\(/);
  });
});
