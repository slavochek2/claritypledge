/**
 * @file p1529-mastermind.ts
 * @description P1529 QA fixtures for the sales mastermind, TEST ONLY. Shared by e2e/p1529-mastermind.spec.ts and
 * e2e/integration/p1529-db-schema.spec.ts. Every export that touches a database first calls assertSelfHostedTest(): a URL that
 * is not the self-hosted TEST server is refused before any request goes out. Setup is API-level (service role plus the
 * attendees' own signed-in clients, so the real RPCs run); what the ACs describe is driven through the real UI in the spec.
 *
 * Cleanup is exact: every id this module creates is remembered in a Ledger, and `cleanup(ledger)` deletes only those.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { supabaseAdmin } from './supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from './test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './test-event';
import { seedRoomMember } from './test-event-room';

export const SELFHOSTED_TEST_URL = 'https://136-85-1-126.sslip.io';

/** Throws unless the service-role client points at the self-hosted TEST server. Called before every write. */
export function assertSelfHostedTest(): void {
  const url = process.env.VITE_SUPABASE_URL ?? '';
  if (url !== SELFHOSTED_TEST_URL) {
    throw new Error(`[P1529] refused: VITE_SUPABASE_URL is "${url}", not ${SELFHOSTED_TEST_URL}. Nothing was run.`);
  }
}

export const RUN = Math.random().toString(36).slice(2, 7);

export interface Ledger {
  users: TestUser[];
  events: TestEvent[];
  rooms: string[];
  sessions: string[];
  points: string[];
  canvases: string[];
  /** canvas_draft_runs.spend_id values of the runs this suite caused (the model ledger rows are ours to remove). */
  spendOwners: string[];
}
export const newLedger = (): Ledger => ({ users: [], events: [], rooms: [], sessions: [], points: [], canvases: [], spendOwners: [] });

export interface Person {
  user: TestUser;
  client: SupabaseClient;
  /** event_room_members id per event id */
  room: Map<string, string>;
  /** transcribe_room_members id per event id */
  tmember: Map<string, string>;
  canvasName?: string;
  canvasId?: string;
}

/**
 * P1529_TERMS=v1.7: a canvas-draft function deployed before the v1.8 bump refuses a v1.8 user (TERMS_NOT_ACCEPTED, 409), so a real model run
 * needs the user on v1.7 for the moment the start call is made. Only that moment: a v1.7 user sees the "terms updated" notice on every page,
 * which would sit on top of every screenshot. Unset (the default), this does nothing.
 */
export const MODEL_TERMS_WORKAROUND = process.env.P1529_TERMS === 'v1.7';
export async function withModelTerms<T>(p: Person, fn: () => Promise<T>): Promise<T> {
  if (!MODEL_TERMS_WORKAROUND) return fn();
  const set = async (v: string) => {
    const { error } = await supabaseAdmin.from('profiles').update({ accepted_terms_version: v }).eq('id', p.user.user.id);
    if (error) throw new Error(`terms flip: ${error.message}`);
  };
  await set('v1.7');
  try { return await fn(); } finally { await set('v1.8'); }
}

export async function signedIn(user: TestUser): Promise<SupabaseClient> {
  assertSelfHostedTest();
  const delays = [3000, 8000, 20000, 45000];
  for (let attempt = 0; ; attempt++) {
    const client = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
    if (!error && data.session) return client;
    const limited = error && (error.status === 429 || /rate limit/i.test(error.message));
    if (!limited || attempt >= delays.length) throw new Error(`sign-in failed for ${user.email}: ${error?.message}`);
    await new Promise((r) => setTimeout(r, delays[attempt]));
  }
}

export async function makeUser(ledger: Ledger, name: string): Promise<Person> {
  assertSelfHostedTest();
  const user = await createTestUser({ name });
  ledger.users.push(user);
  return { user, client: await signedIn(user), room: new Map(), tmember: new Map() };
}

