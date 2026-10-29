/**
 * @file p1576-chat-voice.spec.ts
 *
 * P1576 chat mic, in the real UI as a signed-in person (two users in a 1:1 DM, plus the mirror):
 *   1. smoke: the chat loads and logs no console errors.
 *   2. an empty composer offers the round voice button AND the in-field dictation mic; typing swaps the
 *      voice button for Send (never both).
 *   3. dictation: mic -> "Listening…" -> done -> the (mocked) text lands in the field and is NOT sent.
 *   4. voice note: record ~2 s -> the recorder bar shows a running timer -> send -> the commit call goes out
 *      and the note shows as a bubble; a commit that fails with a 500 keeps the clip with Retry / Discard, and
 *      Retry re-commits the SAME stored object without uploading again.
 *   5. voice notes seeded from the other user render as bubbles: length, Show transcript, Transcribing…,
 *      Audio expired; Play asks for a playback URL and starts.
 *   6. the mirror chat offers the voice button too, and a note whose transcript is pending is not answered:
 *      a mocked mirror-reply 'transcribing' leaves no answer and no "thinking" line.
 *   7. the bubble's waveform bars are its progress and its seek control.
 *   8. QA screenshots of every state at 1280, 768, 390 and 320 (P1576_SHOT_DIR, default: test-results/p1576-shots).
 *
 * WHAT IS REAL AND WHAT IS NOT. The browser, the composer, the recorder (Chrome's fake microphone), the WAV
 * encode, the chat list, Realtime and the database are real. The two edge functions are NOT deployed on test,
 * so `transcribe-clip` and `chat-voice` are answered by page.route: the commit step still writes the real
 * message row (service role, acting as the signed-in user, exactly the RPC the function calls) so the note
 * appears through the app's own read path. Gemini and Google Cloud Storage are never called: the "upload" goes
 * to a same-origin stub and playback plays a generated silent WAV.
 */
import { test, expect as baseExpect, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestMembership, createTestOrganization, deleteTestOrganization, type TestOrganization } from './helpers/test-organization';
import { supabaseAdmin } from './helpers/supabase-admin';
import { RUN, adminMessages, mirrorOf, ok, purgeChatFor, signIn, type SignedIn } from './helpers/test-chat';

const expect = baseExpect.configure({ timeout: 30_000 });
const SHOT_DIR = process.env.P1576_SHOT_DIR ?? 'test-results/p1576-shots'; // test-results/ is git-ignored
const WIDTHS = [
  { w: 1280, h: 800 },
  { w: 768, h: 1024 },
  { w: 390, h: 844 },
  { w: 320, h: 700 },
];
const DICTATED = 'Dictated by the fake microphone, then checked by a person.';

// Chrome's fake microphone: a tone, no prompt. The project config already passes the UI flag; test.use replaces
// launchOptions, so both are listed.
test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  permissions: ['microphone'],
});
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

let org: TestOrganization;
let a: TestUser;
let b: TestUser;
let sA: SignedIn;
let dm = '';
let mirrorId = '';
const noteIds: Record<'done1' | 'done2' | 'pending' | 'expired', string> = { done1: '', done2: '', pending: '', expired: '' };
const objectKeys: string[] = [];

/** Commits a voice note as `uid` the way the chat-voice function does, as the service role. */
async function commitNote(uid: string, conversation: string, over: Record<string, unknown> = {}, durationMs = 4200) {
  const clientId = (over.p_client_id as string | undefined) ?? randomUUID();
  const key = `${conversation}/${uid}/${clientId}.wav`;
  const res = await supabaseAdmin.rpc('chat_commit_voice_note', {
    p_uid: uid, p_conversation: conversation, p_object_key: key, p_duration_ms: durationMs, p_client_id: clientId, ...over,
  });
  if (res.error) throw new Error(`seed commit failed: ${res.error.message}`);
  objectKeys.push(key);
  return res.data as { id: string };
}

