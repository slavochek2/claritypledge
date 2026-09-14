/**
 * @file p1307-jobs-transcripts-rls.spec.ts
 * @description P270 canary for `transcribe_room_transcription_jobs` and
 * `transcribe_room_transcripts` (Decisions 4 + 5, Security Review Parent verification 4):
 * service-role-only writes, member-scoped SELECT reusing the P1207 shape verbatim.
 *
 * "Not-found" and "not-a-member" must collapse identically per the P1207 pattern this
 * spec reuses — asserted here as "a non-member sees zero rows", not a distinguishable
 * error, matching how every other member-scoped table in this codebase behaves.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function roomCode() {
  return `P1307J${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

test.describe('P1307: transcribe_room_transcription_jobs / transcribe_room_transcripts — write rules', () => {
  let member: TestUser;
  let nonMember: TestUser;
  const createdRoomIds: string[] = [];
  const createdSessionIds: string[] = [];
  const createdJobIds: string[] = [];

  async function clientFor(u: TestUser): Promise<SupabaseClient> {
    const { data: signIn, error } = await supabaseAdmin.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
    expect(error).toBeNull();
    const client = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();
    return client;
  }

  async function seedRoomWithMember() {
    const code = roomCode();
    const { data: room } = await supabaseAdmin.from('transcribe_rooms').insert({ code, ended_at: new Date().toISOString() }).select('id').single();
    createdRoomIds.push(room!.id);
    const { data: session } = await supabaseAdmin
      .from('clarity_sessions').insert({ code: `${code}-S`, creator_name: 'P1307 RLS Member', creator_profile_id: member.user.id }).select('id').single();
    createdSessionIds.push(session!.id);
    const { data: memberRow } = await supabaseAdmin
      .from('transcribe_room_members')
      .insert({ room_id: room!.id, profile_id: member.user.id, display_name: 'P1307 RLS Member', session_id: session!.id, consent_given_at: new Date().toISOString() })
      .select('id').single();
    return { roomId: room!.id as string, memberId: memberRow!.id as string };
  }

  test.beforeAll(async () => {
    member = await createTestUser({ name: 'P1307 RLS Member' });
    nonMember = await createTestUser({ name: 'P1307 RLS NonMember' });
  });

  test.afterAll(async () => {
    if (createdJobIds.length) await supabaseAdmin.from('transcribe_room_transcription_jobs').delete().in('id', createdJobIds);
    if (createdRoomIds.length) await supabaseAdmin.from('transcribe_rooms').delete().in('id', createdRoomIds);
    if (createdSessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    for (const u of [member, nonMember]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  test('an authenticated member cannot INSERT a transcription job row', async () => {
    const { roomId, memberId } = await seedRoomWithMember();
    const client = await clientFor(member);
    const { error } = await client.from('transcribe_room_transcription_jobs').insert({ room_id: roomId, member_id: memberId });
    expect(error, 'INSERT on transcribe_room_transcription_jobs must be refused for authenticated').not.toBeNull();
  });

  test('an authenticated member cannot INSERT a transcript row', async () => {
    const { roomId } = await seedRoomWithMember();
    const client = await clientFor(member);
    const { error } = await client.from('transcribe_room_transcripts').insert({ room_id: roomId, segments: [] });
    expect(error, 'INSERT on transcribe_room_transcripts must be refused for authenticated').not.toBeNull();
  });

  test('an authenticated member cannot UPDATE or DELETE a service-role-written job row', async () => {
    const { roomId, memberId } = await seedRoomWithMember();
    const { data: job } = await supabaseAdmin
      .from('transcribe_room_transcription_jobs').insert({ room_id: roomId, member_id: memberId, status: 'pending' }).select('id').single();
    createdJobIds.push(job!.id);

    const client = await clientFor(member);
    const upd = await client.from('transcribe_room_transcription_jobs').update({ status: 'completed' }).eq('id', job!.id);
    expect(upd.error, 'UPDATE must be refused for authenticated, even the room\'s own member').not.toBeNull();
    const del = await client.from('transcribe_room_transcription_jobs').delete().eq('id', job!.id);
    expect(del.error, 'DELETE must be refused for authenticated').not.toBeNull();

    const stillThere = await supabaseAdmin.from('transcribe_room_transcription_jobs').select('status').eq('id', job!.id).single();
    expect(stillThere.data?.status, 'the row must be unchanged').toBe('pending');
  });

  test('a room member can SELECT their room\'s job and transcript rows', async () => {
    const { roomId, memberId } = await seedRoomWithMember();
    const { data: job } = await supabaseAdmin
      .from('transcribe_room_transcription_jobs').insert({ room_id: roomId, member_id: memberId, status: 'completed' }).select('id').single();
    createdJobIds.push(job!.id);
    const { error: transcriptError } = await supabaseAdmin
      .from('transcribe_room_transcripts').insert({ room_id: roomId, segments: [{ text: 'hello', speaker: memberId }] });
    expect(transcriptError, `fixture: transcript insert failed: ${transcriptError?.message}`).toBeNull();

    const client = await clientFor(member);
    const jobRead = await client.from('transcribe_room_transcription_jobs').select('id, status').eq('room_id', roomId);
    expect(jobRead.error, `member must be able to read their room's job rows: ${jobRead.error?.message}`).toBeNull();
    expect(jobRead.data?.length).toBe(1);

    const transcriptRead = await client.from('transcribe_room_transcripts').select('room_id, segments').eq('room_id', roomId);
    expect(transcriptRead.error, `member must be able to read their room's transcript: ${transcriptRead.error?.message}`).toBeNull();
    expect(transcriptRead.data?.length).toBe(1);
  });

  test('a non-member sees zero rows for both tables — not an error, not a peek', async () => {
    const { roomId, memberId } = await seedRoomWithMember();
    const { data: job } = await supabaseAdmin
      .from('transcribe_room_transcription_jobs').insert({ room_id: roomId, member_id: memberId, status: 'completed' }).select('id').single();
    createdJobIds.push(job!.id);
    await supabaseAdmin.from('transcribe_room_transcripts').insert({ room_id: roomId, segments: [] });

    const client = await clientFor(nonMember);
    const jobRead = await client.from('transcribe_room_transcription_jobs').select('id').eq('room_id', roomId);
    expect(jobRead.error, 'a non-member query must not itself error — RLS filters silently').toBeNull();
    expect(jobRead.data ?? [], 'a non-member must see 0 job rows, not even knowing one exists').toEqual([]);

    const transcriptRead = await client.from('transcribe_room_transcripts').select('room_id').eq('room_id', roomId);
    expect(transcriptRead.error).toBeNull();
    expect(transcriptRead.data ?? [], 'a non-member must see 0 transcript rows').toEqual([]);
  });
});
