/**
 * P1337 item 4 (founder, 2026-10-05): the event room asks the preparation's question, in the
 * host's voice, with the "host · Your event host" line — the same pieces, imported, never a copy.
 */
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOST_VOICED_UNDERSTANDING_QUESTION } from '@/app/prototypes/events/components/host-asks';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

it('the question is the host-voiced one', () => {
  expect(HOST_VOICED_UNDERSTANDING_QUESTION).toBe('How much do you think you understand my intended meaning behind this principle?');
});

it.each(['app/prototypes/events/components/EventRoomMeet.tsx', 'app/prototypes/events/prep/EventPrepPage.tsx'])(
  '%s uses the shared question and host line, with no literal copy',
  (file) => {
    const s = src(file);
    expect(s).toMatch(/HOST_VOICED_UNDERSTANDING_QUESTION/);
    expect(s).toMatch(/<HostAsksLine\b/);
    expect(s).not.toContain('my intended meaning');
  },
);

it('P1337 item 5: practice rooms are hidden behind one switch, the code kept', async () => {
  const { SHOW_PRACTICE_ROOMS } = await import('@/app/prototypes/events/components/practice-rooms-switch');
  expect(SHOW_PRACTICE_ROOMS).toBe(false);
  expect(src('app/prototypes/events/components/EventRoomMeet.tsx')).toMatch(/SHOW_PRACTICE_ROOMS && event && !isFrozen && \(\s*<PracticeRooms/);
});
