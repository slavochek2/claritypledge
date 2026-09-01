/**
 * P1097: the room code is minted server-side from a CSPRNG; the client never supplies one.
 *
 * Client-side contract under test:
 *   1. createClaritySession sends NO `code` in the INSERT payload.
 *   2. It learns the minted code through the creator-bound RPC get_room_code_for_invite
 *      and splices it onto the returned session.
 *   3. A NULL reveal (caller is not the row's creator) is a hard error, not /live/undefined.
 *   4. A 23505 on the insert re-runs the insert (server re-draws) — still without a code.
 *   5. api.ts no longer contains a client-side room-code generator.
 *
 * The server side (alphabet, length, retry-on-collision, column grant) is proven in
 * e2e/integration/p1097-csprng-room-code-migration.spec.ts against the live test DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mockSingle = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

import { createClaritySession } from '@/app/data/api';

const ROW = {
  id: 'session-uuid-1',
  creator_name: 'Host',
  creator_note: null,
  joiner_name: null,
  creator_profile_id: 'user-1',
  joiner_profile_id: null,
  state: {},
  demo_status: 'waiting',
  partnership_status: 'pending',
  created_at: '2026-09-01T00:00:00Z',
  expires_at: null,
  ended_at: null,
  mode: null,
  live_state: null,
  is_private: false,
  last_activity_at: null,
  source_letter_id: null,
  source_story_id: null,
  target_listener_id: null,
  status: null,
};

function chainInsert(results: Array<{ data: unknown; error: unknown }>) {
  results.forEach((r) => mockSingle.mockResolvedValueOnce(r));
  mockSelect.mockReturnValue({ single: mockSingle });
  mockInsert.mockReturnValue({ select: mockSelect });
  mockFrom.mockReturnValue({ insert: mockInsert });
}

describe('P1097: createClaritySession — server-minted room code', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('sends no `code` in the INSERT payload', async () => {
    chainInsert([{ data: ROW, error: null }]);
    mockRpc.mockResolvedValue({ data: 'AB3DEF', error: null });

    await createClaritySession('Host', 'user-1');

    expect(mockFrom).toHaveBeenCalledWith('clarity_sessions');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const payload = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(payload)).not.toContain('code');
    expect(payload.creator_name).toBe('Host');
    expect(payload.creator_profile_id).toBe('user-1');
  });

  it('learns the minted code via get_room_code_for_invite and returns it on the session', async () => {
    chainInsert([{ data: ROW, error: null }]);
    mockRpc.mockResolvedValue({ data: 'AB3DEF', error: null });

    const session = await createClaritySession('Host', 'user-1');

    expect(mockRpc).toHaveBeenCalledWith('get_room_code_for_invite', { p_session_id: 'session-uuid-1' });
    expect(session.code).toBe('AB3DEF');
    expect(session.id).toBe('session-uuid-1');
  });

  it('throws when the reveal returns NULL (caller is not the creator) — never /live/undefined', async () => {
    chainInsert([{ data: ROW, error: null }]);
    mockRpc.mockResolvedValue({ data: null, error: null });

    await expect(createClaritySession('Host', undefined)).rejects.toThrow(/could not be retrieved/);
  });

  it('throws when the reveal RPC errors', async () => {
    chainInsert([{ data: ROW, error: null }]);
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc down', code: 'XX000' } });

    await expect(createClaritySession('Host', 'user-1')).rejects.toThrow('rpc down');
  });

  it('re-runs the insert on 23505 (concurrent draw collided) — still without a code', async () => {
    chainInsert([
      { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
      { data: ROW, error: null },
    ]);
    mockRpc.mockResolvedValue({ data: 'XY7ZQ2', error: null });

    const session = await createClaritySession('Host', 'user-1');

    expect(mockInsert).toHaveBeenCalledTimes(2);
    for (const call of mockInsert.mock.calls) {
      expect(Object.keys(call[0] as Record<string, unknown>)).not.toContain('code');
    }
    expect(session.code).toBe('XY7ZQ2');
  });

  it('gives up after 5 unique violations', async () => {
    chainInsert(Array.from({ length: 5 }, () => ({ data: null, error: { code: '23505', message: 'dup' } })));

    await expect(createClaritySession('Host', 'user-1')).rejects.toThrow(/unique room code/);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('surfaces non-23505 insert errors without retrying', async () => {
    chainInsert([{ data: null, error: { code: '42501', message: 'permission denied for table clarity_sessions' } }]);

    await expect(createClaritySession('Host', 'user-1')).rejects.toThrow(/permission denied/);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('api.ts no longer carries a client-side room-code generator', () => {
    const src = readFileSync(resolve(__dirname, '../app/data/api.ts'), 'utf8');
    expect(src).not.toMatch(/function generateRoomCode/);
    // The old mint: `chars.charAt(Math.floor(Math.random() * chars.length))` over the room alphabet.
    expect(src).not.toMatch(/ABCDEFGHJKLMNPQRSTUVWXYZ23456789/);
  });
});
