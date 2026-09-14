/**
 * P1307 REPLACES this file's original subject. `endRoom()` (client-side, ends a room for
 * every member) is retired by Decision 7 — Part 1's "no client ever ends a room for anyone
 * else" invariant forbids it as a UI action now that Decision 1 provides the correct
 * per-person alternative (`endMyCapture`). Per the P1236 finding this file used to guard
 * (a second "End Session" tap re-stamping `ended_at` and re-creating a job for every
 * member, including ones who had left), the SAME idempotency property is now asked of
 * `endMyCapture` instead — first-wins on the server (`end_transcribe_room_capture`'s
 * `COALESCE(capture_ended_at, now())`), and this file pins that no client-side path can
 * still reach a room-wide end.
 *
 * The original P1236 finding is preserved as historical context above; it is not re-tested
 * here because the code path it found (client-side `endRoom`) no longer exists to test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcCalls: Array<{ fn: string; args: unknown }> = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: null, error: null });
    },
    from: () => {
      throw new Error(
        '[test] supabase.from() was called — endMyCapture must go through the ' +
        'end_transcribe_room_capture RPC, never a direct table UPDATE (no client UPDATE ' +
        'is left on transcribe_rooms or transcribe_room_members for this field).',
      );
    },
  },
}));

const createTranscriptionJob = vi.fn();
vi.mock('@/app/data/api', () => ({
  createClaritySession: vi.fn(),
  createTranscriptionJob: (...a: unknown[]) => createTranscriptionJob(...a),
}));

beforeEach(() => {
  rpcCalls.length = 0;
  createTranscriptionJob.mockReset();
});

describe('P1307 — endRoom is retired; endMyCapture is the only client-side end path', () => {
  it('transcribe-service.ts exports no client-callable endRoom() any more', async () => {
    const mod = await import('@/app/data/transcribe-service');
    expect(
      (mod as Record<string, unknown>).endRoom,
      'endRoom() must be removed from transcribe-service.ts (Decision 7) — its only ' +
      'callers today fan out createTranscriptionJob per member, which Part 1 forbids.',
    ).toBeUndefined();
  });

  it('endMyCapture calls end_transcribe_room_capture exactly once and creates no transcription job itself', async () => {
    const mod = await import('@/app/data/transcribe-service');
    const endMyCapture = (mod as Record<string, unknown>).endMyCapture as
      ((roomId: string) => Promise<void>) | undefined;
    expect(endMyCapture, 'transcribe-service.ts must export endMyCapture(roomId) (Decision 1)').toBeTypeOf('function');

    await endMyCapture!('r1');
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]!.fn).toBe('end_transcribe_room_capture');
    expect(rpcCalls[0]!.args).toEqual({ p_room_id: 'r1' });
    // Job creation is the sweep's job (Decision 2, service-role, in the same transaction as
    // the room end) — never the ending client's. This is the exact defect the retired
    // endRoom() had: it created N jobs from the caller's own browser.
    expect(createTranscriptionJob).not.toHaveBeenCalled();
  });

  it('calling endMyCapture twice does not throw — a second End is a normal outcome', async () => {
    const mod = await import('@/app/data/transcribe-service');
    const endMyCapture = (mod as Record<string, unknown>).endMyCapture as (roomId: string) => Promise<void>;
    await expect(endMyCapture('r1')).resolves.toBeUndefined();
    await expect(endMyCapture('r1')).resolves.toBeUndefined();
    // Idempotency itself (first-wins on capture_ended_at) is a server property, asserted
    // against the real DB in e2e/integration/p1307-end-capture-rpc.spec.ts — this test only
    // pins that the CLIENT does not need its own guard (no local "already ended" branching
    // that could itself drift from the server's).
    expect(rpcCalls).toHaveLength(2);
    expect(rpcCalls.every((c) => c.fn === 'end_transcribe_room_capture')).toBe(true);
  });
});