/**
 * The 50 levels the server computes at commit (audio_waveform, smallint[]). The function is not deployed on test, so
 * the mocked commit and the seeded rows get a fixed shape instead; notes left without it show the legacy fallback bars.
 */
const WAVE = Array.from({ length: 50 }, (_, i) => Math.round(50 + 45 * Math.sin(i / 3)));
async function withWaveform(id: string) {
  const res = await supabaseAdmin.from('chat_messages').update({ audio_waveform: WAVE }).eq('id', id);
  if (res.error) throw new Error(`could not seed the waveform: ${res.error.message}`);
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  mkdirSync(SHOT_DIR, { recursive: true });
  org = await createTestOrganization({ name: `P1576 Voice Org ${RUN}` });
  a = await createTestUser({ name: `Voicetest A ${RUN}` });
  b = await createTestUser({ name: `Voicetest B ${RUN}` });
  await createTestMembership(org.id, a.user.id);
  await createTestMembership(org.id, b.user.id);
  sA = await signIn(a);
  dm = await ok<string>(sA.client.rpc('start_dm', { p_other: b.user.id }), 'A starts a 1:1 with B');
  mirrorId = await mirrorOf(sA);

  // What B has sent A: a note with its transcript, a second one (shown open), one still being transcribed, and one
  // whose audio the 30-day retention removed (the words stay).
  noteIds.done1 = (await commitNote(b.user.id, dm)).id;
  await withWaveform(noteIds.done1);
  await ok(supabaseAdmin.rpc('chat_voice_finish_transcription', { p_message: noteIds.done1, p_ok: true, p_text: 'Meet me at the north gate at six.' }), 'finish 1');
  noteIds.done2 = (await commitNote(b.user.id, dm, {}, 61_000)).id;
  await withWaveform(noteIds.done2);
  await ok(supabaseAdmin.rpc('chat_voice_finish_transcription', { p_message: noteIds.done2, p_ok: true, p_text: 'A second note, shown with its transcript open.' }), 'finish 2');
  noteIds.pending = (await commitNote(b.user.id, dm, {}, 9_000)).id;
  noteIds.expired = (await commitNote(b.user.id, dm, {}, 15_000)).id;
  await ok(supabaseAdmin.rpc('chat_voice_finish_transcription', { p_message: noteIds.expired, p_ok: true, p_text: 'The recording is gone but these words stay.' }), 'finish 3');
  const gone = await supabaseAdmin.from('chat_messages').update({ audio_expired_at: new Date().toISOString() }).eq('id', noteIds.expired);
  if (gone.error) throw new Error(`could not expire the seeded note: ${gone.error.message}`);
  await supabaseAdmin.from('chat_voice_audio').delete().eq('message_id', noteIds.expired);
});

test.afterAll(async () => {
  test.setTimeout(180_000);
  await purgeChatFor([a?.user.id, b?.user.id].filter(Boolean) as string[], dm ? [dm] : []);
  if (objectKeys.length) await supabaseAdmin.from('chat_voice_purge').delete().in('path', objectKeys);
  for (const u of [a, b]) if (u) await deleteTestUser(u.user.id).catch(() => undefined);
  if (org) await deleteTestOrganization(org.id);
});

// ---------------------------------------------------------------------------
// Mocks for the two undeployed edge functions, and the storage stub
// ---------------------------------------------------------------------------
interface Edge {
  transcribeCalls: number;
  transcribeBytes: number[];
  uploads: number;
  commits: Array<Record<string, unknown>>;
  playbacks: string[];
  /** The message ids the page asked mirror-reply to answer. */
  mirrorReplies: string[];
  /** What the mocked mirror-reply answers: 202 'transcribing' until a test stores the transcript. */
  mirrorAnswer: 'transcribing' | 'done';
  /** The next N commits answer 500 (no row is written). */
  failCommits: number;
}

