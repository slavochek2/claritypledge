/**
 * P1596: a room that ends during an OPEN round. The stretch inside that round stays with the round: the room-end job
 * leaves the round's seated people out of it, and the later cut keeps the room. Source-level pins on the migration
 * (the database tests need an applied server; e2e/integration/p1596-clean-round-transcripts.spec.ts holds the live case).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = 'supabase/migrations/';
const read = (f: string) => readFileSync(dir + f, 'utf8');
const body = (sql: string, name: string) => {
  const from = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  return sql.slice(from, sql.indexOf('$$;', sql.indexOf('AS $$', from)));
};
const NEW = read('20261102170000_p1596_open_round_at_room_end.sql');
const SEGMENTS_BEFORE = read('20261102133000_p1596_threads_in_time_order.sql');
const CUT_SEATS_BEFORE = read('20261101120000_p1596_clean_round_transcripts.sql');

/** What each version says about an open round. */
const segmentsCountOpenRounds = (sql: string) => {
  const fn = body(sql, 'public._transcribe_room_end_segments');
  return !/er\.ended_at IS NOT NULL/.test(fn) && (fn.match(/coalesce\(er\.ended_at, v_room\.ended_at\)/g) ?? []).length >= 3;
};
const cutKeepsRoomEndedMidRound = (sql: string) =>
  /tr\.ended_at > er\.started_at/.test(body(sql, 'public._transcribe_round_cut_seats')) &&
  !/tr\.ended_at >= er\.ended_at/.test(body(sql, 'public._transcribe_round_cut_seats'));

describe('a room that ends during an open round', () => {
  it('the controls: the previous versions did NOT keep the stretch with the round', () => {
    expect(segmentsCountOpenRounds(SEGMENTS_BEFORE)).toBe(false);
    expect(cutKeepsRoomEndedMidRound(CUT_SEATS_BEFORE)).toBe(false);
  });

  it('the room-end job treats an open round as running to the room end, in the bounds and in the seat loop', () => {
    expect(segmentsCountOpenRounds(NEW)).toBe(true);
  });

  it('the cut keeps a room that ended after the round began', () => {
    expect(cutKeepsRoomEndedMidRound(NEW)).toBe(true);
  });

  it('declares its client-safety, what it was diffed against, and corrects the unread claim of the previous migration', () => {
    expect(NEW).toMatch(/^-- client-safe: /m);
    expect(NEW).toMatch(/^-- diffed against:/m);
    expect(NEW).toMatch(/CORRECTION to 20261102143000/);
    expect(NEW).toMatch(/REVOKE ALL ON FUNCTION public\._transcribe_room_end_segments\(uuid\) FROM PUBLIC, anon, authenticated;/);
    expect(NEW).toMatch(/REVOKE ALL ON FUNCTION public\._transcribe_round_cut_seats\(uuid\) FROM PUBLIC, anon, authenticated;/);
  });

  it('create_transcribe_room refuses any event (the one shared room goes through enter_transcribe_room), keeps its grants, and the app calls only the other', () => {
    const create = body(NEW, 'public.create_transcribe_room');
    expect(create).toMatch(/IF p_event_id IS NOT NULL THEN\s+RAISE EXCEPTION[^;]*ERRCODE = '42501'/);
    expect(NEW).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_transcribe_room\(text, text, uuid, boolean, uuid\) TO authenticated;/);
    expect(NEW).toMatch(/REVOKE ALL ON FUNCTION public\.create_transcribe_room\(text, text, uuid, boolean, uuid\) FROM anon;/);
    expect(body(read('20260914120200_p1307_transcribe_member_cap_source.sql'), 'public.create_transcribe_room')).not.toMatch(/p_event_id IS NOT NULL THEN\s+RAISE/);
    const svc = readFileSync('src/app/data/transcribe-service.ts', 'utf8');
    expect(svc).not.toMatch(/\.rpc\('create_transcribe_room'/);
  });
});

describe('the seat log after 20261102180000', () => {
  it('the newest definition keeps the newcomer rule and still follows seats with every room ended', () => {
    const sql = read('20261102183000_p1596_seat_log_restore_newcomer.sql');
    expect(sql).toContain("v_known IS TRUE OR clock_timestamp() >= v_started + interval '5 seconds'");
    expect(sql).toContain('_transcribe_all_rooms_ended');
    expect(sql.indexOf('INSERT INTO public.transcribe_round_seat_state')).toBeGreaterThan(sql.indexOf('_transcribe_all_rooms_ended'));
  });
});
