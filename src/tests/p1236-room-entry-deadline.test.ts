/**
 * P1236 — entering a room must fail honestly when the server never answers.
 *
 * Measured on a physical phone 2026-09-11. The phone was on a VPN whose tunnel completed
 * the TCP connect and then swallowed the request: ICMP to Supabase answered in 92 ms while
 * every HTTPS call hung. The page sat on "Joining…" indefinitely — no error, no timeout, no
 * way out but a reload — because `fetch` has no default timeout and neither PostgREST calls
 * nor `supabase.auth.getSession()` accept a signal.
 *
 * The first diagnosis of this blamed the room RPC, which was never reached and was never at
 * fault. That is the cost of a hang: it points nowhere.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const rpc = vi.fn();
const del = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => ({ delete: () => ({ eq: () => ({ select: () => del() }) }) }),
  },
}));

const createClaritySession = vi.fn();
vi.mock('@/app/data/api', () => ({
  createClaritySession: (...a: unknown[]) => createClaritySession(...a),
  createTranscriptionJob: vi.fn(),
}));

import { createRoom, SERVER_UNREACHABLE_MESSAGE } from '@/app/data/transcribe-service';

const never = () => new Promise<never>(() => {});
const PAST_DEADLINE = 20_000;

beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockReset();
  del.mockReset().mockReturnValue(Promise.resolve({ data: [], error: null }));
  createClaritySession.mockReset();
});
afterEach(() => vi.useRealTimers());

/** Runs `p` to settlement while pushing fake time past the deadline. */
async function settleAfterDeadline<T>(p: Promise<T>) {
  const captured = p.then((v) => ({ ok: true as const, v }), (e: Error) => ({ ok: false as const, e }));
  await vi.advanceTimersByTimeAsync(PAST_DEADLINE);
  return captured;
}

describe('P1236 — room entry is deadlined', () => {
  it('a session mint that never answers rejects, instead of hanging forever', async () => {
    createClaritySession.mockImplementation(never);

    const r = await settleAfterDeadline(createRoom('p1', 'Participant', true));

    expect(r.ok).toBe(false);
    // The participant is told the server did not answer — not "try again", which is advice
    // that cannot work while the tunnel is up.
    expect(!r.ok && r.e.message).toBe(SERVER_UNREACHABLE_MESSAGE);
  });

  it('an entry RPC that never answers rejects, and still discards the spent session row', async () => {
    createClaritySession.mockResolvedValue({ id: 'sess-1' });
    rpc.mockImplementation(never);

    const r = await settleAfterDeadline(createRoom('p1', 'Participant', true));

    expect(!r.ok && r.e.message).toBe(SERVER_UNREACHABLE_MESSAGE);
    // A fired deadline bypasses the normal error branch, so the cleanup is easy to lose.
    expect(del).toHaveBeenCalledTimes(1);
  });

  it('CONTROL — a real server error keeps its own message and is NOT flattened', async () => {
    createClaritySession.mockResolvedValue({ id: 'sess-1' });
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'consent is required' } });

    const r = await createRoom('p1', 'Participant', true).then(
      () => ({ ok: true as const }), (e: Error) => ({ ok: false as const, e }));

    expect(r.ok).toBe(false);
    // Without this the deadline work would silently swallow every genuine failure into one
    // sentence — a gate whose fixture only contains inputs it should reject proves nothing
    // about the ones it must let through.
    expect(!r.ok && r.e.message).not.toBe(SERVER_UNREACHABLE_MESSAGE);
  });

  it('CONTROL — a normal fast entry still succeeds and is untouched by the deadline', async () => {
    createClaritySession.mockResolvedValue({ id: 'sess-1' });
    rpc.mockResolvedValue({ data: [{
      room_id: 'r1', room_code: 'ABC234', room_event_id: null,
      room_created_at: 't', room_ended_at: null,
      member_id: 'm1', member_profile_id: 'p1', member_display_name: 'Participant',
      member_session_id: 'sess-1', member_joined_at: 't', member_consent_given_at: 't',
    }], error: null });

    const out = await createRoom('p1', 'Participant', true);

    expect(out.room.code).toBe('ABC234');
    expect(out.member.id).toBe('m1');
    expect(del).not.toHaveBeenCalled();
  });
});
