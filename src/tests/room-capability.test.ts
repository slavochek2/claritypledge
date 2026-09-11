import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ROOM_CODE_HEADER,
  MAX_HELD_ROOM_CODES,
  holdRoomCode,
  heldRoomCodes,
  withRoomCodeHeader,
  _resetHeldRoomCodesForTesting,
} from '@/lib/room-capability';

const SUPABASE_URL = 'https://project.supabase.co';
const REST = `${SUPABASE_URL}/rest/v1/`;

function spyFetch() {
  return vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
}

function sentHeaders(base: ReturnType<typeof spyFetch>): Headers {
  const init = base.mock.calls[0]![1];
  return new Headers(init?.headers);
}

describe('held room codes ride REST requests as a header', () => {
  beforeEach(() => _resetHeldRoomCodesForTesting());

  it('adds nothing while the tab holds no code', async () => {
    const base = spyFetch();
    const init = { headers: { apikey: 'k' } };
    await withRoomCodeHeader(REST, base)(`${REST}some_table?select=id`, init);
    expect(base).toHaveBeenCalledWith(`${REST}some_table?select=id`, init);
  });

  it('presents a held code on a REST request, normalized, alongside the existing headers', async () => {
    holdRoomCode(' abc234 ');
    const base = spyFetch();
    await withRoomCodeHeader(REST, base)(`${REST}some_table?id=eq.x`, {
      headers: { apikey: 'k', Authorization: 'Bearer t' },
    });
    const h = sentHeaders(base);
    expect(h.get(ROOM_CODE_HEADER)).toBe('ABC234');
    expect(h.get('apikey')).toBe('k');
    expect(h.get('Authorization')).toBe('Bearer t');
  });

  it.each([
    'https://project.supabase.co/auth/v1/token',
    'https://project.supabase.co/functions/v1/gcs-signed-url',
    'https://project.supabase.co/storage/v1/object/x',
    'https://elsewhere.example/rest/v1/some_table',
  ])('never sends the code outside our REST endpoint: %s', async (url) => {
    holdRoomCode('ABC234');
    const base = spyFetch();
    await withRoomCodeHeader(REST, base)(url, { headers: { apikey: 'k' } });
    expect(sentHeaders(base).has(ROOM_CODE_HEADER)).toBe(false);
  });

  it('rejects anything that is not six alphanumerics — a code can never smuggle the separator', () => {
    for (const bad of ['', 'ABC23', 'ABC2345', 'AB,C23', 'ABC 23', 'ÄBC234', null, undefined]) holdRoomCode(bad);
    expect(heldRoomCodes()).toEqual([]);
  });

  it('keeps legacy-alphabet codes (rooms minted before P1097)', () => {
    holdRoomCode('ABO01I');
    expect(heldRoomCodes()).toEqual(['ABO01I']);
  });

  it('holds at most two rooms, newest first, so the current room is never the one dropped', async () => {
    expect(MAX_HELD_ROOM_CODES).toBe(2);
    for (let i = 0; i < 5; i++) holdRoomCode(`ROOM0${i}`);
    expect(heldRoomCodes()).toEqual(['ROOM04', 'ROOM03']);
    holdRoomCode('ROOM03'); // re-use moves it to the front rather than duplicating
    const codes = heldRoomCodes();
    expect(codes).toEqual(['ROOM03', 'ROOM04']);

    const base = spyFetch();
    await withRoomCodeHeader(REST, base)(`${REST}other_table`, {});
    expect(sentHeaders(base).get(ROOM_CODE_HEADER)).toBe(codes.join(','));
  });

  it('handles a Request object input without dropping its headers', async () => {
    holdRoomCode('ABC234');
    const base = spyFetch();
    const req = new Request(`${REST}some_table`, { headers: { apikey: 'k' } });
    await withRoomCodeHeader(REST, base)(req);
    const h = sentHeaders(base);
    expect(h.get(ROOM_CODE_HEADER)).toBe('ABC234');
    expect(h.get('apikey')).toBe('k');
  });
});
