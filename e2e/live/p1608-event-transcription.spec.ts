/**
 * @file p1608-event-transcription.spec.ts
 * @description P1608: the whole transcription chain on self-hosted TEST with real speech and no people.
 *
 *   3 attendees, each in their OWN Chromium whose fake microphone plays one person's recorded clip, tap Transcribe in the
 *   real UI; the host starts round 1 and round 2 (round 2 adds a 4th person who has no recording); everyone taps End;
 *   the round-clean jobs run; the test reads the two round threads and checks every expected phrase (taken from the
 *   corpus's HUMAN annotation, never from Gemini) sits under the right person and under nobody else.
 *
 * THIS TEST SPENDS MONEY (paid Gemini: live slices and the clean job). Run it only through
 *   npm run test:e2e:p1608
 * which uses its own config (retries 0, refuses anything but the active self-hosted TEST server, takes the P1607 slot).
 * The default config ignores e2e/live/. The test never calls the worker's /sweep, never writes the shared posting switch,
 * and processes only the jobs of its own event.
 *
 * Environment knobs: P1608_CACHE (clip cache dir), P1608_DISPATCH = auto (default) | chain | direct,
 * P1608_PREFLIGHT_BREAK = no-fake-device (proves the preflight fails; stops before any app or paid call),
 * P1608_DRY_RUN = 1 (everything free: preflight, users, event, joining the room, seating; no Transcribe tap, no paid call),
 * P1608_RULE_OFF = 1 (afterwards runs the rule-off control: one more paid clean, see scripts/p1608-rule-off-control.py).

 */
import { test, chromium, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from '../helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from '../helpers/test-event';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { ok, purgeChatFor, signIn, type SignedIn } from '../helpers/test-chat';
import { envelopeDb, readWav16, scorePreflight } from '../helpers/p1608-audio';
import { evaluate, formatReport, type Expected, type JobInfo, type RunOutput } from '../helpers/p1608-matcher';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = path.join(ROOT, 'test-results-p1608');
const STATE_FILE = path.join(OUT_DIR, 'live-state.json');
const CACHE = process.env.P1608_CACHE ?? path.join(homedir(), '.cache', 'cp-p1608-ami');
const GCP_PROJECT = 'gen-lang-client-0869694595';
const WORKER = 'transcribe-room-batch-test';
const WORKER_REGION = 'us-east4';
const DISPATCH = (process.env.P1608_DISPATCH ?? 'auto') as 'auto' | 'chain' | 'direct';
const BREAK = process.env.P1608_PREFLIGHT_BREAK ?? '';
const DRY = process.env.P1608_DRY_RUN === '1';
const PEOPLE = ['A', 'B', 'C'] as const;
type Who = (typeof PEOPLE)[number];

interface Corpus {
  attribution: string;
  speakers: Record<Who, { clip: { file: string; sha256: string }; round1: { text: string; start: number }[]; round2: { text: string; start: number }[] }>;
}
const corpus: Corpus = JSON.parse(readFileSync(path.join(ROOT, 'e2e/p1608/corpus.json'), 'utf8'));
const clipPath = (w: Who) => path.join(CACHE, 'clips', corpus.speakers[w].clip.file);
const expected: Expected = Object.fromEntries(PEOPLE.map((w) => [w, {
  round1: corpus.speakers[w].round1.map((p) => ({ text: p.text, first60: p.start < 80 })),
  round2: corpus.speakers[w].round2.map((p) => ({ text: p.text })),
}]));

const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const log = (m: string) => console.log(`[P1608 ${new Date().toISOString().slice(11, 19)}] ${m}`);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const sleepUntil = async (ms: number) => { const d = ms - Date.now(); if (d > 0) await sleep(d); };

// ---- state kept for cleanup, including after a crash ----
const browsers: Browser[] = [];
const contexts: BrowserContext[] = [];
let host: TestUser | undefined;
const users: Partial<Record<Who | 'D', TestUser>> = {};
let event: TestEvent | undefined;
const sessionIds: string[] = [];
const persist = () => {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify({
    pid: process.pid, eventId: event?.id, hostId: host?.user.id,
    userIds: Object.values(users).filter(Boolean).map((u) => u!.user.id), sessionIds,
  }));
};