/** A mastermind event in the sales-mastermind series (the series is set by the service role only, P1403). */
export async function makeEvent(
  ledger: Ledger, host: TestUser, title: string,
  o: { series?: string | null; startsInMs?: number; maxAttendees?: number | null; previous?: string | null } = {},
): Promise<TestEvent> {
  assertSelfHostedTest();
  const ev = await createTestEvent(host.user.id, new Date(Date.now() + (o.startsInMs ?? 0)), { title });
  ledger.events.push(ev);
  const patch: Record<string, unknown> = { preparation_enabled: true };
  if (o.series !== null) patch.series_slug = o.series ?? 'sales-mastermind';
  if (o.maxAttendees !== undefined) patch.max_attendees = o.maxAttendees;
  const { error } = await supabaseAdmin.from('events').update(patch).eq('id', ev.id);
  if (error) throw new Error(`[P1529 fixture] event patch: ${error.message}`);
  if (o.previous) {
    const r = await supabaseAdmin.from('events').update({ previous_session_event_id: o.previous }).eq('id', ev.id);
    if (r.error) throw new Error(`[P1529 fixture] previous session: ${r.error.message}`);
  }
  return ev;
}

const POINTS: Array<[string, string]> = [
  ['canvas:segments', 'Small B2B software companies with 10 to 50 staff'],
  ['canvas:problem', 'New users do not understand the product in their first week'],
  ['canvas:solution', 'Short onboarding videos made to order'],
  ['canvas:channels', 'LinkedIn posts and founder introductions'],
  ['canvas:revenue', '2,400 euros for a package of 5 videos'],
  ['canvas:metrics', 'Four new clients by March'],
];

/** Publishes a first canvas for this person: real RPCs for the draft and Publish, service-role points (no model call). */
export async function publishCanvas(ledger: Ledger, p: Person, title: string): Promise<{ name: string; canvasId: string; versionId: string }> {
  assertSelfHostedTest();
  const uid = p.user.user.id;
  const opened = await p.client.rpc('canvas_draft_open', { p_from_version: null });
  if (opened.error) throw new Error(`canvas_draft_open: ${opened.error.message}`);
  const COLS = 'id,version_id,version_name,revision,canvas_id,canvas_name';
  const { data: d } = await supabaseAdmin.from('canvas_drafts').select(COLS).eq('owner_id', uid).eq('state', 'open')
    .is('base_version_id', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!d) throw new Error('no draft after canvas_draft_open');
  for (const [box, statement] of POINTS) {
    const pt = await supabaseAdmin.from('points').insert({
      statement: `${statement} (${title})`, first_validator_id: uid, visibility: 'private', tags: [], system_tags: [box, `canvas_${d.version_name}`],
    }).select('id').single();
    if (pt.error) throw new Error(`seed point: ${pt.error.message}`);
    ledger.points.push(pt.data.id as string);
    const l = await supabaseAdmin.from('canvas_draft_points').insert({ draft_id: d.id, point_id: pt.data.id });
    if (l.error) throw new Error(`seed draft point: ${l.error.message}`);
  }
  const pub = await p.client.rpc('canvas_draft_publish', { p_draft: d.id, p_expected_revision: d.revision });
  if (pub.error) throw new Error(`canvas_draft_publish: ${pub.error.message}`);
  const ren = await p.client.rpc('canvas_rename', { p_canvas: d.canvas_id, p_title: title });
  if (ren.error) throw new Error(`canvas_rename: ${ren.error.message}`);
  ledger.canvases.push(d.canvas_id as string);
  p.canvasName = d.canvas_name as string;
  p.canvasId = d.canvas_id as string;
  return { name: d.canvas_name as string, canvasId: d.canvas_id as string, versionId: d.version_id as string };
}

/** The real registration RPC (mastermind flow), as the attendee. */
export async function register(p: Person, slug: string, participation = 'canvas_before', phone = 'usbc'): Promise<string> {
  const { data, error } = await p.client.rpc('register_for_event', {
    p_slug: slug, p_participation: participation, p_phone: phone, p_hope: null, p_recording_accepted: true,
    p_observer_prep: participation === 'observer' ? 'home' : null, // D24: an observer's second answer is required
  });
  if (error) throw new Error(`register_for_event: ${error.message}`);
  return data as string;
}

/** The real "share with this event" RPC, as the attendee. */
export async function shareForEvent(p: Person, eventId: string, name?: string) {
  const { data, error } = await p.client.rpc('set_event_canvas', { p_event: eventId, p_name: name ?? p.canvasName });
  if (error) throw new Error(`set_event_canvas: ${error.message}`);
  return data as { status: string; code?: string; name?: string };
}

