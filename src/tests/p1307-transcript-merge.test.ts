/**
 * @file p1307-transcript-merge.test.ts
 * @description P1307 Part 7 (D4) — render-time transcript readability: consecutive
 * same-speaker rows merge into one continuous block; a "…" indicator shows who is
 * currently speaking; the indicator is transient client/realtime state, never a row
 * (Invariant: "Interim text never reaches the database").
 *
 * ASSUMPTION, stated because the module does not exist yet: a pure function
 * `merge(messages)` exists, taking the same `TranscribeMessage[]`
 * shape `transcribe-service.ts` already exports (`{ id, roomId, memberId, text, spokenAt,
 * isFinal }`, confirmed this session) and returning merged display rows. Pure-function
 * tests here rather than a component render, matching how `slice-recorder.test.ts` and
 * `transcribe-slice/dedup.ts`'s own tests separate PURE logic from anything requiring a
 * browser/DOM.
 */
import { describe, it, expect } from 'vitest';
import { mergeConsecutiveSpeakerRows } from '@/app/components/session/transcript-merge';

interface Msg {
  id: string;
  roomId: string;
  memberId: string;
  text: string;
  spokenAt: string;
  isFinal: boolean;
}

interface MergedRow {
  memberId: string;
  text: string;
  spokenAt: string;
}

// Typed wrapper around the untyped (module-not-found) import, so every call site below is
// checked against the shape this test actually expects, rather than propagating `any`.
const merge = mergeConsecutiveSpeakerRows as (messages: Msg[]) => MergedRow[];

function msg(id: string, memberId: string, text: string, spokenAt: string): Msg {
  return { id, roomId: 'r1', memberId, text, spokenAt, isFinal: true };
}

describe('P1307: mergeConsecutiveSpeakerRows', () => {
  it('merges consecutive rows from the SAME speaker into one block', () => {
    const messages = [
      msg('1', 'alice', 'Hello there.', '2026-09-14T10:00:00Z'),
      msg('2', 'alice', 'How are you?', '2026-09-14T10:00:15Z'),
      msg('3', 'alice', 'It has been a while.', '2026-09-14T10:00:30Z'),
    ];
    const rows = merge(messages);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.memberId).toBe('alice');
    expect(rows[0]!.text).toBe('Hello there. How are you? It has been a while.');
  });

  it('keeps alternating speakers as separate rows', () => {
    const messages = [
      msg('1', 'alice', 'Hello.', '2026-09-14T10:00:00Z'),
      msg('2', 'bob', 'Hi Alice.', '2026-09-14T10:00:10Z'),
      msg('3', 'alice', 'How are you?', '2026-09-14T10:00:20Z'),
    ];
    const rows = merge(messages);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.memberId)).toEqual(['alice', 'bob', 'alice']);
  });

  it('a run of the same speaker interrupted by another speaker produces two separate merged blocks, not one', () => {
    const messages = [
      msg('1', 'alice', 'First.', '2026-09-14T10:00:00Z'),
      msg('2', 'alice', 'Second.', '2026-09-14T10:00:10Z'),
      msg('3', 'bob', 'Interruption.', '2026-09-14T10:00:20Z'),
      msg('4', 'alice', 'Third.', '2026-09-14T10:00:30Z'),
      msg('5', 'alice', 'Fourth.', '2026-09-14T10:00:40Z'),
    ];
    const rows = merge(messages);
    expect(rows.map((r) => r.memberId)).toEqual(['alice', 'bob', 'alice']);
    expect(rows[0]!.text).toBe('First. Second.');
    expect(rows[2]!.text).toBe('Third. Fourth.');
  });

  it('preserves spoken order — rows are not re-sorted by speaker', () => {
    const messages = [
      msg('1', 'bob', 'B1', '2026-09-14T10:00:00Z'),
      msg('2', 'alice', 'A1', '2026-09-14T10:00:05Z'),
      msg('3', 'bob', 'B2', '2026-09-14T10:00:10Z'),
    ];
    const rows = merge(messages);
    expect(rows.map((r) => r.memberId)).toEqual(['bob', 'alice', 'bob']);
  });

  it('an empty message list produces no rows', () => {
    expect(merge([])).toEqual([]);
  });

  it('a single message produces exactly one row', () => {
    const rows = merge([msg('1', 'alice', 'Solo.', '2026-09-14T10:00:00Z')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text).toBe('Solo.');
  });

  it('the merged row\'s spokenAt is the FIRST message\'s timestamp — merging must not reorder the transcript in time', () => {
    const messages = [
      msg('1', 'alice', 'First.', '2026-09-14T10:00:00Z'),
      msg('2', 'alice', 'Second.', '2026-09-14T10:05:00Z'),
    ];
    const rows = merge(messages);
    expect(rows[0]!.spokenAt).toBe('2026-09-14T10:00:00Z');
  });
});

describe('P1307: the "…" indicator is never a persisted row', () => {
  it('mergeConsecutiveSpeakerRows takes only persisted TranscribeMessage rows — no "isSpeaking" field exists on the input type', () => {
    // Documents the invariant structurally: the function signature accepts the SAME shape
    // transcribe-service.ts already returns from the DB (no is_final: false rows ever
    // reach the client — "Interim text never reaches the database"). The "…" indicator is
    // therefore necessarily a SEPARATE, ephemeral piece of client/realtime state passed
    // alongside the merged rows, not encoded into one of them. This is a documentation
    // test — it has no meaningful failure mode of its own beyond compiling, which is
    // itself the assertion: adding an isSpeaking field to Msg here would be the same
    // mistake as adding it to the DB row.
    const messages = [msg('1', 'alice', 'Hello.', '2026-09-14T10:00:00Z')];
    const rows = merge(messages);
    expect(Object.keys(rows[0]!)).not.toContain('isSpeaking');
  });
});