/** A silent mono 16 kHz WAV, so the audio element has something real to play. */
function silentWav(seconds: number): Buffer {
  const samples = 16_000 * seconds;
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(16_000, 24);
  buf.writeUInt32LE(32_000, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36);
  buf.writeUInt32LE(samples * 2, 40);
  return buf;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

async function mockEdge(page: Page, uid: string): Promise<Edge> {
  const edge: Edge = { transcribeCalls: 0, transcribeBytes: [], uploads: 0, commits: [], playbacks: [], mirrorReplies: [], mirrorAnswer: 'transcribing', failCommits: 0 };
  const origin = new URL(page.url() === 'about:blank' ? (test.info().project.use.baseURL as string) : page.url()).origin;
  const json = (status: number, body: unknown) => ({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

  await page.route('**/functions/v1/transcribe-clip', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    edge.transcribeCalls++;
    edge.transcribeBytes.push(req.postDataBuffer()?.length ?? 0);
    return route.fulfill(json(200, { text: DICTATED }));
  });

  await page.route('**/functions/v1/chat-voice', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = req.postDataJSON() as Record<string, unknown>;
    if (body.mode === 'upload') {
      edge.uploads++;
      return route.fulfill(json(200, {
        uploadUrl: `${origin}/__e2e/voice-upload`,
        uploadHeaders: { 'content-type': 'audio/wav' },
        objectKey: `${body.conversationId}/${uid}/${randomUUID()}.wav`,
      }));
    }
    if (body.mode === 'commit') {
      edge.commits.push(body);
      if (edge.failCommits > 0) {
        edge.failCommits--;
        return route.fulfill(json(500, { error: 'commit failed (e2e)' }));
      }
      const key = String(body.objectKey);
      const clientId = key.split('/').pop()!.replace(/\.wav$/, '');
      // The same RPC the real function calls: the note becomes a real message row.
      const res = await supabaseAdmin.rpc('chat_commit_voice_note', {
        p_uid: uid, p_conversation: body.conversationId, p_object_key: key, p_duration_ms: 2100,
        p_thread_root: body.threadRootId ?? null, p_reply_to: body.replyToId ?? null, p_client_id: clientId,
      });
      if (res.error) return route.fulfill(json(400, { error: res.error.message }));
      objectKeys.push(key);
      await withWaveform((res.data as { id: string }).id);
      const { data: row } = await supabaseAdmin.from('chat_messages').select('*').eq('id', (res.data as { id: string }).id).single();
      return route.fulfill(json(200, { message: row ?? res.data }));
    }
    if (body.mode === 'playback') {
      edge.playbacks.push(String(body.messageId));
      return route.fulfill(json(200, { url: `${origin}/__e2e/voice.wav` }));
    }
    return route.fulfill(json(400, { error: 'unexpected mode in the e2e mock' }));
  });

  // The mirror agent: on; a reply request answers 202 'transcribing' until the test stores the transcript.
  await page.route('**/functions/v1/mirror-reply', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = req.postDataJSON() as Record<string, unknown>;
    if (body.availability) return route.fulfill(json(200, { enabled: true }));
    edge.mirrorReplies.push(String(body.message_id));
    return route.fulfill(edge.mirrorAnswer === 'done' ? json(200, { state: 'done' }) : json(202, { state: 'transcribing' }));
  });

  await page.route('**/__e2e/voice-upload', (route) => route.fulfill({ status: 200, body: '' }));
  await page.route('**/__e2e/voice.wav', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav(8) }));
  return edge;
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------
interface Opened { page: Page; edge: Edge; errors: string[] }

async function open(page: Page, user: TestUser, path: string, width = 1280, height = 800): Promise<Opened> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    if (process.env.P1576_DEBUG) console.log(`[browser ${m.type()}] ${m.text()}`);
  });
  if (process.env.P1576_DEBUG) page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log(`[nav] ${f.url()}`); });
  await page.setViewportSize({ width, height });
  await page.goto('/');
  const edge = await mockEdge(page, user.user.id);
  await setTestSession(page, user.email);
  await page.goto(path);
  return { page, edge, errors };
}

