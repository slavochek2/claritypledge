/**
 * P1224 — a guest's seat secret rides its WRITES to the database, survives a reload, and
 * stops riding them once the guest leaves.
 *
 * The database half is covered by
 * e2e/integration/20261014093000_p1224_guest_writes_require_seat_secret.spec.ts; this file
 * covers the client custody that half depends on.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// api.ts is loaded below for the reload-path test; its client is mocked so nothing leaves the test.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn(), getSession: vi.fn() },
    channel: vi.fn(),
    removeChannel: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabase } from '@/lib/supabase';
import {
  getClaritySession,
  joinClaritySession,
  updateClaritySessionLiveState,
  patchClaritySessionLiveState,
  isGuestSeatLost,
} from '@/app/data/api';
import {
  ROOM_CODE_HEADER,
  SEAT_SECRET_HEADER,
  MAX_HELD_SEAT_SECRETS,
  holdRoomCode,
  holdSeatSecret,
  heldSeatSecrets,
  withRoomCodeHeader,
  _resetHeldRoomCodesForTesting,
  _resetHeldSeatSecretsForTesting,
} from '@/lib/room-capability';
import {
  setSeatSecret,
  getSeatSecret,
  restoreSeatSecret,
  clearSeatSecret,
  _resetSeatSecretMemoryForTesting,
} from '@/app/data/seat-secret';

const SUPABASE_URL = 'https://project.supabase.co';
const REST = `${SUPABASE_URL}/rest/v1/`;
const SECRET_A = '11111111-2222-4333-8444-555555555555';
const SECRET_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function spyFetch() {
  return vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
}

function sentHeaders(base: ReturnType<typeof spyFetch>, call = 0): Headers {
  const init = base.mock.calls[call]![1];
  return new Headers(init?.headers);
}

/**
 * Installs a fake localStorage whose writes (and optionally reads) throw. Spying on
 * Storage.prototype does not intercept jsdom's localStorage, so a prototype spy would make these
 * tests vacuous — measured: the stale-value test passed its write with a prototype spy in place.
 */
function installStorage(opts: { setThrows?: boolean; getThrows?: boolean; seed?: Record<string, string> } = {}) {
  const items = new Map(Object.entries(opts.seed ?? {}));
  const fake = {
    getItem: (k: string) => { if (opts.getThrows) throw new Error('SecurityError'); return items.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (opts.setThrows) throw new Error('QuotaExceededError'); items.set(k, v); },
    removeItem: (k: string) => { items.delete(k); },
    clear: () => items.clear(),
  };
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', { value: fake, configurable: true });
  return {
    items,
    allowWrites: () => { opts.setThrows = false; },
    restore: () => { if (original) Object.defineProperty(window, 'localStorage', original); },
  };
}