async function cleanup(state: { eventId?: string; hostId?: string; userIds: string[]; sessionIds: string[] }): Promise<void> {
  const step = async (what: string, fn: () => unknown) => { try { await fn(); } catch (e) { log(`cleanup: ${what} failed: ${String(e).slice(0, 120)}`); } };
  if (state.eventId) {
    // the room first: ends nothing new, and its clean jobs go with it (ON DELETE CASCADE), so no paid job can start after this
    await step('rooms', () => supabaseAdmin.from('transcribe_rooms').delete().eq('event_id', state.eventId!));
  }
  const ids = [state.hostId, ...state.userIds].filter(Boolean) as string[];
  if (state.sessionIds.length) await step('sessions', () => supabaseAdmin.from('clarity_sessions').delete().in('id', state.sessionIds));
  await step('chat', () => purgeChatFor(ids));
  if (state.eventId) await step('event', () => deleteTestEvent(state.eventId!));
  for (const id of ids) await step('user', () => deleteTestUser(id));
}

// ---- helpers ----
function gcloud(args: string[]): string {
  return execFileSync('gcloud', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
}

const fakeMicArgs = (file: string, withDevice = true) => [
  ...(withDevice ? ['--use-fake-device-for-media-stream'] : []),
  `--use-file-for-fake-audio-capture=${file}%noloop`,
  '--use-fake-ui-for-media-stream',
];
const launchWith = (args: string[]) => chromium.launch({ channel: 'chromium', headless: true, args });

async function recordInPage(page: Page, seconds: number): Promise<{ samples: number[]; sampleRate: number }> {
  return page.evaluate(async (secs: number) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); // the app's own constraints
    const ctx = new AudioContext();
    await ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    src.connect(proc); proc.connect(ctx.destination);
    await new Promise((r) => setTimeout(r, secs * 1000));
    proc.disconnect(); src.disconnect(); stream.getTracks().forEach((t) => t.stop());
    const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    const sampleRate = ctx.sampleRate;
    await ctx.close();
    return { samples: Array.from(out), sampleRate };
  }, seconds);
}

/**
 * Preflight, before the app or any paid call: a throwaway Chromium per person, launched with EXACTLY the flags the real
 * browser will get but a 6 s excerpt of the person's own first phrase, records on a blank local page. Each recording must
 * look like its own excerpt and unlike the other two, so a misconfigured flag can never send the real microphone (or the
 * wrong file) to TEST and Gemini. Returns nothing; throws with the reason.
 */
