/**
 * P1207 F10 — a session's child tables must inherit the parent's visibility.
 *
 * clarity_sessions gates DIRECTED sessions (target_listener_id set) to their two parties, and
 * leaves OPEN sessions (target_listener_id IS NULL) public — that is the anonymous /live flow,
 * where participants join by code and hold no account.
 *
 * The three child tables each carried a bare `qual = true`, so a private session's row was
 * hidden while its CONTENT — transcript, self_rating — stayed world-readable.
 *
 * Both directions are asserted here. A test that only checks the private case would pass against
 * a database where the anonymous /live flow had been broken outright.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';

const anon = () => createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
const code = () => `P7${Math.floor(Math.random() * 900000 + 100000)}`;

test.describe('P1207 F10: session children inherit the parent session\'s visibility', () => {
  let directedId: string;
  let openId: string;

  test.beforeAll(async () => {
    const { data: profs, error: pErr } = await supabaseAdmin.from('profiles').select('id').limit(2);
    if (pErr || !profs || profs.length < 2) throw new Error('p1207 F10 fixture: need two profiles');

    const directed = await supabaseAdmin.from('clarity_sessions').insert({
      code: code(), creator_name: 'p1207 seed',
      creator_profile_id: profs[0]!.id, target_listener_id: profs[1]!.id,
    }).select('id').single();
    if (directed.error) throw new Error(`p1207 F10 fixture: directed session: ${directed.error.message}`);
    directedId = directed.data.id;

    const open = await supabaseAdmin.from('clarity_sessions').insert({
      code: code(), creator_name: 'p1207 seed',
    }).select('id, target_listener_id').single();
    if (open.error) throw new Error(`p1207 F10 fixture: open session: ${open.error.message}`);
    if (open.data.target_listener_id !== null) throw new Error('p1207 F10 fixture: open session must have no target listener');
    openId = open.data.id;

    for (const [sid, tag] of [[directedId, 'PRIVATE'], [openId, 'OPEN']] as const) {
      const t = await supabaseAdmin.from('clarity_live_turns').insert({
        session_id: sid, speaker_name: 'p1207 A', listener_name: 'p1207 B',
        actor_name: 'p1207 A', role: 'speaker',
        transcript: `SENTINEL ${tag} transcript`, self_rating: 9,
      });
      if (t.error) throw new Error(`p1207 F10 fixture: turn for ${tag}: ${t.error.message}`);
    }
  });

  test.afterAll(async () => {
    for (const sid of [directedId, openId]) {
      if (!sid) continue;
      await supabaseAdmin.from('clarity_live_turns').delete().eq('session_id', sid);
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', sid);
    }
  });

  test('an OPEN session stays fully readable by anon — the anonymous /live flow is unchanged', async () => {
    // This is the control, and it must come first. Without it, the private-case assertion below
    // would pass just as well against a database where all reads had been broken.
    const turns = await anon().from('clarity_live_turns').select('transcript').eq('session_id', openId);
    expect(turns.error, `open-session turns must stay readable: ${turns.error?.message}`).toBeNull();
    expect(turns.data ?? [], 'the anonymous /live flow must keep working').toHaveLength(1);
    expect((turns.data as { transcript: string }[])[0]!.transcript).toContain('SENTINEL OPEN');
  });

  test('a DIRECTED session hides its parent row from anon — unchanged, and the premise of F10', async () => {
    const parent = await anon().from('clarity_sessions').select('id').eq('id', directedId);
    expect(parent.data ?? [], 'the directed session row must not be visible to anon').toEqual([]);
  });

  test('and its transcript must be hidden too — this is the leak', async () => {
    const turns = await anon()
      .from('clarity_live_turns').select('transcript, self_rating').eq('session_id', directedId);
    expect(turns.data ?? [],
      `a private session's transcript must not be readable by anon; got ${JSON.stringify(turns.data)}`).toEqual([]);
  });

  test('nor by an unfiltered sweep — no session_id needed to find it', async () => {
    const sweep = await anon().from('clarity_live_turns').select('transcript').limit(1000);
    const found = JSON.stringify(sweep.data ?? []).includes('SENTINEL PRIVATE');
    expect(found, 'a bulk read must not surface any private transcript').toBe(false);
    // Control on the same sweep: the OPEN session's transcript SHOULD be in there, which proves
    // the sweep genuinely returned rows rather than being empty for an unrelated reason.
    expect(JSON.stringify(sweep.data ?? []).includes('SENTINEL OPEN'),
      'control: the sweep must still return the open session, or it proves nothing').toBe(true);
  });
});