/** Puts a registered person in an event's room and its transcription room, ready for the host's seating. */
export async function joinRoom(ledger: Ledger, p: Person, ev: TestEvent, roomIds: { transcribeRoom: string }): Promise<void> {
  assertSelfHostedTest();
  const m = await seedRoomMember(ev.id, { displayName: p.user.name, profileId: p.user.user.id, optedIn: true, comprehensionRating: 7 });
  p.room.set(ev.id, m.id);
  const { data: s, error: se } = await supabaseAdmin.from('clarity_sessions')
    .insert({ code: `P1529${RUN}${Math.random().toString(36).slice(2, 7)}`.slice(0, 20).toUpperCase(), creator_name: p.user.name, creator_profile_id: p.user.user.id })
    .select('id').single();
  if (se) throw new Error(`clarity_sessions: ${se.message}`);
  ledger.sessions.push(s.id as string);
  const { data: t, error: te } = await supabaseAdmin.from('transcribe_room_members').insert({
    room_id: roomIds.transcribeRoom, profile_id: p.user.user.id, display_name: p.user.name, session_id: s.id,
    consent_given_at: new Date().toISOString(), capture_ended_at: new Date().toISOString(),
  }).select('id').single();
  if (te) throw new Error(`transcribe_room_members: ${te.message}`);
  p.tmember.set(ev.id, t.id as string);
}

export async function makeTranscribeRoom(ledger: Ledger, ev: TestEvent): Promise<string> {
  assertSelfHostedTest();
  const { data, error } = await supabaseAdmin.from('transcribe_rooms')
    .insert({ code: `P1529${RUN}${Math.random().toString(36).slice(2, 6)}`.toUpperCase(), event_id: ev.id }).select('id').single();
  if (error) throw new Error(`transcribe_rooms: ${error.message}`);
  ledger.rooms.push(data.id as string);
  return data.id as string;
}

/**
 * The cleaner's sweep (transcribe_room_sweep_tick, a cron on TEST) closes a room in which nobody is recording, and a closed room
 * makes no clean jobs for later rounds. A real evening always has someone recording; this keeps one open member (the host's own
 * transcription seat, never seated in a round) fresh so the seeded room behaves like a room with a live recorder.
 */
export async function keepRoomOpen(ledger: Ledger, hostUser: TestUser, roomId: string): Promise<() => void> {
  assertSelfHostedTest();
  const { data: s, error: se } = await supabaseAdmin.from('clarity_sessions')
    .insert({ code: `P1529K${RUN}${Math.random().toString(36).slice(2, 6)}`.slice(0, 20).toUpperCase(), creator_name: hostUser.name, creator_profile_id: hostUser.user.id })
    .select('id').single();
  if (se) throw new Error(`keeper session: ${se.message}`);
  ledger.sessions.push(s.id as string);
  const { data: m, error: me } = await supabaseAdmin.from('transcribe_room_members').insert({
    room_id: roomId, profile_id: hostUser.user.id, display_name: hostUser.name, session_id: s.id, last_seen_at: new Date().toISOString(),
  }).select('id').single();
  if (me) throw new Error(`keeper member: ${me.message}`);
  const timer = setInterval(() => {
    void supabaseAdmin.from('transcribe_room_members').update({ last_seen_at: new Date().toISOString(), capture_ended_at: null }).eq('id', m.id).then(() => undefined);
  }, 45_000);
  return () => clearInterval(timer);
}

// ── round material ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface FixtureLine { who: 'owner' | 'partner' | 'observer'; text: string }
export function fixtureLines(count: number): FixtureLine[] {
  const all = (JSON.parse(readFileSync(resolve(process.cwd(), 'scripts/fixtures/p1529-round-transcript.json'), 'utf8')) as { lines: FixtureLine[] }).lines;
  // 128 lines, then the first (count - 128) again: the 192-line shape the cost budget names.
  return count <= all.length ? all.slice(0, count) : [...all, ...all.slice(0, count - all.length)];
}