const composer = (page: Page) => page.getByTestId('composer');
const field = (page: Page) => composer(page).getByRole('textbox');
const voiceButton = (page: Page) => composer(page).getByRole('button', { name: 'Record a voice message' });
const micButton = (page: Page) => composer(page).getByRole('button', { name: 'Dictate a message' });
const sendButton = (page: Page) => composer(page).getByRole('button', { name: 'Send', exact: true });

async function ready(page: Page, placeholder: string | RegExp = /^Message /) {
  await expect(page.getByTestId('conversation')).toBeVisible();
  await expect(page.getByRole('textbox', { name: placeholder })).toBeVisible();
}

/** Real resize, proven: `resize` can no-op below a minimum window size, which would hide a clipping bug. */
async function atWidth(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(w);
  await page.waitForTimeout(250);
}

/** A thumb has to hit it: measured in the browser, not read off a class name. */
async function expectTarget(target: Locator, label: string) {
  const box = await target.boundingBox();
  expect(box, `${label} is on screen`).not.toBeNull();
  expect(Math.round(box!.width), `${label} width`).toBeGreaterThanOrEqual(40);
  expect(Math.round(box!.height), `${label} height`).toBeGreaterThanOrEqual(40);
}

async function noHorizontalScroll(page: Page, label: string) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, `horizontal overflow at ${label}`).toBeLessThanOrEqual(0);
}

/** Nothing is still loading: no skeleton rows in the list or the chat, so a shot shows the screen and not its loading state. */
async function expectLoaded(page: Page) {
  await expect(page.getByRole('status', { name: 'Loading messages' })).toHaveCount(0);
  await expect(page.getByRole('status', { name: 'Loading chats' })).toHaveCount(0);
}

/** A shot must not carry leftovers: no hover toolbar under the pointer, none shown by focus left on a button just pressed. */
async function calm(page: Page) {
  // Animations stand still: a pulsing red dot caught mid-pulse is a pale dot, and a spinner caught mid-turn a smear.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expectLoaded(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
}

/**
 * One screenshot per width of the state the page is in right now. With `target`, only that element is captured, so
 * a bubble state is shown on its own rather than as one more row of the same list.
 */
async function shoot(page: Page, state: string, target?: Locator) {
  for (const { w, h } of WIDTHS) {
    await atWidth(page, w, h);
    await calm(page);
    await noHorizontalScroll(page, `${state} at ${w}`);
    if (target) {
      await target.scrollIntoViewIfNeeded();
      await target.screenshot({ path: `${SHOT_DIR}/${state}-${w}.png` });
    } else {
      await page.screenshot({ path: `${SHOT_DIR}/${state}-${w}.png` });
    }
  }
  await atWidth(page, 1280, 800);
}

async function startVoiceNote(page: Page) {
  await voiceButton(page).click();
  await expect(page.getByTestId('voice-bar')).toBeVisible();
}

const bubbleOf = (page: Page, id: string) => page.locator(`[data-msg="${id}"]`);
/**
 * The conversation has read its messages: every seeded note is on screen. Returns how many voice bubbles there are
 * now (earlier tests in this file send real notes into the same 1:1, so the number is not a constant).
 */
async function seededLoaded(page: Page): Promise<number> {
  for (const id of Object.values(noteIds)) await expect(bubbleOf(page, id).getByTestId('voice-bubble')).toBeVisible();
  return page.getByTestId('voice-bubble').count();
}

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------
test('smoke: the 1:1 loads, shows the composer and logs no console errors', async ({ page }) => {
  const { errors } = await open(page, a, `/chats/c/${dm}`);
  await ready(page);
  await expect(composer(page)).toBeVisible();
  await seededLoaded(page);
  expect(errors, 'console errors:\n' + errors.join('\n')).toEqual([]);
});

test('an empty composer offers the voice button and the dictation mic; typing swaps the voice button for Send', async ({ page }) => {
  await open(page, a, `/chats/c/${dm}`);
  await ready(page);
  await expect(voiceButton(page)).toBeVisible();
  await expect(micButton(page)).toBeVisible();
  await expect(sendButton(page)).toHaveCount(0);

  await field(page).fill('typing now');
  await expect(sendButton(page)).toBeVisible();
  await expect(voiceButton(page)).toHaveCount(0);
  await expect(micButton(page)).toBeVisible();

  await field(page).fill('');
  await expect(voiceButton(page)).toBeVisible();
  await expect(sendButton(page)).toHaveCount(0);
});

