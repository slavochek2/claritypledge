/**
 * @file p1536-x9-voice.spec.ts
 * @description P1536 3c X9 / S3c.6, the walk with a real recording, on hosted TEST, in a real Chromium.
 *
 * No human microphone: the audio is a WAV made with macOS `say` (speech) and a few seconds of digital silence, handed to Chromium as the fake
 * capture device (--use-file-for-fake-audio-capture). The recorder, the WAV encode, the signed upload, chat-voice's commit, the Gemini
 * transcript job, the transcript trigger and canvas-draft are all REAL; only the microphone is a file.
 *
 *   speech:  the voice button shows; the note is stored (audio row, message, queued voice run); THE TAB IS CLOSED right after the commit; the
 *            transcript lands; the run begins only after it (never earlier), runs with the real model, and the draft's points change.
 *   silence: a transcript that comes back blank fails the run at once, with no model call and no charge, tab closed as well.
 *
 * Env: P1536_BASE (the dev server on hosted TEST), P1536_X9_AUDIO_DIR (holds speech.wav and silence.wav), P1536_X9_DIR (evidence).
 * Refuses to load against anything but a TEST project.
 */
import { test, expect, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, TEST_PASSWORD, type TestUser } from './helpers/test-user';
import { isTestProjectUrl } from '../scripts/sweep-e2e-test-users';

test.skip(!isTestProjectUrl(process.env.VITE_SUPABASE_URL ?? ''), 'p1536-x9-voice: VITE_SUPABASE_URL is not a TEST project. Nothing was run.');

// The voice bucket's CORS lists the worktree ports (this one is 5100), not 5102: a recording is uploaded straight from the page to storage.
const BASE = process.env.P1536_BASE ?? 'http://localhost:5100';
const AUDIO = process.env.P1536_X9_AUDIO_DIR ?? '';
const DIR = process.env.P1536_X9_DIR ?? 'test-results/p1536-x9';
fs.mkdirSync(DIR, { recursive: true });