/**
 * Posts one table's lines into its round thread the way the cleaner does: claim the table's clean job (`processing`, attempt 1, which
 * is what the claim writes), post_clean_round, then mark it completed. `who` maps to the owner, the partner or an observer's transcribe
 * member id. Returns the number of messages post_clean_round reports.
 */
export async function postRoundLines(
  roundId: string, tableNo: number,
  speakers: { owner: string; partner: string; observer?: string },
  lines: FixtureLine[],
): Promise<number> {
  assertSelfHostedTest();
  const { data: job, error } = await supabaseAdmin.from('transcribe_round_clean_jobs').select('id, status, attempts').eq('round_id', roundId).eq('table_no', tableNo).maybeSingle();
  if (error || !job) throw new Error(`no clean job for round ${roundId} table ${tableNo}: ${error?.message ?? 'none created (the cut found no consenting seated member)'}`);
  const claim = await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'processing', attempts: 1, claimed_at: new Date().toISOString() }).eq('id', job.id);
  if (claim.error) throw new Error(`claim: ${claim.error.message}`);
  const base = 1_800_000_000_000 + Math.floor(Math.random() * 1_000_000);
  let posted = 0;
  const per = 64;
  for (let i = 0; i < lines.length; i += per) {
    const items = lines.slice(i, i + per).map((l, k) => ({
      member_id: l.who === 'owner' ? speakers.owner : l.who === 'partner' ? speakers.partner : (speakers.observer ?? speakers.partner),
      chunk_ms: base + (i + k) * 1000, text: l.text,
    }));
    const res = await supabaseAdmin.rpc('post_clean_round', { p_job_id: job.id, p_attempt: 1, p_items: items });
    if (res.error) throw new Error(`post_clean_round: ${res.error.message}`);
    posted += res.data as number;
  }
  const done = await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', job.id);
  if (done.error) throw new Error(`complete job: ${done.error.message}`);
  return posted;
}

// ── seats ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A table whose round had no usable recording: the clean job finishes with nothing posted. */
export async function completeJobEmpty(roundId: string, tableNo: number): Promise<void> {
  assertSelfHostedTest();
  const { error } = await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('round_id', roundId).eq('table_no', tableNo);
  if (error) throw new Error(`complete empty job: ${error.message}`);
}

export interface SeatRow { round_no: number; table_no: number; role: 'first' | 'second' | 'observer'; profile_id: string; room_member_id: string }

/** All saved seats of an event, counted rounds only, as profile ids. Service role: ground truth. */
export async function savedSeats(eventId: string): Promise<SeatRow[]> {
  const { data: rounds } = await supabaseAdmin.from('event_rounds').select('id, round_no, showcase').eq('event_id', eventId).order('round_no');
  const out: SeatRow[] = [];
  let counted = 0;
  for (const r of rounds ?? []) {
    if (r.showcase) continue;
    counted += 1;
    const { data: seats } = await supabaseAdmin.from('event_round_seats').select('table_no, role, room_member_id, event_room_members(profile_id)').eq('round_id', r.id);
    for (const s of seats ?? []) {
      const m = s.event_room_members as unknown as { profile_id: string } | { profile_id: string }[] | null;
      const pid = Array.isArray(m) ? m[0]?.profile_id : m?.profile_id;
      out.push({ round_no: counted, table_no: s.table_no as number, role: s.role as SeatRow['role'], profile_id: pid as string, room_member_id: s.room_member_id as string });
    }
  }
  return out;
}

export async function roundIdByNo(eventId: string, countedNo: number): Promise<string> {
  const { data: rounds } = await supabaseAdmin.from('event_rounds').select('id, showcase').eq('event_id', eventId).order('round_no');
  const counted = (rounds ?? []).filter((r) => !r.showcase);
  const r = counted[countedNo - 1];
  if (!r) throw new Error(`no counted round ${countedNo} on ${eventId}`);
  return r.id as string;
}

/** Moves a round's start back so its clock is over (the repo's way to avoid waiting real minutes). */
export async function backdateRound(roundId: string, msAgo: number): Promise<void> {
  const { error } = await supabaseAdmin.from('event_rounds').update({ started_at: new Date(Date.now() - msAgo).toISOString() }).eq('id', roundId);
  if (error) throw new Error(`backdate: ${error.message}`);
}