test('dictation: mic, Listening…, done: the text lands in the field and is not sent', async ({ page }) => {
  const { edge } = await open(page, a, `/chats/c/${dm}`);
  await ready(page);
  const before = (await adminMessages(dm)).length;

  await micButton(page).click();
  await expect(page.getByText('Listening…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel dictation' })).toBeVisible();
  await expect(sendButton(page)).toHaveCount(0); // one primary action while recording
  await page.waitForTimeout(1500); // the fake microphone records a tone
  await page.getByRole('button', { name: 'Finish dictation' }).click();

  await expect(field(page)).toHaveValue(DICTATED);
  expect(edge.transcribeCalls, 'one clip went to transcribe-clip').toBe(1);
  expect(edge.transcribeBytes[0], 'and it was a real WAV, not an empty body').toBeGreaterThan(10_000);
  expect((await adminMessages(dm)).length, 'nothing was sent').toBe(before);
  await expect(sendButton(page)).toBeVisible();
});

test('voice note: record ~2 s, the timer runs, send commits it and the bubble appears', async ({ page }) => {
  const { edge } = await open(page, a, `/chats/c/${dm}`);
  await ready(page);
  const bubblesBefore = await seededLoaded(page);

  await startVoiceNote(page);
  await expect(page.getByTestId('voice-dot')).toBeVisible();
  await expect(sendButton(page)).toHaveCount(0);
  await expect(micButton(page)).toHaveCount(0); // the dictation mic stands down
  await expect(page.getByTestId('voice-timer')).toHaveText(/^0:0[2-9]$/, { timeout: 15_000 });

  await page.getByRole('button', { name: 'Send voice message' }).click();
  await expect.poll(() => edge.commits.length).toBe(1);
  expect(edge.uploads).toBe(1);
  await expect(page.getByTestId('voice-bar')).toHaveCount(0);
  await expect(voiceButton(page)).toBeVisible();
  await expect(page.getByTestId('voice-bubble')).toHaveCount(bubblesBefore + 1);
});

test('voice note: a commit that fails keeps the clip; Retry re-commits the SAME stored object without uploading again', async ({ page }) => {
  const { edge } = await open(page, a, `/chats/c/${dm}`);
  await ready(page);
  const bubblesBefore = await seededLoaded(page);
  edge.failCommits = 1;

  await startVoiceNote(page);
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Send voice message' }).click();

  const alert = page.getByTestId('voice-failed');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Couldn't send the voice message.");
  await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(alert.getByRole('button', { name: 'Discard voice message' })).toBeVisible();
  expect(edge.commits).toHaveLength(1);

  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect.poll(() => edge.commits.length).toBe(2);
  expect(edge.uploads, 'the stored upload is reused, not repeated').toBe(1);
  expect(edge.commits[1]?.objectKey).toBe(edge.commits[0]?.objectKey);
  await expect(page.getByTestId('voice-failed')).toHaveCount(0);
  await expect(page.getByTestId('voice-bubble')).toHaveCount(bubblesBefore + 1);
});

test('voice note: Discard after a failure drops the clip and gives the empty composer back', async ({ page }) => {
  const { edge } = await open(page, a, `/chats/c/${dm}`);
  await ready(page);
  edge.failCommits = 1;
  await startVoiceNote(page);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Send voice message' }).click();
  await page.getByTestId('voice-failed').getByRole('button', { name: 'Discard voice message' }).click();
  await expect(page.getByTestId('voice-failed')).toHaveCount(0);
  await expect(voiceButton(page)).toBeVisible();
  expect(edge.commits).toHaveLength(1);
});

