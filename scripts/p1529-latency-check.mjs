#!/usr/bin/env node
/**
 * P1529 Done-When: drafting latency, tap to ready, with 12 Clarity Canvas owners tapping "Make my next version" at once.
 *
 * TEST ONLY. Refuses to run unless VITE_SUPABASE_URL (from .env.test.local) is exactly the self-hosted TEST server.
 * It seeds its OWN uniquely named event in the sales-mastermind series with 12 tables (12 owners with a published canvas shared with
 * the event, 12 partners), posts a round thread of 192 line rows per table (the 128-line fixture plus its first 64 lines, attributed to
 * the owner and the partner by the fixture's `who`; observer lines go to the partner) through the cleaner's own post_clean_round, ends the
 * round, then for every owner AT ONCE: make_my_next_version (the real RPC, as that owner), the start call the page makes
 * (the canvas-draft edge function, real model), and the state polling the page does (get_canvas_draft_state + get_my_update_state)
 * until ready. Prints min / median / max seconds, the failure list, the cost from canvas_draft_runs -> mirror_ai_spend, how many lines
 * each run really copied, and whether the material was cut. Cleans up exactly what it created.
 *
 * Usage:  node scripts/p1529-latency-check.mjs [--owners 12] [--lines 192] [--timeout-s 420]
 * Expected cost about $0.03-0.10 per run. A run that reports more than $0.50 is flagged and the exit code is 3.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TEST_URL = 'https://136-85-1-126.sslip.io';
dotenv.config({ path: resolve(process.cwd(), '.env.test.local') });
const URL = process.env.VITE_SUPABASE_URL ?? '';
if (URL !== TEST_URL) {
  console.error(`REFUSED: VITE_SUPABASE_URL is "${URL}", not ${TEST_URL}. Nothing was run.`);
  process.exit(2);
}
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!ANON || !SERVICE) { console.error('REFUSED: missing keys in .env.test.local'); process.exit(2); }

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const OWNERS = Number(arg('owners', '12'));
const LINES = Number(arg('lines', '192'));
const TIMEOUT_S = Number(arg('timeout-s', '420'));
const PASSWORD = crypto.randomUUID();
// The accepted-terms version of the QA users' profiles (the canvas-draft function gates on profiles.accepted_terms_version). A function deployed before the v1.9 bump refuses v1.9 (TERMS_NOT_ACCEPTED);
// run with --terms v1.8 against such a deployment and say so.
const TERMS = arg('terms', 'v1.9');
const RUN = Math.random().toString(36).slice(2, 7);
const MAX_RUN_COST = 0.5;

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[p1529-latency ${new Date().toISOString().slice(11, 19)}]`, ...a);
const created = { users: [], events: [], rooms: [], sessions: [], canvases: [], points: [] };

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

async function mkUser(name) {
  const slug = `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `e2e-test-${Date.now()}-${Math.floor(Math.random() * 100000)}@gmail.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
    user_metadata: { name, slug, role: 'Test Engineer', linkedin_url: '', reason: 'Testing the Clarity Pledge', avatar_color: '#4A90E2' },
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  created.users.push(data.user.id);
  const prof = await admin.from('profiles').insert({
    id: data.user.id, email, name, slug, role: 'Test Engineer', linkedin_url: '', reason: 'Testing the Clarity Pledge', avatar_color: '#4A90E2',
    pledge_version: 2, accepted_terms_version: TERMS, banner_generation_attempted: false, is_verified: true, has_pledged: true,
  });
  if (prof.error) throw new Error(`profile: ${prof.error.message}`);
  return { id: data.user.id, email, name, slug };
}
async function clientFor(u) {
  for (let attempt = 0; ; attempt++) {
    const c = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await c.auth.signInWithPassword({ email: u.email, password: PASSWORD });
    if (!error && data.session) return { c, token: data.session.access_token };
    if (attempt >= 4) throw new Error(`sign-in ${u.email}: ${error?.message}`);
    await sleep(3000 * (attempt + 1));
  }
}
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

const POINTS = [
  ['canvas:segments', 'Small B2B software companies with 10 to 50 staff'],
  ['canvas:problem', 'New users do not understand the product in their first week'],
  ['canvas:solution', 'Short onboarding videos made to order'],
  ['canvas:channels', 'LinkedIn posts and founder introductions'],
  ['canvas:revenue', '2,400 euros for a package of 5 videos'],
  ['canvas:metrics', 'Four new clients by March'],
];

async function publishCanvas(u, c, title) {
  must(await c.rpc('canvas_draft_open', { p_from_version: null }), 'canvas_draft_open');
  const { data: d } = await admin.from('canvas_drafts').select('id,revision,canvas_id,canvas_name,version_name').eq('owner_id', u.id).eq('state', 'open').is('base_version_id', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  for (const [box, statement] of POINTS) {
    const pt = must(await admin.from('points').insert({ statement: `${statement} (${title})`, first_validator_id: u.id, visibility: 'private', tags: [], system_tags: [box, `canvas_${d.version_name}`] }).select('id').single(), 'point');
    created.points.push(pt.id);
    must(await admin.from('canvas_draft_points').insert({ draft_id: d.id, point_id: pt.id }), 'draft point');
  }
  must(await c.rpc('canvas_draft_publish', { p_draft: d.id, p_expected_revision: d.revision }), 'publish');
  created.canvases.push(d.canvas_id);
  return { canvasId: d.canvas_id, name: d.canvas_name };
}

function fixtureLines(count) {
  const all = JSON.parse(readFileSync(resolve(process.cwd(), 'scripts/fixtures/p1529-round-transcript.json'), 'utf8')).lines;
  return count <= all.length ? all.slice(0, count) : [...all, ...all.slice(0, count - all.length)];
}

async function cleanup() {
  log('cleanup (TEST DB): removing exactly the rows this run created');
  const report = {};
  try {
    if (created.users.length) {
      const { data: runs } = await admin.from('canvas_draft_runs').select('spend_id').in('owner_id', created.users);
      const spend = (runs ?? []).map((r) => r.spend_id).filter(Boolean);
      if (spend.length) { await admin.from('mirror_ai_spend').delete().in('id', spend); report.mirror_ai_spend = spend.length; }
    }
    if (created.rooms.length) { await admin.from('transcribe_rooms').delete().in('id', created.rooms); report.transcribe_rooms = created.rooms.length; }
    if (created.events.length) {
      await admin.from('email_send_log').delete().in('event_id', created.events);
      for (const id of created.events) await admin.from('events').delete().eq('id', id);
      report.events = created.events.length;
    }
    if (created.sessions.length) { await admin.from('clarity_sessions').delete().in('id', created.sessions); report.clarity_sessions = created.sessions.length; }
    if (created.canvases.length) { await admin.from('canvases').delete().in('id', created.canvases); report.canvases = created.canvases.length; }
    if (created.points.length) { await admin.from('points').delete().in('id', created.points); report.points = created.points.length; }
    for (const id of created.users) { await admin.auth.admin.deleteUser(id).catch(() => undefined); }
    report.users = created.users.length;
  } catch (e) { log('cleanup error', e.message); }
  const left = {};
  const count = async (t, col, ids) => ids.length ? ((await admin.from(t).select('*', { count: 'exact', head: true }).in(col, ids)).count ?? 0) : 0;
  left.events = await count('events', 'id', created.events);
  left.profiles = await count('profiles', 'id', created.users);
  left.canvases = await count('canvases', 'id', created.canvases);
  left.points = await count('points', 'id', created.points);
  left.transcribe_rooms = await count('transcribe_rooms', 'id', created.rooms);
  left.clarity_sessions = await count('clarity_sessions', 'id', created.sessions);
  log('cleaned', JSON.stringify(report), 'leftovers (all 0 expected)', JSON.stringify(left));
}

let keepTimer;
async function main() {
  log(`TEST ${URL}; ${OWNERS} owners at once, ${LINES} lines per round thread`);
  const host = await mkUser(`Hana Qalat ${RUN}`);
  const hostC = await clientFor(host);
  const owners = await pool(Array.from({ length: OWNERS }, (_, i) => i), 4, (i) => mkUser(`Own${i + 1} Qalat`));
  const partners = await pool(Array.from({ length: OWNERS }, (_, i) => i), 4, (i) => mkUser(`Par${i + 1} Qalat`));
  log(`${owners.length + partners.length + 1} users created`);

  const ev = must(await admin.from('events').insert({
    slug: `test-event-${Date.now()}-p1529lat${RUN}`, title: `P1529 QA latency ${RUN}`, description: 'P1529 latency check', datetime: new Date().toISOString(),
    duration_minutes: 120, timezone: 'America/Los_Angeles', location: 'Test Location', host_id: host.id, status: 'upcoming',
    series_slug: 'sales-mastermind', preparation_enabled: true,
  }).select('id,slug').single(), 'event');
  created.events.push(ev.id);

  // owners register through the real RPC (the mastermind's questions); partners' answers + registration are written by the service role
  const ownerClients = await pool(owners, 4, async (u) => {
    const { c, token } = await clientFor(u);
    const reg = await c.rpc('register_for_event', { p_slug: ev.slug, p_participation: 'canvas_before', p_phone: 'usbc', p_hope: null, p_recording_accepted: true });
    if (reg.error) throw new Error(`register ${u.name}: ${reg.error.message}`);
    const cv = await publishCanvas(u, c, `${u.name} canvas`);
    must(await c.rpc('set_event_canvas', { p_event: ev.id, p_name: cv.name }), 'set_event_canvas');
    return { c, token, canvas: cv };
  });
  await pool(partners, 6, async (u) => {
    must(await admin.from('event_registration_answers').insert({ event_id: ev.id, profile_id: u.id, participation: 'observer', phone: 'usbc', recording_accepted_at: new Date().toISOString() }), 'answers');
    must(await admin.from('event_rsvps').insert({ event_id: ev.id, profile_id: u.id }), 'rsvp');
  });
  log('owners registered with a published canvas shared with the event');

  const room = must(await admin.from('transcribe_rooms').insert({ code: `P1529L${RUN}${Math.random().toString(36).slice(2, 5)}`.toUpperCase(), event_id: ev.id }).select('id').single(), 'room');
  created.rooms.push(room.id);
  const mkSession = async (u) => {
    const s = must(await admin.from('clarity_sessions').insert({ code: `P1529L${Math.random().toString(36).slice(2, 12)}`.toUpperCase().slice(0, 20), creator_name: u.name, creator_profile_id: u.id }).select('id').single(), 'session');
    created.sessions.push(s.id);
    return s.id;
  };
  // a keeper member so the sweep does not close the idle seeded room (the real room has a live recorder)
  const keeperMember = must(await admin.from('transcribe_room_members').insert({ room_id: room.id, profile_id: host.id, display_name: host.name, session_id: await mkSession(host), last_seen_at: new Date().toISOString() }).select('id').single(), 'keeper');
  keepTimer = setInterval(() => { void admin.from('transcribe_room_members').update({ last_seen_at: new Date().toISOString(), capture_ended_at: null }).eq('id', keeperMember.id).then(() => undefined); }, 45_000);

  const tm = new Map();
  const rm = new Map();
  for (const u of [...owners, ...partners]) {
    const m = must(await admin.from('event_room_members').insert({ event_id: ev.id, display_name: u.name, profile_id: u.id, opted_in: true, comprehension_rating: 7 }).select('id').single(), 'room member');
    rm.set(u.id, m.id);
    const t = must(await admin.from('transcribe_room_members').insert({ room_id: room.id, profile_id: u.id, display_name: u.name, session_id: await mkSession(u), consent_given_at: new Date().toISOString(), capture_ended_at: new Date().toISOString() }).select('id').single(), 'tmember');
    tm.set(u.id, t.id);
  }

  // round 1: one table per owner; then it ends (what Next round / End rounds does): the cut makes one clean job per table
  const seats = [];
  owners.forEach((o, i) => { seats.push({ m: rm.get(o.id), t: i + 1, r: 'first' }); seats.push({ m: rm.get(partners[i].id), t: i + 1, r: 'second' }); });
  const round1 = must(await hostC.c.rpc('host_start_round', { p_event_id: ev.id, p_round_no: 1, p_group_size: 3, p_seats: seats }), 'host_start_round');
  const ended = await admin.from('event_rounds').update({ ended_at: new Date().toISOString() }).eq('id', round1);
  if (ended.error) throw new Error(`end round: ${ended.error.message}`);
  log('round 1 started and ended; posting the round threads');

  const fixture = fixtureLines(LINES);
  const posted = await pool(owners, 4, async (o, i) => {
    const { data: job } = await admin.from('transcribe_round_clean_jobs').select('id').eq('round_id', round1).eq('table_no', i + 1).maybeSingle();
    if (!job) throw new Error(`no clean job for table ${i + 1}`);
    must(await admin.from('transcribe_round_clean_jobs').update({ status: 'processing', attempts: 1, claimed_at: new Date().toISOString() }).eq('id', job.id), 'claim');
    const base = 1_800_000_000_000 + Math.floor(Math.random() * 1_000_000);
    let n = 0;
    for (let k = 0; k < fixture.length; k += 64) {
      const items = fixture.slice(k, k + 64).map((l, j) => ({
        member_id: l.who === 'owner' ? tm.get(o.id) : tm.get(partners[i].id), chunk_ms: base + (k + j) * 1000, text: l.text,
      }));
      n += must(await admin.rpc('post_clean_round', { p_job_id: job.id, p_attempt: 1, p_items: items }), 'post_clean_round');
    }
    must(await admin.from('transcribe_round_clean_jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', job.id), 'complete');
    return n;
  });
  log(`threads posted: ${posted.reduce((a, b) => a + b, 0)} line rows over ${posted.length} tables (${Math.min(...posted)}-${Math.max(...posted)} per table)`);

  // ── the measurement: every owner at the same moment ────────────────────────────────────────────────────────────────
  const T0 = Date.now();
  const rows = await Promise.all(owners.map(async (o, i) => {
    const { c, token, canvas } = ownerClients[i];
    const row = { owner: o.name, ok: false, seconds: null, failure: null, runId: null, draftId: null };
    try {
      const tap = await c.rpc('make_my_next_version', { p_round: round1 });
      const tapAt = Date.now();
      if (tap.error) throw new Error(`tap: ${tap.error.message}`);
      if (tap.data?.status !== 'ok' || !tap.data.run_id) throw new Error(`tap refused: ${JSON.stringify(tap.data)}`);
      row.runId = tap.data.run_id; row.draftId = tap.data.draft_id;
      const start = await fetch(`${URL}/functions/v1/canvas-draft`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ run_id: row.runId }) });
      if (start.status !== 200 && start.status !== 202) throw new Error(`start call ${start.status}: ${(await start.text()).slice(0, 120)}`);
      row.startStatus = start.status;
      row.tapToStartMs = Date.now() - tapAt;
      for (;;) {
        if (Date.now() - tapAt > TIMEOUT_S * 1000) throw new Error(`still not ready after ${TIMEOUT_S}s`);
        await sleep(2000);
        await c.rpc('get_canvas_draft_state', { p_canvas: canvas.canvasId });
        const st = await c.rpc('get_my_update_state', { p_event: ev.id });
        const state = st.data?.state;
        if (state === 'ready') { row.ok = true; row.seconds = (Date.now() - tapAt) / 1000; break; }
        if (state === 'failed') { const r = await admin.from('canvas_draft_runs').select('error_code').eq('id', row.runId).single(); throw new Error(`run failed (${r.data?.error_code ?? 'no code'})`); }
      }
    } catch (e) { row.failure = String(e.message ?? e); row.seconds = (Date.now() - T0) / 1000; }
    return row;
  }));
  const wall = (Date.now() - T0) / 1000;

  // ── report ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  const okRows = rows.filter((r) => r.ok);
  const secs = okRows.map((r) => r.seconds).sort((a, b) => a - b);
  const median = secs.length ? (secs.length % 2 ? secs[(secs.length - 1) / 2] : (secs[secs.length / 2 - 1] + secs[secs.length / 2]) / 2) : null;
  const fmt = (n) => (n === null || n === undefined ? 'n/a' : `${n.toFixed(1)}s`);
  console.log('\n=== P1529 latency: tap to ready, %d owners at once, TEST ===', OWNERS);
  console.log(`ready: ${okRows.length} of ${rows.length}   min ${fmt(secs[0])}   median ${fmt(median)}   max ${fmt(secs[secs.length - 1])}   wall clock ${fmt(wall)}`);
  const failures = rows.filter((r) => !r.ok);
  console.log(`failures: ${failures.length}`);
  for (const f of failures) console.log(`  - ${f.owner}: ${f.failure}`);

  const runIds = rows.map((r) => r.runId).filter(Boolean);
  const { data: runs } = await admin.from('canvas_draft_runs').select('id,state,spend_id,error_code,started_at,finished_at,draft_id').in('id', runIds);
  const spendIds = (runs ?? []).map((r) => r.spend_id).filter(Boolean);
  const { data: spends } = spendIds.length ? await admin.from('mirror_ai_spend').select('id,actual_usd,reserved_usd,state').in('id', spendIds) : { data: [] };
  const costOf = new Map((spends ?? []).map((s) => [s.id, Number(s.actual_usd ?? 0)]));
  const perRun = (runs ?? []).map((r) => ({ id: r.id, state: r.state, usd: costOf.get(r.spend_id) ?? 0, model_s: r.started_at && r.finished_at ? (Date.parse(r.finished_at) - Date.parse(r.started_at)) / 1000 : null }));
  const total = perRun.reduce((a, b) => a + b.usd, 0);
  const costs = perRun.map((r) => r.usd).sort((a, b) => a - b);
  console.log(`cost (canvas_draft_runs -> mirror_ai_spend.actual_usd): total $${total.toFixed(4)} over ${perRun.length} runs; per run min $${(costs[0] ?? 0).toFixed(4)} max $${(costs[costs.length - 1] ?? 0).toFixed(4)}`);
  const model = perRun.map((r) => r.model_s).filter((x) => x !== null).sort((a, b) => a - b);
  if (model.length) console.log(`model time inside the run (started_at to finished_at): min ${fmt(model[0])} max ${fmt(model[model.length - 1])}`);
  const over = perRun.filter((r) => r.usd > MAX_RUN_COST);
  if (over.length) console.log(`!! ${over.length} run(s) cost more than $${MAX_RUN_COST}: ${over.map((r) => `${r.id} $${r.usd}`).join(', ')}`);

  // lines copied, and whether material was cut
  const copied = [];
  let cutNotes = 0;
  for (const r of rows.filter((x) => x.draftId)) {
    const d = (await admin.from('canvas_drafts').select('conversation_id,thread_root_id').eq('id', r.draftId).single()).data;
    const { count } = await admin.from('chat_messages').select('*', { count: 'exact', head: true }).eq('conversation_id', d.conversation_id).eq('thread_root_id', d.thread_root_id).eq('kind', 'forward');
    copied.push(count ?? 0);
    const { data: replies } = await admin.from('chat_messages').select('body').eq('conversation_id', d.conversation_id).eq('thread_root_id', d.thread_root_id).neq('kind', 'forward').not('body', 'is', null);
    if ((replies ?? []).some((m) => /cut for length|material was cut/i.test(m.body))) cutNotes++;
  }
  copied.sort((a, b) => a - b);
  console.log(`lines copied into each draft (forward copies, queried): min ${copied[0]} max ${copied[copied.length - 1]} (the thread held ${LINES} lines per table); runs whose reply says material was cut for length: ${cutNotes} of ${copied.length}`);
  // the round mode is live on the SERVER: the draft keeps the partner's reasoning, writes no partner price, tells no "best guess" line
  let keptPartner = 0, partnerPrice = 0, guessLines = 0, modeFlag = 0;
  for (const r of rows.filter((x) => x.draftId && x.ok)) {
    const d = (await admin.from('canvas_drafts').select('conversation_id,thread_root_id').eq('id', r.draftId).single()).data;
    const pts = (await admin.from('canvas_draft_points').select('points(statement)').eq('draft_id', r.draftId)).data ?? [];
    const text = pts.map((p) => p.points?.statement ?? '').join(' || ');
    if (/ticket|support|nice-to-have|reduc/i.test(text)) keptPartner++;
    if (/5,?000|6,?000|five thousand|six thousand/i.test(text)) partnerPrice++;
    const { data: replies } = await admin.from('chat_messages').select('body').eq('conversation_id', d.conversation_id).eq('thread_root_id', d.thread_root_id).neq('kind', 'forward').not('body', 'is', null);
    if ((replies ?? []).some((m) => /from your words "/.test(m.body))) guessLines++;
    if ((await admin.rpc('_canvas_run_is_round_update', { p_run: r.runId })).data === true) modeFlag++;
  }
  console.log(`round mode: _canvas_run_is_round_update true for ${modeFlag} of ${okRows.length} runs; drafts that kept the partner's reasoning (tickets/support/nice-to-have): ${keptPartner} of ${okRows.length}; drafts with a partner price (5,000/6,000) written: ${partnerPrice}; drafts with a "best guess" line: ${guessLines}`);
  console.log('per owner (seconds): ' + rows.map((r) => `${r.owner}=${r.ok ? r.seconds.toFixed(1) : 'FAIL'}`).join(' '));
  process.exitCode = over.length ? 3 : failures.length ? 1 : 0;
}

main().catch((e) => { console.error('latency check failed:', e.message); process.exitCode = 1; }).finally(async () => {
  if (keepTimer) clearInterval(keepTimer);
  await cleanup();
});