/**
 * Makes a round's clock be over without moving its start: every part is cut to its minimum (2 minutes in all; the round must have started more than that ago). (Moving started_at back would put the start
 * before the canvases were published, and the owner's update state reads "published" for a version older than the round.)
 */
export async function endClock(roundId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('event_rounds').update({ seating_s: 0, first_s: 60, second_s: 60, observer_s: 0 }).eq('id', roundId);
  if (error) throw new Error(`endClock: ${error.message}`);
}

// ── cleanup ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CleanupReport { step: string; count: number }

/** Deletes exactly what the ledger holds, on TEST. Returns what was removed, for the report. */
export async function cleanup(ledger: Ledger): Promise<CleanupReport[]> {
  assertSelfHostedTest();
  const report: CleanupReport[] = [];
  const ownerIds = ledger.users.map((u) => u.user.id);
  // the model-ledger rows of our runs (their owner_id would become NULL on user delete, leaving them behind)
  if (ownerIds.length) {
    const { data: runs } = await supabaseAdmin.from('canvas_draft_runs').select('spend_id').in('owner_id', ownerIds);
    const spendIds = (runs ?? []).map((r) => r.spend_id as string | null).filter((x): x is string => !!x);
    if (spendIds.length) {
      const { error } = await supabaseAdmin.from('mirror_ai_spend').delete().in('id', spendIds);
      report.push({ step: error ? `mirror_ai_spend (ERROR ${error.message})` : 'mirror_ai_spend rows of our runs', count: spendIds.length });
    }
  }
  // rooms first: events -> transcribe_rooms is ON DELETE SET NULL and a guard refuses that update
  if (ledger.rooms.length) {
    await supabaseAdmin.from('transcribe_rooms').delete().in('id', ledger.rooms);
    report.push({ step: 'transcribe_rooms (cascade members, messages)', count: ledger.rooms.length });
  }
  // the confirmation email the registration path sends logs a row that references the event
  const evIds = ledger.events.map((e) => e.id);
  if (evIds.length) {
    const { data: logs } = await supabaseAdmin.from('email_send_log').delete().in('event_id', evIds).select('id');
    report.push({ step: 'email_send_log rows of our events', count: logs?.length ?? 0 });
  }
  for (const ev of ledger.events) await deleteTestEvent(ev.id);
  report.push({ step: 'events (cascade: rsvps, rounds, seats, room members, answers, canvases chosen, opens, threads)', count: ledger.events.length });
  if (ledger.sessions.length) {
    await supabaseAdmin.from('clarity_sessions').delete().in('id', ledger.sessions);
    report.push({ step: 'clarity_sessions (transcription stand-ins)', count: ledger.sessions.length });
  }
  if (ledger.canvases.length) {
    await supabaseAdmin.from('canvases').delete().in('id', ledger.canvases);
    report.push({ step: 'canvases (cascade versions, drafts, audience)', count: ledger.canvases.length });
  }
  if (ledger.points.length) {
    await supabaseAdmin.from('points').delete().in('id', ledger.points);
    report.push({ step: 'points seeded for canvases', count: ledger.points.length });
  }
  for (const u of ledger.users) {
    try { await deleteTestUser(u.user.id); } catch { /* reported by the leftover check */ }
  }
  report.push({ step: 'auth users + profiles', count: ledger.users.length });
  return report;
}

/** Rows that should be gone after cleanup, for the leftover check: zero everywhere is the pass. */
export async function leftovers(ledger: Ledger): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const count = async (table: string, col: string, ids: string[]) => {
    if (!ids.length) return 0;
    const { count: n } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true }).in(col, ids);
    return n ?? 0;
  };
  out.events = await count('events', 'id', ledger.events.map((e) => e.id));
  out.profiles = await count('profiles', 'id', ledger.users.map((u) => u.user.id));
  out.canvases = await count('canvases', 'id', ledger.canvases);
  out.points = await count('points', 'id', ledger.points);
  out.transcribe_rooms = await count('transcribe_rooms', 'id', ledger.rooms);
  out.clarity_sessions = await count('clarity_sessions', 'id', ledger.sessions);
  out.canvas_draft_runs = await count('canvas_draft_runs', 'owner_id', ledger.users.map((u) => u.user.id));
  return out;
}

export { deleteTestUser, seedRoomMember };