test('seeded voice notes render as bubbles: length, transcript toggle, Transcribing…, Audio expired; Play asks for a link', async ({ page }) => {
  const { edge } = await open(page, a, `/chats/c/${dm}`);
  await ready(page);

  const done1 = bubbleOf(page, noteIds.done1);
  await expect(done1.getByTestId('voice-duration')).toHaveText('0:05'); // 4.2 s rounds up
  await expect(bubbleOf(page, noteIds.done2).getByTestId('voice-duration')).toHaveText('1:01');
  await expect(done1.getByText('Meet me at the north gate at six.')).toHaveCount(0);
  await done1.getByRole('button', { name: 'Show transcript' }).click();
  await expect(done1.getByText('Meet me at the north gate at six.')).toBeVisible();
  await done1.getByRole('button', { name: 'Hide transcript' }).click();
  await expect(done1.getByText('Meet me at the north gate at six.')).toHaveCount(0);

  await expect(bubbleOf(page, noteIds.pending).getByText('Transcribing…')).toBeVisible();
  const expired = bubbleOf(page, noteIds.expired);
  await expect(expired.getByText('Audio expired')).toBeVisible();
  await expect(expired.getByRole('button', { name: /(Play|Pause) voice message/ }), 'no dead play button once the audio is gone').toHaveCount(0);
  await expired.getByRole('button', { name: 'Show transcript' }).click();
  await expect(expired.getByText('The recording is gone but these words stay.')).toBeVisible();

  // Someone else's note offers Reply but not Forward or Clarify.
  await done1.hover();
  const bar = done1.getByRole('toolbar', { name: 'Message actions' });
  await expect(bar.getByRole('button', { name: 'Reply' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Forward' })).toHaveCount(0);
  await expect(bar.getByRole('button', { name: /Clarify/ })).toHaveCount(0);

  expect(edge.playbacks, 'no playback link is fetched until Play is pressed').toHaveLength(0);
  await done1.getByRole('button', { name: 'Play voice message' }).click();
  await expect(done1.getByRole('button', { name: 'Pause voice message' })).toBeVisible();
  expect(edge.playbacks).toEqual([noteIds.done1]);
});

test('the mirror chat offers the voice button too (and dictation); typing swaps it for Send', async ({ page }) => {
  await open(page, a, `/chats/c/${mirrorId}`);
  await ready(page, 'Write to your mirror agent');
  await expect(micButton(page)).toBeVisible();
  await expect(voiceButton(page)).toBeVisible();
  await expect(sendButton(page)).toHaveCount(0);
  await field(page).fill('hello');
  await expect(sendButton(page)).toBeVisible();
  await expect(voiceButton(page)).toHaveCount(0);
});

test('mirror voice note: the browser never asks for the reply (the server does); the line shows thinking until the agent reply lands', async ({ page }) => {
  const { edge } = await open(page, a, `/chats/c/${mirrorId}`);
  await ready(page, 'Write to your mirror agent');
  await startVoiceNote(page);
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Send voice message' }).click();
  await expect.poll(() => edge.commits.length).toBe(1);
  const bubble = page.getByTestId('voice-bubble').last();
  await expect(bubble).toBeVisible();
  await expect(bubble.getByText('Transcribing…')).toBeVisible();
  // Pending: no request at all (no timed fallback; a missed update is recovered on resync).
  await page.waitForTimeout(3000);
  expect(edge.mirrorReplies, 'no mirror-reply while the transcript is pending').toHaveLength(0);
  await expect(page.getByTestId('mirror-thinking')).toHaveCount(0);
  const note = (await adminMessages(mirrorId)).filter((m) => m.kind === 'message' && m.audio_duration_ms != null).at(-1)!;
  // The server finishes the transcript: the Realtime UPDATE shows "thinking" and the browser asks NOTHING.
  const done = await supabaseAdmin.from('chat_messages').update({ transcript: 'hello mirror', transcript_status: 'done' }).eq('id', note.id);
  expect(done.error).toBeNull();
  await expect(page.getByTestId('mirror-thinking')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2000);
  expect(edge.mirrorReplies, 'the browser never calls mirror-reply for a voice note').toEqual([]);
  await expect(page.getByTestId('mirror-transcript-failed')).toHaveCount(0);
  // The server's reply (an agent row answering the note) arrives over Realtime and clears the line.
  const reply = await supabaseAdmin.from('chat_messages')
    .insert({ conversation_id: mirrorId, author_id: null, body: 'I hear you.', kind: 'agent', reply_to_id: note.id }).select('id').single();
  expect(reply.error).toBeNull();
  await expect(page.getByTestId('mirror-thinking')).toHaveCount(0, { timeout: 20_000 });
  expect(edge.mirrorReplies).toEqual([]);
});

test('the bars are the progress and the seek control: a tap on them moves the playhead and plays from there', async ({ page }) => {
  await open(page, a, `/chats/c/${dm}`);
  await ready(page);
  await seededLoaded(page);
  const done1 = bubbleOf(page, noteIds.done1);
  const slider = done1.getByRole('slider', { name: 'Seek voice message' });
  await expect(done1.getByTestId('voice-wave-bar')).toHaveCount(50);
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  const box = (await slider.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  await expect(done1.getByRole('button', { name: 'Pause voice message' })).toBeVisible();
  await expect.poll(async () => Number(await slider.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(2);
  await expect.poll(() => done1.locator('[data-testid="voice-wave-bar"][data-filled="true"]').count()).toBeGreaterThan(20);
  await slider.focus();
  await page.keyboard.press('ArrowLeft'); // 5 s back: clamps to the start
  await expect.poll(async () => Number(await slider.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(1);
});

test('touch targets: every control a thumb has to hit is at least 40x40, measured at 1280 and at 320', async ({ page }) => {
  const { edge } = await open(page, a, `/chats/c/${dm}`);
  await ready(page);
  await seededLoaded(page);
  const done1 = bubbleOf(page, noteIds.done1);

  for (const { w, h } of [WIDTHS[0]!, WIDTHS[3]!]) {
    await atWidth(page, w, h);
    await expectTarget(micButton(page), `in-field dictation mic at ${w}`);
    await expectTarget(voiceButton(page), `voice button at ${w}`);
    await expectTarget(done1.getByRole('button', { name: 'Show transcript' }), `Show transcript at ${w}`);
    await done1.getByRole('button', { name: 'Show transcript' }).click();
    await expectTarget(done1.getByRole('button', { name: 'Hide transcript' }), `Hide transcript at ${w}`);
    await done1.getByRole('button', { name: 'Hide transcript' }).click();
    await expectTarget(done1.getByRole('button', { name: 'Play voice message' }), `Play at ${w}`);
  }

  await atWidth(page, 320, 700); // the narrowest, where a control is most likely to be squeezed
  await micButton(page).click();
  await expect(page.getByText('Listening…')).toBeVisible();
  // The live-mic cue survives on a phone: a compact meter with visible bars, inside the bar, clear of the X.
  const meter = page.getByTestId('dictation-level');
  await expect(meter).toBeVisible();
  const meterBox = (await meter.boundingBox())!;
  const cancelBox = (await page.getByRole('button', { name: 'Cancel dictation' }).boundingBox())!;
  expect(meterBox.width, 'the meter has room at 320').toBeGreaterThanOrEqual(30);
  expect(meterBox.x + meterBox.width, 'the meter ends before the X begins').toBeLessThanOrEqual(cancelBox.x);
  const shownBars = await meter.locator('span').evaluateAll((els) =>
    els.filter((e) => (e as HTMLElement).getBoundingClientRect().width >= 3).length);
  expect(shownBars, 'bars with real width at 320').toBeGreaterThanOrEqual(8);
  await expectTarget(page.getByRole('button', { name: 'Cancel dictation' }), 'dictation cancel (the X)');
  await expectTarget(page.getByRole('button', { name: 'Finish dictation' }), 'dictation done');
  await page.getByRole('button', { name: 'Cancel dictation' }).click();

  edge.failCommits = 1;
  await startVoiceNote(page);
  await expectTarget(page.getByRole('button', { name: 'Discard voice message' }), 'voice bin');
  await expectTarget(page.getByRole('button', { name: 'Send voice message' }), 'voice send');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Send voice message' }).click();
  await expect(page.getByTestId('voice-failed')).toBeVisible();
  await expectTarget(page.getByTestId('voice-failed').getByRole('button', { name: 'Retry' }), 'Retry');
  await expectTarget(page.getByTestId('voice-failed').getByRole('button', { name: 'Discard voice message' }), 'Discard');
  await page.getByTestId('voice-failed').getByRole('button', { name: 'Discard voice message' }).click();
});

// ---------------------------------------------------------------------------
// QA screenshots: every state at 1280, 768, 390 and 320
// ---------------------------------------------------------------------------
test.describe('screenshots', () => {
  test('empty composer', async ({ page }) => {
    await open(page, a, `/chats/c/${dm}`);
    await ready(page);
    await seededLoaded(page);
    await expect(voiceButton(page)).toBeVisible();
    await shoot(page, 'empty-composer');
  });

  test('dictation recording', async ({ page }) => {
    await open(page, a, `/chats/c/${dm}`);
    await ready(page);
    await seededLoaded(page);
    await micButton(page).click();
    await expect(page.getByText('Listening…')).toBeVisible();
    await shoot(page, 'dictation-recording');
    await page.getByRole('button', { name: 'Cancel dictation' }).click();
  });

  test('voice recorder bar', async ({ page }) => {
    await open(page, a, `/chats/c/${dm}`);
    await ready(page);
    await seededLoaded(page);
    await startVoiceNote(page);
    await expect(page.getByTestId('voice-timer')).toHaveText(/^0:0[1-9]$/, { timeout: 15_000 });
    await shoot(page, 'voice-recorder-bar');
    await page.getByRole('button', { name: 'Discard voice message' }).click();
  });

  test('voice send failure', async ({ page }) => {
    const { edge } = await open(page, a, `/chats/c/${dm}`);
    await ready(page);
    await seededLoaded(page);
    edge.failCommits = 1;
    await startVoiceNote(page);
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Send voice message' }).click();
    await expect(page.getByTestId('voice-failed')).toBeVisible();
    await shoot(page, 'voice-send-failed');
    await page.getByTestId('voice-failed').getByRole('button', { name: 'Discard voice message' }).click();
  });

  test('bubbles: collapsed, transcript open, transcribing, expired', async ({ page }) => {
    await open(page, a, `/chats/c/${dm}`);
    await ready(page);
    const done1 = bubbleOf(page, noteIds.done1);
    const done2 = bubbleOf(page, noteIds.done2);
    await expect(done1.getByTestId('voice-bubble')).toBeVisible();

    await shoot(page, 'bubble-collapsed', done1);

    // Mid-play: the bars before the playhead are filled. The pending note has no stored waveform (the legacy 50 low bars).
    const slider = done1.getByRole('slider', { name: 'Seek voice message' });
    const box = (await slider.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);
    await expect(done1.getByRole('button', { name: 'Pause voice message' })).toBeVisible();
    // Pause only once it is really playing from the tapped point: a tap while the clip still loads stops the start.
    await expect.poll(() => done1.locator('[data-testid="voice-wave-bar"][data-filled="true"]').count()).toBeGreaterThan(20);
    await done1.getByRole('button', { name: 'Pause voice message' }).click();
    await shoot(page, 'bubble-playhead', done1);

    await done2.getByRole('button', { name: 'Show transcript' }).click();
    await expect(done2.getByTestId('voice-transcript')).toBeVisible();
    await shoot(page, 'bubble-transcript-open', done2);
    await done2.getByRole('button', { name: 'Hide transcript' }).click();

    await shoot(page, 'bubble-transcribing', bubbleOf(page, noteIds.pending));
    await shoot(page, 'bubble-expired', bubbleOf(page, noteIds.expired));
  });
});
