/**
 * P1604: a Clarified session thread reaches the mirror agent with its root as a readable title, never as the stored
 * "session|<ISO>|<part>" marker, and never "from Deleted user" (the root is a system post).
 */
import { describe, it, expect } from 'vitest';
import { clarifyCopy, readableSessionBody } from '../../supabase/functions/_shared/mirror-context-fields';

describe('readableSessionBody', () => {
  it('turns the stored marker into a title (UTC: the server cannot know the reader\'s zone)', () => {
    expect(readableSessionBody('session|2026-11-04T10:05:00Z|1')).toBe('Transcript 4 Nov 2026, 10:05 UTC');
    expect(readableSessionBody('session|2026-11-04T10:05:00Z|2')).toBe('Transcript 4 Nov 2026, 10:05 UTC, Part 2');
    expect(readableSessionBody('session|2026-11-04T10:05:00Z|1|i')).toBe('Transcript 4 Nov 2026, 10:05 UTC, some audio missing');
  });
  it('leaves every other text alone (control)', () => {
    for (const t of ['Before round 1', 'hello', 'session|not a date|1', 'a session|2026-11-04T10:05:00Z|1', '', null, undefined]) {
      expect(readableSessionBody(t as string | null | undefined)).toBe(t);
    }
  });
});

describe('clarifyCopy for a session thread', () => {
  const clarify = {
    from: 'Deleted user', in: 'Ada', body: 'session|2026-11-04T10:05:00Z|1',
    thread: [{ name: 'Bo', body: 'first words' }, { name: 'Ada', body: 'reply' }], thread_total: 2,
  };
  it('shows the root as its title and names no "Deleted user"', () => {
    const { copy } = clarifyCopy(clarify);
    expect(copy.text).toBe('Transcript 4 Nov 2026, 10:05 UTC');
    expect(copy.from).toBe('the thread title');
    expect(JSON.stringify(copy)).not.toContain('session|');
  });
  it('a root inside the copied thread is titled too, and its lines keep their speakers', () => {
    const { copy } = clarifyCopy({ from: 'Ada', in: 'Ada', body: 'a line', thread: [{ name: 'Deleted user', body: 'session|2026-11-04T10:05:00Z|1' }, { name: 'Bo', body: 'hi' }], thread_total: 2 });
    const thread = copy.thread as Array<{ from: string; text: string }>;
    expect(thread[0]).toEqual({ from: 'the thread title', text: 'Transcript 4 Nov 2026, 10:05 UTC' });
    expect(thread[1]).toEqual({ from: 'Bo', text: 'hi' });
  });
  it('an ordinary Clarify is unchanged (control)', () => {
    const { copy, total, shown } = clarifyCopy({ from: 'Ada', in: 'Bo', body: 'hello', thread: [{ name: 'Bo', body: 'hi' }], thread_total: 5 });
    expect(copy).toEqual({ from: 'Ada', in: 'Bo', text: 'hello', thread: [{ from: 'Bo', text: 'hi' }] });
    expect([total, shown]).toEqual([5, 1]);
  });
});