type Row = Record<string, unknown>;
interface Note { id: string; transcript: string | null; transcript_status: string | null; audio_duration_ms: number; thread_root_id: string | null }
interface RunRow { id: string; state: string; error_code: string | null; input_kind: string; spend_id: string | null; started_at: string | null; finished_at: string | null; trigger_message_id: string }
interface Spend { id: string; state: string; actual_usd: number | null }
const admin = supabaseAdmin;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fakeMic = (file: string) => ({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${file}`] });

/** Chromium with `file` as its microphone. The flag is per browser launch, which Playwright's `use` cannot set inside a describe, so each walk launches its own. */
async function withMic(file: string, walk: (page: Page, context: BrowserContext) => Promise<void>): Promise<void> {
  const browser: Browser = await chromium.launch(fakeMic(file));
  try {
    const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
    context.setDefaultTimeout(20_000);
    await walk(await context.newPage(), context);
  } finally {
    await browser.close();
  }
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** A new canvas draft for the user (the opener the paperclip's New canvas uses), and the address of its workspace. */
async function newCanvas(u: TestUser): Promise<{ draftId: string; threadRoot: string; conv: string; href: string }> {
  const c = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signErr } = await c.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
  if (signErr) throw new Error(`sign in: ${signErr.message}`);
  const { data, error } = await c.rpc('canvas_draft_open', { p_from_version: null });
  if (error) throw new Error(`canvas_draft_open: ${error.message}`);
  const d = (await admin.from('canvas_drafts').select('version_name, canvas_id').eq('id', data.draft_id).single()).data as { version_name: string; canvas_id: string };
  return { draftId: data.draft_id, threadRoot: data.thread_root_id, conv: data.conversation_id, href: `/p/${u.slug}/canvas/${data.canvas_name}?v=${d.version_name}&ws=1` };
}

/** What the database holds for the user's one voice note, read with the service role: no browser involved. */
async function observe(u: TestUser, draftId: string) {
  const note = ((await admin.from('chat_messages').select('id, transcript, transcript_status, audio_duration_ms, thread_root_id').eq('author_id', u.user.id).not('audio_duration_ms', 'is', null)).data ?? []) as Note[];
  const run = ((await admin.from('canvas_draft_runs').select('id, state, error_code, input_kind, spend_id, started_at, finished_at, trigger_message_id').eq('draft_id', draftId).order('created_at')).data ?? []) as RunRow[];
  const audio = note[0] ? ((await admin.from('chat_voice_audio').select('message_id').eq('message_id', note[0].id)).data ?? []) : [];
  const points = ((await admin.from('canvas_draft_points').select('point_id').eq('draft_id', draftId)).data ?? []) as Row[];
  const spend = ((await admin.from('mirror_ai_spend').select('id, state, actual_usd').eq('owner_id', u.user.id)).data ?? []) as Spend[];
  return { note: note[0] ?? null, notes: note.length, run: run[0] ?? null, runs: run.length, audioRows: audio.length, points: points.length, spend };
}

const pick = (o: Awaited<ReturnType<typeof observe>>): Row => ({
  transcript: o.note?.transcript_status ?? null, run: o.run?.state ?? null, error: o.run?.error_code ?? null, points: o.points, spend: o.spend.length,
});

/** Every chat-voice and canvas request the page makes, and its console errors: the walk's own evidence of what the browser did. */
function watch(page: Page, tag: string): string[] {
  const log: string[] = [];
  page.on('response', async (r) => {
    if (!/\/functions\/v1\/|\/rest\/v1\/rpc\/canvas_|storage\.googleapis/.test(r.url())) return;
    let body = '';
    try { body = r.url().includes('storage.googleapis') ? '' : (await r.text()).slice(0, 300); } catch { /* the page closed */ }
    log.push(`${r.request().method()} ${r.url().replace(/\?.*/, '').slice(-60)} -> ${r.status()} ${body}`);
    fs.writeFileSync(`${DIR}/${tag}-network.log`, log.join('\n'));
  });
  page.on('console', (m) => { if (m.type() === 'error') { log.push(`console.error ${m.text().slice(0, 200)}`); fs.writeFileSync(`${DIR}/${tag}-network.log`, log.join('\n')); } });
  return log;
}

async function recordAndSend(page: Page, ms: number, tag: string) {
  watch(page, tag);
  const box = page.getByTestId('composer');
  const mic = box.getByRole('button', { name: 'Record a voice message' });
  await expect(mic).toBeVisible({ timeout: 30_000 });
  await shot(page, `${tag}-01-voice-button`);
  await mic.click();
  await expect(box.getByRole('button', { name: 'Send voice message' })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(ms);
  await shot(page, `${tag}-02-recording`);
  await box.getByRole('button', { name: 'Send voice message' }).click();
  await page.waitForTimeout(2500);
  await shot(page, `${tag}-02b-just-sent`);
}

test.setTimeout(420_000);

test.describe('X9 walk: speech', () => {
  let u: TestUser | null = null;
  test.afterAll(async () => { if (u) await deleteTestUser(u.user.id); });

  test('a recorded note is stored, its run begins after the transcript with the tab closed, and the draft changes', async () => {
    test.skip(!AUDIO, 'P1536_X9_AUDIO_DIR is not set');
    await withMic(`${AUDIO}/speech.wav`, async (page, context) => {
    u = await createTestUser({ name: `P1536x9 walk ${Date.now().toString(36)}` });
    const canvas = await newCanvas(u);
    await setTestSession(page, u.email);
    await page.goto(canvas.href);
    await recordAndSend(page, 20_500, 'speech');

    // the commit answered: the note, its audio row and its queued run exist
    let o = await observe(u, canvas.draftId);
    for (let i = 0; i < 40 && !o.note; i++) { await sleep(500); o = await observe(u, canvas.draftId); }
    const committedAt = Date.now();
    expect(o.note, 'the voice note is stored').not.toBeNull();
    expect(o.notes, 'exactly one note').toBe(1);
    expect(o.audioRows, 'with its audio row (the transcription job)').toBe(1);
    expect(o.runs, 'and exactly one run').toBe(1);
    expect(o.run).toMatchObject({ input_kind: 'voice', trigger_message_id: o.note!.id });
    await shot(page, 'speech-03-sent');

    // THE TAB IS CLOSED. From here nothing but the database and the edge functions can move the run.
    await page.close();
    const timeline: Row[] = [{ t: 0, closed: true, ...pick(o) }];
    let begunBeforeTranscript = false;
    for (let i = 0; i < 200; i++) {
      await sleep(1000);
      o = await observe(u, canvas.draftId);
      timeline.push({ t: Math.round((Date.now() - committedAt) / 1000), ...pick(o) });
      if (o.run && o.run.state !== 'queued' && o.note!.transcript_status !== 'done') begunBeforeTranscript = true;
      if (o.run && ['done', 'failed', 'capped'].includes(o.run.state)) break;
    }
    fs.writeFileSync(`${DIR}/speech-timeline.json`, JSON.stringify(timeline, null, 1));
    expect(o.note!.transcript_status, 'the transcript landed').toBe('done');
    expect((o.note!.transcript as string).length, 'and has words').toBeGreaterThan(20);
    expect(begunBeforeTranscript, 'the run never left queued before the transcript was done').toBe(false);
    expect(o.run, JSON.stringify(timeline.slice(-3))).toMatchObject({ state: 'done' });
    expect(o.run!.started_at, 'it began on its own, after the commit').not.toBeNull();
    expect(o.points, 'the draft holds points from the note').toBeGreaterThan(0);
    expect(o.spend.length, 'and the one run was charged once').toBe(1);

    // a fresh tab shows what happened
    const again = await context.newPage();
    await setTestSession(again, u.email);
    await again.goto(canvas.href);
    await expect(again.getByTestId('canvas-grid')).toBeVisible({ timeout: 30_000 });
    await expect(again.getByTestId('composer')).toBeVisible({ timeout: 30_000 });
    await shot(again, 'speech-04-after-reopen');
    fs.writeFileSync(`${DIR}/speech-final.json`, JSON.stringify({ transcript: o.note!.transcript, points: o.points, run: o.run, spend: o.spend }, null, 1));
    });
  });
});

test.describe('X9 walk: a transcript that comes back blank', () => {
  let u: TestUser | null = null;
  test.afterAll(async () => { if (u) await deleteTestUser(u.user.id); });

  test('fails the run at once with no model call and no charge, with the tab closed', async () => {
    test.skip(!AUDIO, 'P1536_X9_AUDIO_DIR is not set');
    await withMic(`${AUDIO}/silence.wav`, async (page) => {
    u = await createTestUser({ name: `P1536x9 blank ${Date.now().toString(36)}` });
    const canvas = await newCanvas(u);
    await setTestSession(page, u.email);
    await page.goto(canvas.href);
    await recordAndSend(page, 2500, 'silence');
    let o = await observe(u, canvas.draftId);
    for (let i = 0; i < 40 && !o.note; i++) { await sleep(500); o = await observe(u, canvas.draftId); }
    expect(o.note, 'the voice note is stored').not.toBeNull();
    await shot(page, 'silence-03-sent');
    await page.close();
    const timeline: Row[] = [];
    const startedAt = Date.now();
    for (let i = 0; i < 120; i++) {
      o = await observe(u, canvas.draftId);
      timeline.push({ t: Math.round((Date.now() - startedAt) / 1000), ...pick(o) });
      if (o.run && o.run.state !== 'queued') break;
      await sleep(1000);
    }
    fs.writeFileSync(`${DIR}/silence-timeline.json`, JSON.stringify(timeline, null, 1));
    expect(o.run, JSON.stringify(timeline.slice(-3))).toMatchObject({ state: 'failed', error_code: 'transcript_failed', spend_id: null });
    expect(o.spend, 'nothing was reserved or charged').toHaveLength(0);
    expect(o.points, 'and the draft is untouched').toBe(0);
    });
  });
});

