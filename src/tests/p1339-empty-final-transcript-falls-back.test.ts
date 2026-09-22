/**
 * P1339: an after-event transcript row with zero segments must not hide the live transcript.
 * Every room since P1307 went live got such a row (the batch job read the wrong archive path),
 * and fetchRoomTranscript returned it as the 'final' source, so readers saw nothing.
 */
import { describe, it, expect, vi } from 'vitest';

let savedRow: unknown = null;

function query(table: string) {
  const rows: Record<string, unknown[]> = {
    transcribe_room_members: [{ id: 'm1', display_name: 'Alice' }],
    transcribe_messages: [
      { id: 'x1', room_id: 'r1', member_id: 'm1', text: 'hello there', spoken_at: '2026-09-18T18:00:00Z', is_final: true },
    ],
  };
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve({ data: rows[table] ?? [], error: null }),
    maybeSingle: () => Promise.resolve({ data: savedRow, error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: rows[table] ?? [], error: null }),
  };
  return chain;
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => query(t) } }));

describe('P1339 — fetchRoomTranscript', () => {
  it('falls back to the live transcript when the saved after-event transcript is empty', async () => {
    savedRow = { segments: [], speaker_map: {}, incomplete_member_ids: ['m1'] };
    const { fetchRoomTranscript } = await import('@/app/data/api');
    const result = await fetchRoomTranscript('r1');
    expect(result?.source).not.toBe('final');
    expect(result?.segments.map((s) => s.text)).toContain('hello there');
  });

  it('still prefers a non-empty after-event transcript', async () => {
    savedRow = { segments: [{ member_id: 'm1', start_ms: 5, text: 'cleaner text' }], speaker_map: { m1: 'Alice' }, incomplete_member_ids: [] };
    const { fetchRoomTranscript } = await import('@/app/data/api');
    const result = await fetchRoomTranscript('r1');
    expect(result?.source).toBe('final');
    expect(result?.segments[0].text).toBe('cleaner text');
  });
});