async function preflight(): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), 'p1608-pre-'));
  const server = createServer((_, res) => { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>p1608 preflight</title>'); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  try {
    const refs: Record<string, number[]> = {};
    const idents: Record<string, string> = {};
    for (const w of PEOPLE) {
      const first = Math.min(...corpus.speakers[w].round1.map((p) => p.start));
      idents[w] = path.join(dir, `ident-${w}.wav`);
      const r = spawnSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-ss', String(Math.max(0, first - 0.5)), '-t', '6', '-i', clipPath(w), '-ac', '1', '-ar', '16000', idents[w]]);
      if (r.status !== 0) throw new Error(`preflight: ffmpeg could not cut ${w}'s excerpt: ${r.stderr}`);
      const wav = readWav16(readFileSync(idents[w]));
      refs[w] = envelopeDb(wav.samples, wav.sampleRate);
    }
    const captured: Record<string, number[]> = {};
    for (const w of PEOPLE) {
      const noDevice = BREAK === 'no-fake-device';
      const b = await launchWith(fakeMicArgs(idents[w], !noDevice));
      try {
        const p = await b.newPage();
        await p.goto(url);
        const rec = await recordInPage(p, 7);
        captured[w] = envelopeDb(rec.samples, rec.sampleRate);
      } finally { await b.close(); }
    }
    const scores = scorePreflight(captured, refs);
    for (const s of scores) log(`preflight ${s.person}: own r=${s.own.toFixed(2)}, best other r=${s.bestOther.toFixed(2)} ${s.ok ? 'ok' : 'FAIL'}`);
    const bad = scores.filter((s) => !s.ok);
    if (bad.length) throw new Error(`PREFLIGHT FAILED before the app or any paid call: ${bad.map((s) => s.reason).join(' | ')}`);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function sha256(file: string): string { return createHash('sha256').update(readFileSync(file)).digest('hex'); }

interface Worker { url: string }
/** The test worker exists, can be reached with the founder's gcloud login, and reads the same database as the test. */
function checkWorker(): Worker {
  let raw: string;
  try {
    raw = gcloud(['run', 'services', 'describe', WORKER, '--project', GCP_PROJECT, '--region', WORKER_REGION, '--format=json']);
  } catch (e) {
    throw new Error(`cannot read Cloud Run service ${WORKER} (${GCP_PROJECT}, ${WORKER_REGION}): ${String((e as Error).message).split('\n').slice(0, 2).join(' ')}. If your gcloud login expired: gcloud auth login`);
  }
  const svc = JSON.parse(raw);
  const env: { name: string; value?: string }[] = svc.spec.template.spec.containers[0].env ?? [];
  const dbUrl = env.find((e) => e.name === 'SUPABASE_URL')?.value?.replace(/\/$/, '');
  const mine = (process.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!dbUrl || dbUrl !== mine) throw new Error(`worker ${WORKER} reads a different database than this test (a wrong database answers 200 claimed:false); fix the worker's SUPABASE_URL, not the test`);
  return { url: svc.status.url as string };
}

let tokenCache: { token: string; at: number } | null = null;
function identityToken(): string {
  if (!tokenCache || Date.now() - tokenCache.at > 30 * 60_000) tokenCache = { token: gcloud(['auth', 'print-identity-token']).trim(), at: Date.now() };
  return tokenCache.token;
}

test.describe('P1608 transcription end to end', () => {
  test.beforeAll(async () => {
    // a crashed earlier run left its state behind: clean it before doing anything (its room may still start paid jobs)
    if (existsSync(STATE_FILE)) {
      const old = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
      let alive = false;
      try { process.kill(old.pid, 0); alive = old.pid !== process.pid; } catch { /* gone */ }
      if (!alive) { log(`cleaning up a crashed earlier run (event ${old.eventId})`); await cleanup({ ...old, userIds: old.userIds ?? [], sessionIds: old.sessionIds ?? [] }); rmSync(STATE_FILE, { force: true }); }
    }
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    // browsers first: a closed tab stops capturing, then the room (and its jobs) is deleted
    for (const c of contexts) await c.close().catch(() => undefined);
    for (const b of browsers) await b.close().catch(() => undefined);
    await cleanup({
      eventId: event?.id, hostId: host?.user.id,
      userIds: Object.values(users).filter(Boolean).map((u) => u!.user.id), sessionIds,
    });
    rmSync(STATE_FILE, { force: true });
  });

  test('3 attendees speak through their own fake microphones; the threads hold the right words under the right people', async ({ browserName: _browserName }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL!;
    mkdirSync(OUT_DIR, { recursive: true });

    // 0. clips are the ones the corpus names (no network)
    for (const w of PEOPLE) {
      expect(existsSync(clipPath(w)), `clip for ${w} missing: run python3 scripts/p1608-ami-corpus.py build --meeting <id> (cache ${CACHE})`).toBe(true);
      expect(sha256(clipPath(w)), `clip for ${w} does not match corpus.json`).toBe(corpus.speakers[w].clip.sha256);
    }
    // 1. preflight on a blank page, local only
    await preflight();
    if (BREAK) throw new Error(`P1608_PREFLIGHT_BREAK=${BREAK} was set but the preflight passed: the preflight cannot detect it`);

    // 2. network reads, no cost: the worker, the posting switch
    const worker = checkWorker();
    const { data: sw, error: swErr } = await supabaseAdmin.from('transcribe_channel_posting').select('enabled, enabled_at').eq('singleton', true).maybeSingle();
    expect(swErr, `posting switch: ${swErr?.message}`).toBeNull();
    const enabledAt = sw?.enabled_at ? Date.parse(sw.enabled_at as string) : NaN;
    expect(sw?.enabled === true && enabledAt < Date.now() - 60_000,
      'transcribe_channel_posting must be enabled with enabled_at in the past. The test never writes it (a write takes the whole server, P1607). Switch it on, wait a minute, run again.').toBe(true);

    // 3. fixtures: hidden event (P1603), host, A, B, C and the seeded D
    host = await createTestUser({ name: `P1608 Host ${RUN}` });
    for (const k of [...PEOPLE, 'D'] as const) users[k] = await createTestUser({ name: `P1608 Person ${k} ${RUN}` });
    event = await createTestEvent(host.user.id, new Date(), { title: `P1608 Event ${RUN}`, isHidden: true });
    persist();
    for (const k of [...PEOPLE, 'D'] as const) await rsvpToEvent(event.id, users[k]!.user.id);
    const hostC: SignedIn = await signIn(host);

    // 4. A, B, C: own Chromium, own file; join the room through the real ready page (free), then tap together
    const pages: Record<string, Page> = {};
    for (const w of PEOPLE) {
      const b = await launchWith(fakeMicArgs(clipPath(w)));
      browsers.push(b);
      const ctx = await b.newContext({ baseURL, storageState: testInfo.project.use.storageState as string });
      contexts.push(ctx);
      const page = await ctx.newPage();
      await setTestSession(page, users[w]!.email);
      await page.goto(`/events/${event.slug}/ready`);
      await page.getByRole('button', { name: /continue/i }).click();
      await expect(page).toHaveURL(new RegExp(`/events/${event.slug}/meet`), { timeout: 20_000 });
      await expect(page.getByTestId('room-transcribe-start')).toBeVisible({ timeout: 20_000 });
      pages[w] = page;
    }
    const memberOf: Record<string, string> = {};
    await expect.poll(async () => {
      const { data } = await supabaseAdmin.from('event_room_members').select('id, profile_id').eq('event_id', event!.id);
      for (const w of PEOPLE) memberOf[w] = (data ?? []).find((r) => r.profile_id === users[w]!.user.id)?.id as string;
      return PEOPLE.every((w) => !!memberOf[w]);
    }, { message: 'A, B and C each have an event room member row', timeout: 30_000 }).toBe(true);

    if (DRY) {
      log('DRY RUN: no Transcribe tap, no capture, no paid call. Seating through the host RPC, then cleanup.');
      const seat = (k: string, t: number, r: string) => ({ m: memberOf[k], t, r });
      const r1 = await ok<string>(hostC.client.rpc('host_start_round', { p_event_id: event.id, p_round_no: 1, p_group_size: 3, p_seats: [seat('A', 1, 'first'), seat('B', 1, 'second'), seat('C', 1, 'observer')] }), 'host_start_round 1');
      expect(r1).toBeTruthy();
      await ok(hostC.client.rpc('host_end_rounds', { p_event_id: event.id }), 'host_end_rounds');
      const { count } = await supabaseAdmin.from('transcribe_round_clean_jobs').select('id', { count: 'exact', head: true }).eq('event_id', event.id);
      expect(count, 'a dry run creates no clean job (nobody consented to Transcribe)').toBe(0);
      log('DRY RUN complete: preflight, fixtures, joining the room and seating work; nothing paid was called');
      return;
    }

    // ---- from here on every step may cost money ----
    const taps: Record<string, number> = {};
    await Promise.all(PEOPLE.map(async (w) => {
      taps[w] = Date.now();
      await pages[w].getByTestId('room-transcribe-start').click();
    }));
    const spread = (Math.max(...Object.values(taps)) - Math.min(...Object.values(taps))) / 1000;
    for (const w of PEOPLE) await expect(pages[w].getByTestId('room-capture-bar')).toBeVisible({ timeout: 20_000 });
    log(`taps ${spread.toFixed(2)} s apart`);
    const T0 = Math.min(...Object.values(taps));
    const at = (t: number) => T0 + t * 1000;
    const seat = (k: string, t: number, r: string) => ({ m: memberOf[k], t, r });
    if (spread > 3) {
      log(`INVALID RUN: taps ${spread.toFixed(1)} s apart (limit 3 s); stopping before the schedule to save paid work`);
      throw new Error(`INVALID RUN: Transcribe taps were ${spread.toFixed(1)} s apart (limit 3 s). Not a product failure; run again.`);
    }

    // 5. the schedule on the shared clip timeline
    await sleepUntil(at(20));
    const round1 = await ok<string>(hostC.client.rpc('host_start_round', { p_event_id: event.id, p_round_no: 1, p_group_size: 3, p_seats: [seat('A', 1, 'first'), seat('B', 1, 'second'), seat('C', 1, 'observer')] }), 'host_start_round 1');
    log('round 1 started');

    await sleepUntil(at(100));
    // D: RSVP'd, room member, consented Transcribe row, no recording (a real tap would start capture)
    const seatMovesBefore = (await supabaseAdmin.from('transcribe_round_seat_moves').select('round_id', { count: 'exact', head: true }).eq('round_id', round1)).count;
    const { data: dMember } = await supabaseAdmin.from('event_room_members').insert({ event_id: event.id, display_name: users.D!.name, profile_id: users.D!.user.id }).select('id').single();
    memberOf.D = dMember!.id as string;
    const { data: troom } = await supabaseAdmin.from('transcribe_rooms').select('id').eq('event_id', event.id).single();
    const { data: dSession, error: dsErr } = await supabaseAdmin.from('clarity_sessions').insert({ code: `P1608${RUN}D`.slice(0, 20), creator_name: 'P1608 D', creator_profile_id: users.D!.user.id }).select('id').single();
    expect(dsErr, `D session: ${dsErr?.message}`).toBeNull();
    sessionIds.push(dSession!.id as string); persist();
    const { error: dtErr } = await supabaseAdmin.from('transcribe_room_members').insert({ room_id: troom!.id, profile_id: users.D!.user.id, display_name: users.D!.name, session_id: dSession!.id, consent_given_at: new Date().toISOString() });
    expect(dtErr, `D transcribe member: ${dtErr?.message}`).toBeNull();
    const seatMovesAfter = (await supabaseAdmin.from('transcribe_round_seat_moves').select('round_id', { count: 'exact', head: true }).eq('round_id', round1)).count;
    expect(seatMovesAfter, 'seeding D must not log a seat move').toBe(seatMovesBefore);

    await sleepUntil(at(140));
    const round2 = await ok<string>(hostC.client.rpc('host_start_round', { p_event_id: event.id, p_round_no: 2, p_group_size: 4, p_seats: [seat('A', 1, 'first'), seat('B', 1, 'second'), seat('C', 1, 'observer'), seat('D', 1, 'observer')] }), 'host_start_round 2');
    log('round 2 started (round 1 cut)');

    await sleepUntil(at(240));
    await ok(hostC.client.rpc('host_end_rounds', { p_event_id: event.id }), 'host_end_rounds');
    log('round 2 closed');
    await Promise.all(PEOPLE.map((w) => pages[w].getByTestId('room-capture-bar-end').click()));
    log('A, B, C tapped End');
    for (const c of contexts) await c.close().catch(() => undefined); // nothing records after End; free the processes
    contexts.length = 0;

    // 6. the jobs: only this event's, never /sweep
    const jobInfo = new Map<string, JobInfo & { direct: boolean; maxAttempts: number }>();
    const lastPost = new Map<string, number>();
    const deadline = Date.now() + 18 * 60_000;
    let finished = false;
    while (Date.now() < deadline && !finished) {
      const { data: rows } = await supabaseAdmin.from('transcribe_round_clean_jobs')
        .select('id, kind, round_id, status, attempts, not_before, dispatched_at, claimed_at, completed_at, error')
        .eq('event_id', event.id).eq('kind', 'round');
      for (const j of rows ?? []) {
        const label = j.round_id === round1 ? 'round 1' : j.round_id === round2 ? 'round 2' : `round ${String(j.round_id).slice(0, 8)}`;
        const prev = jobInfo.get(j.id as string);
        const dur = j.completed_at && j.claimed_at ? (Date.parse(j.completed_at as string) - Date.parse(j.claimed_at as string)) / 1000 : null;
        jobInfo.set(j.id as string, { id: j.id as string, label, status: j.status as string, attempts: j.attempts as number, durationS: dur ?? prev?.durationS ?? null, direct: prev?.direct ?? false, maxAttempts: Math.max(prev?.maxAttempts ?? 0, j.attempts as number) });
        const due = Date.parse(j.not_before as string);
        const waitedForChain = Date.now() > due + 90_000;
        const mayPost = DISPATCH === 'direct' ? Date.now() >= due : DISPATCH === 'auto' ? waitedForChain : false;
        if (j.status === 'pending' && mayPost && Date.now() - (lastPost.get(j.id as string) ?? 0) > 20_000) {
          lastPost.set(j.id as string, Date.now());
          const res = await fetch(`${worker.url}/process`, { method: 'POST', headers: { Authorization: `Bearer ${identityToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id: j.id }) });
          const body = await res.json().catch(() => ({} as Record<string, unknown>));
          jobInfo.get(j.id as string)!.direct = true;
          if (body.claimed === true) { log(`${label}: /process claimed (HTTP ${res.status})`); } else {
            log(`${label}: /process HTTP ${res.status} claimed=${String(body.claimed)} (deferred or wrong database)`);
          }
        }
      }
      const round = (rows ?? []).filter((r) => r.kind === 'round');
      finished = round.length >= 2 && round.every((r) => r.status === 'completed' || r.status === 'failed');
      if (!finished) await sleep(5_000);
    }
    expect(finished, 'both round jobs reached a final status within 18 minutes').toBe(true);

    // 7. read the threads (database ground truth) and look at the chat in the host's browser
    const personOf = new Map<string, string>(PEOPLE.map((w) => [users[w]!.user.id, w]));
    const readThread = async (roundId: string) => {
      const { data: th } = await supabaseAdmin.from('chat_round_threads').select('conversation_id, root_message_id').eq('round_id', roundId).eq('table_no', 1).maybeSingle();
      expect(th, `a thread exists for round ${roundId.slice(0, 8)}`).toBeTruthy();
      const { data: root } = await supabaseAdmin.from('chat_messages').select('body').eq('id', th!.root_message_id).single();
      const { data: msgs } = await supabaseAdmin.from('chat_messages').select('author_id, body, created_at').eq('thread_root_id', th!.root_message_id).order('created_at');
      const textByPerson: Record<string, string> = {};
      for (const m of msgs ?? []) {
        const who = personOf.get(m.author_id as string) ?? `other:${String(m.author_id).slice(0, 8)}`;
        textByPerson[who] = `${textByPerson[who] ?? ''} ${m.body ?? ''}`.trim();
      }
      return { thread: { title: (root?.body as string) ?? '', textByPerson }, conversationId: th!.conversation_id as string };
    };
    const r1 = await readThread(round1);
    const r2 = await readThread(round2);

    let uiNote = 'host browser read: not attempted';
    try {
      const hb = await launchWith([]); browsers.push(hb);
      const hctx = await hb.newContext({ baseURL, storageState: testInfo.project.use.storageState as string });
      contexts.push(hctx);
      const hp = await hctx.newPage();
      await setTestSession(hp, host.email);
      await hp.goto(`/chats/c/${r1.conversationId}`);
      await expect(hp.getByTestId('conversation').getByTestId('system-title').filter({ hasText: 'Round 1' }).first()).toBeVisible({ timeout: 30_000 });
      uiNote = 'host browser read: the Round 1 title is visible in the event channel';
    } catch (e) { uiNote = `host browser read: title NOT seen (${String(e).split('\n')[0].slice(0, 100)}); the assertions use the database rows`; }

    const output: RunOutput = {
      expected, round1: r1.thread, round2: r2.thread,
      jobs: [...jobInfo.values()].map((j) => ({ id: j.id, label: j.label, status: j.status, attempts: j.maxAttempts, durationS: j.durationS })),
      tapSpreadS: spread,
    };
    const verdict = evaluate(output);
    const direct = [...jobInfo.values()].filter((j) => j.direct).map((j) => j.label);
    const report = [
      formatReport(output, verdict),
      `dispatch: ${direct.length ? `NOT exercised for ${direct.join(', ')}: this test posted the job ids to the worker's /process itself` : 'the normal chain (tick, enqueue, Cloud Tasks) delivered every job'}`,
      uiNote,
      `mic-minutes sent to the clean pass: about ${(3 * 4).toFixed(0)} (3 mics x 4 min); live slices about 15 mic-minutes; the first run's real usage goes next to the cost budget in the spec`,
      `attribution: ${corpus.attribution}`,
    ].join('\n');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    writeFileSync(path.join(OUT_DIR, `report-${stamp}.txt`), report + '\n');
    writeFileSync(path.join(OUT_DIR, `run-output-${stamp}.json`), JSON.stringify(output, null, 2));
    console.log('\n' + report + '\n');

    if (process.env.P1608_RULE_OFF === '1') {
      log('rule-off control requested: see scripts/p1608-rule-off-control.py (a separate, paid command; it reads the downloaded chunks of this run)');
    }

    expect(verdict.invalid, verdict.invalid ?? '').toBeNull();
    expect(verdict.failures, verdict.failures.join('\n')).toEqual([]);
  });
});