beforeEach(() => {
  _resetHeldRoomCodesForTesting();
  _resetHeldSeatSecretsForTesting();
  _resetSeatSecretMemoryForTesting();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('held seat secrets ride writing REST requests', () => {
  it('presents a held secret on a write (RPC POST and row PATCH), alongside the room code', async () => {
    holdRoomCode('ABC234');
    holdSeatSecret(SECRET_A);
    const base = spyFetch();
    const f = withRoomCodeHeader(REST, base);
    await f(`${REST}rpc/patch_live_state`, { method: 'POST', headers: { apikey: 'k' } });
    await f(`${REST}clarity_sessions?id=eq.x`, { method: 'PATCH', headers: { apikey: 'k' } });
    for (const call of [0, 1]) {
      const h = sentHeaders(base, call);
      expect(h.get(SEAT_SECRET_HEADER)).toBe(SECRET_A);
      expect(h.get(ROOM_CODE_HEADER)).toBe('ABC234');
      expect(h.get('apikey')).toBe('k');
    }
  });

  it('presents it on a read of our REST endpoint too (P1493: a guest reads its session as a seat holder)', async () => {
    holdRoomCode('ABC234');
    holdSeatSecret(SECRET_A);
    const base = spyFetch();
    const f = withRoomCodeHeader(REST, base);
    await f(`${REST}clarity_sessions?id=eq.x`, { headers: { apikey: 'k' } });
    await f(`${REST}clarity_sessions?id=eq.x`, { method: 'HEAD', headers: { apikey: 'k' } });
    expect(sentHeaders(base, 0).get(SEAT_SECRET_HEADER)).toBe(SECRET_A);
    expect(sentHeaders(base, 1).get(SEAT_SECRET_HEADER)).toBe(SECRET_A);
    expect(sentHeaders(base, 0).get(ROOM_CODE_HEADER)).toBe('ABC234');
  });

  it.each([
    'https://project.supabase.co/auth/v1/token',
    'https://project.supabase.co/functions/v1/gcs-signed-url',
    'https://project.supabase.co/storage/v1/object/x',
    'https://elsewhere.example/rest/v1/rpc/patch_live_state',
  ])('never sends it outside our REST endpoint: %s', async (url) => {
    holdSeatSecret(SECRET_A);
    const base = spyFetch();
    await withRoomCodeHeader(REST, base)(url, { method: 'POST', headers: { apikey: 'k' } });
    expect(sentHeaders(base).has(SEAT_SECRET_HEADER)).toBe(false);
  });

  it('reads the method from a Request object input', async () => {
    holdSeatSecret(SECRET_A);
    const base = spyFetch();
    await withRoomCodeHeader(REST, base)(new Request(`${REST}rpc/x`, { method: 'POST', headers: { apikey: 'k' } }));
    expect(sentHeaders(base).get(SEAT_SECRET_HEADER)).toBe(SECRET_A);
  });

  it('holds only canonical uuids, at most two, newest first', () => {
    for (const bad of ['', 'not-a-uuid', `${SECRET_A},${SECRET_B}`, null, undefined]) holdSeatSecret(bad);
    expect(heldSeatSecrets()).toEqual([]);
    expect(MAX_HELD_SEAT_SECRETS).toBe(2);
    holdSeatSecret(SECRET_A.toUpperCase());
    holdSeatSecret(SECRET_B);
    holdSeatSecret('99999999-9999-4999-8999-999999999999');
    expect(heldSeatSecrets()).toEqual(['99999999-9999-4999-8999-999999999999', SECRET_B]);
  });
});

describe('seat-secret custody feeds the request layer', () => {
  it('a claim (setSeatSecret) makes the next write present the secret', async () => {
    setSeatSecret('session-1', SECRET_A);
    const base = spyFetch();
    await withRoomCodeHeader(REST, base)(`${REST}rpc/patch_live_state`, { method: 'POST' });
    expect(sentHeaders(base).get(SEAT_SECRET_HEADER)).toBe(SECRET_A);
  });

  it('a reload (fresh module state, secret in storage) presents it again once restored', async () => {
    window.localStorage.setItem('cp.seatSecret.session-1', SECRET_A);
    expect(heldSeatSecrets()).toEqual([]);
    restoreSeatSecret('session-1');
    const base = spyFetch();
    await withRoomCodeHeader(REST, base)(`${REST}rpc/patch_live_state`, { method: 'POST' });
    expect(sentHeaders(base).get(SEAT_SECRET_HEADER)).toBe(SECRET_A);
  });

  it('restore is a no-op for a session this tab holds no secret for (signed-in participant)', () => {
    restoreSeatSecret('session-signed-in');
    expect(heldSeatSecrets()).toEqual([]);
  });

  it('a guest whose storage throws keeps the seat for the life of the tab', async () => {
    const storage = installStorage({ setThrows: true, getThrows: true });
    try {
      setSeatSecret('session-1', SECRET_A);
      expect(getSeatSecret('session-1')).toBe(SECRET_A);
      const base = spyFetch();
      await withRoomCodeHeader(REST, base)(`${REST}rpc/patch_live_state`, { method: 'POST' });
      expect(sentHeaders(base).get(SEAT_SECRET_HEADER)).toBe(SECRET_A);
    } finally {
      storage.restore();
    }
  });

  it('leaving the seat (clearSeatSecret) stops presenting it and forgets it', async () => {
    setSeatSecret('session-1', SECRET_A);
    clearSeatSecret('session-1');
    expect(getSeatSecret('session-1')).toBeNull();
    expect(heldSeatSecrets()).toEqual([]);
    const base = spyFetch();
    await withRoomCodeHeader(REST, base)(`${REST}rpc/patch_live_state`, { method: 'POST' });
    expect(base).toHaveBeenCalledWith(`${REST}rpc/patch_live_state`, { method: 'POST' });
  });
});

describe('every way a session re-enters the client restores its seat secret', () => {
  const row = {
    id: 'session-reload', creator_name: 'Host', creator_note: null, joiner_name: 'Guest',
    creator_profile_id: 'prof-1', joiner_profile_id: null, state: {}, demo_status: null,
    partnership_status: null, created_at: '2026-01-01T00:00:00Z', expires_at: null, ended_at: null,
    mode: 'live', live_state: {}, is_private: false,
  };

  it('reload: resolving the room by code presents the stored secret on the next write', async () => {
    window.localStorage.setItem('cp.seatSecret.session-reload', SECRET_A);
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [row], error: null } as never);
    await getClaritySession('abc234');
    expect(heldSeatSecrets()).toEqual([SECRET_A]);
  });

  it('claim: the secret the server returns is presented on the next write', async () => {
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: [row], error: null } as never) // get_session_by_code preflight
      .mockResolvedValueOnce({ data: [{ ...row, joiner_seat_secret: SECRET_B }], error: null } as never);
    await joinClaritySession('abc234', 'Guest');
    expect(heldSeatSecrets()).toEqual([SECRET_B]);
    expect(getSeatSecret('session-reload')).toBe(SECRET_B);
  });

  it('a signed-in participant (no stored secret) presents none', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [{ ...row, joiner_profile_id: 'prof-2' }], error: null } as never);
    await getClaritySession('abc234');
    expect(heldSeatSecrets()).toEqual([]);
  });
});

describe('a refused guest write is reported, never confirmed silently', () => {
  function updateChain(result: { data: unknown[] | null; error: unknown }) {
    const select = vi.fn().mockResolvedValue(result);
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    vi.mocked(supabase.from).mockReturnValue({ update } as never);
    return { update, eq, select };
  }
  const asGuest = () => vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null } as never);
  const asSignedIn = () => vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null } as never);

  it('a guest whose row write matched nothing gets a lost-seat error (zero rows is not success)', async () => {
    asGuest();
    const chain = updateChain({ data: [], error: null });
    const err = await updateClaritySessionLiveState('s1', { a: 1 }).catch((e) => e);
    expect(chain.select).toHaveBeenCalledWith('id');
    expect(isGuestSeatLost(err)).toBe(true);
  });

  it('a guest whose row write landed resolves normally', async () => {
    asGuest();
    updateChain({ data: [{ id: 's1' }], error: null });
    await expect(updateClaritySessionLiveState('s1', { a: 1 })).resolves.toBeUndefined();
  });

  it('a signed-in participant keeps the existing contract on a zero-row write (no throw)', async () => {
    asSignedIn();
    updateChain({ data: [], error: null });
    await expect(updateClaritySessionLiveState('s1', { a: 1 })).resolves.toBeUndefined();
  });

  it('a guest refused by the partial-merge path gets a lost-seat error', async () => {
    asGuest();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: '42501', message: 'cannot write to this session' } } as never);
    const err = await patchClaritySessionLiveState('s1', { a: 1 }).catch((e) => e);
    expect(isGuestSeatLost(err)).toBe(true);
  });

  it('any other partial-merge failure stays an ordinary error', async () => {
    asGuest();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: '57014', message: 'timeout' } } as never);
    const err = await patchClaritySessionLiveState('s1', { a: 1 }).catch((e) => e);
    expect(isGuestSeatLost(err)).toBe(false);
    expect((err as Error).message).toBe('timeout');
  });
});

describe('a newly issued secret is never shadowed by a stale stored one', () => {
  it('when storage cannot be written, the new in-tab secret wins over the old stored one', () => {
    // An earlier claim stored SECRET_A; this tab re-joined and was issued SECRET_B, but the write fails.
    const storage = installStorage({ setThrows: true, seed: { 'cp.seatSecret.session-1': SECRET_A } });
    try {
      setSeatSecret('session-1', SECRET_B);
      expect(getSeatSecret('session-1')).toBe(SECRET_B);
      // The stale value is gone from storage, so a reload cannot resurrect it either.
      expect(storage.items.get('cp.seatSecret.session-1')).toBeUndefined();
      restoreSeatSecret('session-1');
      expect(heldSeatSecrets()).toEqual([SECRET_B]);
    } finally {
      storage.restore();
    }
  });

  it('replacing a secret stops presenting the old one', () => {
    setSeatSecret('session-1', SECRET_A);
    setSeatSecret('session-1', SECRET_B);
    expect(heldSeatSecrets()).toEqual([SECRET_B]);
  });

  it('leaving retires both the in-tab value and a differing stored value', () => {
    const storage = installStorage({ setThrows: true });
    try {
      setSeatSecret('session-1', SECRET_B); // in tab only
      storage.items.set('cp.seatSecret.session-1', SECRET_A); // a differing stored copy (another tab)
      restoreSeatSecret('session-1');
      holdSeatSecret(SECRET_A);
      clearSeatSecret('session-1');
      expect(getSeatSecret('session-1')).toBeNull();
      expect(heldSeatSecrets()).toEqual([]);
      expect(storage.items.has('cp.seatSecret.session-1')).toBe(false);
    } finally {
      storage.restore();
    }
  });
});
