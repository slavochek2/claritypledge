#!/usr/bin/env node
/**
 * @file video-summary.mjs
 * @description P1357: operator tool that writes public.video_summaries rows (P1349) in three
 * separate steps, so no summary reaches a reader without a writer, an independent checker and the
 * operator each doing their part.
 *
 *   node scripts/video-summary.mjs draft   <video id|url> [--force] [--revise]   Gemini writes a draft;
 *                                          --revise feeds it the checker's last failures to fix
 *   node scripts/video-summary.mjs check   <video id|url>             Codex checks it → checked
 *   node scripts/video-summary.mjs confirm <video id|url>             operator types the id → confirmed
 *   node scripts/video-summary.mjs demote  <video id|url>             back to draft (corrections, takedowns)
 *   node scripts/video-summary.mjs list
 *
 * Target: the TEST database by default. `--env prod` writes prod, with the service key read through
 * the per-access keyring lock (one dialog; never "Always Allow").
 *
 * Captions come through `yt` (store-backed, P1140). The exact caption file the writer read is kept in
 * the summary store (default ~/.local/share/video-summary-store/<id>/, override VIDEO_SUMMARY_STORE)
 * and the checker reads that file — never a second fetch, which can return different text.
 *
 * Needs: `yt` on PATH, GEMINI_API_KEY (.env.local), ~/.agents/bin/ask-model with Codex for the checker.
 */
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import {
  checkerPrompt,
  contentSha,
  MAX_TRANSCRIPT_CHARS,
  transcriptText,
  mechanicalCheck,
  mmss,
  parseCheckerVerdict,
  parseVideoId,
  parseVtt,
  sameVendor,
  transitionError,
  validateDraft,
  WRITER_SCHEMA,
  writerPrompt,
} from './lib/video-summary-core.mjs';

const execFileP = promisify(execFile);
const PROD_URL = 'https://besjtuodziykmjidubzw.supabase.co';
const TEST_REF = 'gfjctyxqlwexxwsmkakq';
const ASK_MODEL = join(homedir(), '.agents/bin/ask-model'); // pinned: the checker binary is not configurable
// A gate needs stable verdicts: at the wrapper's default (low) the same summary passed, then failed.
const CHECKER_EFFORT = process.env.VIDEO_SUMMARY_CHECKER_EFFORT || 'high';
if (!['high', 'xhigh'].includes(CHECKER_EFFORT)) {
  console.error(`video-summary: VIDEO_SUMMARY_CHECKER_EFFORT must be high or xhigh (low gave unstable verdicts), got ${CHECKER_EFFORT}`);
  process.exit(2);
}
const STORE = process.env.VIDEO_SUMMARY_STORE || join(homedir(), '.local/share/video-summary-store');

/**
 * Reads a dotenv file into a LOCAL object. Never copies into process.env: the checker subprocess
 * reads uploader-controlled text and must not inherit a service key (review finding #7).
 */
function readEnvFile(name) {
  const out = {};
  try {
    for (const line of readFileSync(resolve(process.cwd(), name), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {
    /* optional */
  }
  return out;
}

/** The only variables a child process gets: enough to run, nothing secret. */
function childEnv() {
  const keep = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'TERM'];
  return Object.fromEntries(keep.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
}

function die(msg, code = 1) {
  console.error(`video-summary: ${msg}`);
  process.exit(code);
}

async function db(env) {
  if (env === 'prod') {
    const { keyringGet } = await import('./lib/keyring.mjs');
    const key = keyringGet('PROD_SUPABASE_SERVICE_ROLE_KEY', 'video-summary: write a video summary row on prod');
    return { client: createClient(PROD_URL, key, { auth: { persistSession: false } }), label: 'PROD' };
  }
  // The file is authoritative for the test target; ambient variables cannot redirect it.
  const file = readEnvFile('.env.test.local');
  const url = file.VITE_SUPABASE_URL;
  const key = file.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) die('test target needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.test.local');
  if (!url.includes(TEST_REF)) die(`the test target must be the test project (${TEST_REF}); .env.test.local points at ${url} — refusing`);
  return { client: createClient(url, key, { auth: { persistSession: false } }), label: 'test' };
}

async function getRow(client, id) {
  const { data, error } = await client.from('video_summaries').select('*').eq('provider', 'youtube').eq('video_id', id).maybeSingle();
  if (error) die(`reading the row failed: ${error.message}`);
  return data;
}

let ENV = 'test';
// Keyed by environment: test and prod drafts of one video must never share a transcript or a report.
const storeDir = (id) => join(STORE, ENV, id);
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

async function yt(args) {
  try {
    return await execFileP('yt', args, { maxBuffer: 1 << 24, timeout: 10 * 60 * 1000, env: childEnv() });
  } catch (e) {
    if (e.code === 'ENOENT') die('`yt` is not on PATH (see ~/.claude/tools.md)');
    if (e.code === 7) die('YouTube walled every route and the free proxy quota is spent (yt exit 7) — ask the founder; do not retry or buy a top-up', 7);
    const err = String(e.stderr || '').split('\n').find((l) => l.startsWith('ERROR:'));
    if (err && !/subtitles/i.test(err)) die(`yt: ${err.replace(/^ERROR:\s*/, '')}`);
    if (!/subtitles/i.test(String(e.stderr || ''))) {
      const last = String(e.stderr || '').trim().split('\n').filter(Boolean).pop() ?? '';
      die(`yt failed (exit ${e.code}) — video unavailable or private?${last ? ` [${last}]` : ''}`);
    }
    throw e;
  }
}

async function fetchMetaAndCaptions(id) {
  const url = `https://www.youtube.com/watch?v=${id}`;
  const { stdout } = await yt(['--skip-download', '--no-playlist', '--print', '%(id)s\t%(title)s\t%(duration)s\t%(channel)s\t%(language)s', '--', url]);
  const [gotId, title, duration, channel, language] = stdout.trim().split('\n').pop().split('\t');
  if (gotId !== id) die(`metadata came back for "${gotId}", not ${id}`);
  const meta = { id, title, channel, duration: Number(duration) };
  if (!meta.title || !meta.channel || !Number.isInteger(meta.duration) || meta.duration <= 0) die(`unusable metadata: ${stdout.trim()}`);
  // Non-English videos would be summarised from machine-translated captions, and quotes would put
  // translated words in a real person's mouth. Out of scope until someone decides how to label that.
  if (language && language !== 'NA' && !/^en\b/i.test(language)) die(`video language is "${language}", not English — refusing (translated captions would misquote speakers)`);

  const dir = mkdtempSync(join(tmpdir(), 'video-summary-'));
  try {
    try {
      await yt(['--skip-download', '--no-playlist', '--write-subs', '--write-auto-subs', '--sub-langs', 'en.*,en', '--sub-format', 'vtt', '-o', join(dir, '%(id)s.%(ext)s'), '--', url]);
    } catch (e) {
      // One failing caption variant fails the whole call even when "en" saved; the file check decides.
      if (!/subtitles/i.test(String(e.stderr || e.message))) throw e;
    }
    const files = readdirSync(dir).filter((f) => f.endsWith('.vtt'));
    if (!files.length) die('no English captions for this video');
    // Prefer human captions (no "-orig"/auto marker) and, among equals, the smallest (auto tracks roll and duplicate).
    const ranked = files
      .map((f) => ({ f, vtt: readFileSync(join(dir, f), 'utf8') }))
      .map((x) => ({ ...x, segs: parseVtt(x.vtt) }))
      .filter((x) => x.segs.length > 0)
      .sort((a, b) => (/-orig/.test(a.f) ? 1 : 0) - (/-orig/.test(b.f) ? 1 : 0) || a.vtt.length - b.vtt.length);
    if (!ranked.length) die('captions were empty');
    return { meta, vtt: ranked[0].vtt, track: ranked[0].f };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function geminiModel() {
  if (process.env.VIDEO_SUMMARY_WRITER_MODEL) return process.env.VIDEO_SUMMARY_WRITER_MODEL;
  try {
    const m = readFileSync(join(homedir(), '.agents/model-defaults.env'), 'utf8').match(/^GEMINI_MODEL=([A-Za-z0-9._:-]+)$/m);
    if (m) return m[1];
  } catch {
    /* fall through */
  }
  return 'gemini-3.8-flash';
}

async function writeWithGemini(meta, segs, revise) {
  const key = process.env.GEMINI_API_KEY || readEnvFile('.env.local').GEMINI_API_KEY;
  if (!key) die('GEMINI_API_KEY missing (.env.local)');
  const model = geminiModel();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    signal: AbortSignal.timeout(5 * 60 * 1000),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: writerPrompt(meta, segs, revise) }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: WRITER_SCHEMA, temperature: 0.2 },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) die(`Gemini ${res.status}: ${body?.error?.message ?? 'request failed'}`);
  const served = body.modelVersion || model;
  if (!served.startsWith(model.replace(/-latest$/, ''))) die(`asked Gemini for ${model} but it served ${served}`, 4);
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    die(`Gemini returned non-JSON (finishReason ${body?.candidates?.[0]?.finishReason ?? 'unknown'})`);
  }
  return { raw, writer: `gemini:${served}` };
}

async function checkWithCodex(prompt) {
  if (!existsSync(ASK_MODEL)) die(`checker needs ${ASK_MODEL} (Codex) — not found`);
  const dir = mkdtempSync(join(tmpdir(), 'video-summary-check-'));
  const file = join(dir, 'prompt.txt');
  writeFileSync(file, prompt);
  try {
    // cwd is an empty temp dir and the env carries no secrets: the checker reads uploader-controlled
    // text. (--no-isolate: there is no repo to clone here; the sandbox is read-only.)
    const { stdout, failed } = await execFileP(
      ASK_MODEL,
      ['codex', '--raw', '--effort', CHECKER_EFFORT, '--sandbox', 'read-only', '--no-isolate', '--timeout', '1500', '--prompt-file', file],
      { maxBuffer: 1 << 26, cwd: dir, env: childEnv(), timeout: 30 * 60 * 1000 }
    ).catch((e) => ({ stdout: e.stdout ?? '', failed: e }));
    const header = stdout.split('\n')[0];
    const requested = header.match(/requested=(\S+)/)?.[1];
    const exit = header.match(/exit=(\d+)/)?.[1];
    // Any process failure (non-zero, signal, timeout, output overflow) ends the check; partial output is never parsed.
    if (failed || !header.startsWith('ASK-MODEL:') || !requested || exit !== '0') die(`checker run failed: ${header || failed?.message || 'no output'}`);
    const effort = header.match(/effort=(\S+)/)?.[1];
    if (effort !== CHECKER_EFFORT) die(`checker ran at effort ${effort}, not the requested ${CHECKER_EFFORT}`);
    return { text: stdout.split('\n').slice(1).join('\n'), checker: `codex:${requested}`, effort };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function readStore(id, row) {
  const dir = storeDir(id);
  const vttPath = join(dir, 'transcript.vtt');
  if (!existsSync(vttPath) || !existsSync(join(dir, 'meta.json'))) die(`no retained transcript for ${id} in ${dir} — run draft first (the checker never re-fetches)`);
  const vtt = readFileSync(vttPath, 'utf8');
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const sha = sha256(vtt);
  if (sha !== meta.transcript_sha256) die(`retained transcript for ${id} does not match the hash recorded at draft time`);
  if (!row.transcript_sha256 || sha !== row.transcript_sha256)
    die(`the row was written from a different transcript than the one retained here (row ${row.transcript_sha256 ?? 'none'}, store ${sha}) — re-draft`);
  return { vtt, meta, segs: parseVtt(vtt), sha };
}

function readReport(id) {
  try {
    return JSON.parse(readFileSync(join(storeDir(id), 'check.json'), 'utf8'));
  } catch {
    return null;
  }
}

function draftFromRow(row) {
  return { tldr: row.tldr ?? '', summary: row.summary, key_points: row.key_points, moments: row.moments };
}

async function cmdDraft(client, id, force, reviseFlag) {
  const existing = await getRow(client, id);
  const err = transitionError('draft', existing?.status, { force });
  if (err) die(err);
  console.log(`fetching captions for ${id}…`);
  const { meta, vtt, track } = await fetchMetaAndCaptions(id);
  const segs = parseVtt(vtt);
  if (transcriptText(segs).length > MAX_TRANSCRIPT_CHARS) die(`transcript is over ${MAX_TRANSCRIPT_CHARS} characters — too long to summarise and check reliably`);
  console.log(`"${meta.title}" — ${meta.channel} — ${mmss(meta.duration)} — ${segs.length} caption cues (${track})`);
  let revise = null;
  if (reviseFlag) {
    revise = readReport(id);
    if (!revise) die('--revise needs a previous failed check for this video (none in the store)');
    if (revise.pass || !revise.failures?.length) die('--revise: the last check has no failures to fix');
    if (!existing) die('--revise needs the previous draft row');
    if (revise.content_sha256 !== contentSha(createHash, existing)) die('--revise: the last check was of different content than this row — run check first');
    revise.previous = draftFromRow(existing);
    console.log(`revising against ${revise.failures.length} checker failures`);
  }
  const { raw, writer } = await writeWithGemini(meta, segs, revise);
  const { ok, errors, draft } = validateDraft(raw, meta.duration);
  if (!ok) die(`writer output rejected, nothing written:\n  - ${errors.join('\n  - ')}`);

  const transcriptSha = sha256(vtt);
  const fields = {
      provider: 'youtube',
      video_id: id,
      title: meta.title,
      channel: meta.channel,
      duration_seconds: meta.duration,
      ...draft,
      transcript_sha256: transcriptSha,
      status: 'draft',
      written_by: writer,
      checked_by: null,
      checked_at: null,
      confirmed_at: null,
  };
  // Write only over the exact row we read: a draft that took minutes to generate must not overwrite
  // a row someone checked or confirmed in the meantime (review finding #9) — --force included.
  let error;
  if (existing) {
    const res = await client.from('video_summaries').update(fields).eq('id', existing.id).eq('updated_at', existing.updated_at).select('id');
    error = res.error;
    if (!error && !res.data?.length) die('the row changed while the draft was being written — nothing saved; run draft again');
  } else {
    error = (await client.from('video_summaries').insert(fields)).error;
    if (error?.code === '23505') die('a row for this video appeared while the draft was being written — nothing saved; run draft again');
  }
  if (error) die(`writing the draft failed: ${error.message}`);
  // Store only after the row exists, and swap it in whole: the store must never describe a draft
  // the database does not hold.
  const dir = storeDir(id);
  const tmp = `${dir}.tmp-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, 'transcript.vtt'), vtt);
  writeFileSync(join(tmp, 'meta.json'), JSON.stringify({ ...meta, track, transcript_sha256: transcriptSha, written_by: writer, drafted_at: new Date().toISOString() }, null, 2));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, '..'), { recursive: true });
  renameSync(tmp, dir);
  console.log(`draft written by ${writer}: ${draft.key_points.length} key points, ${draft.moments.length} moments. Next: check ${id}`);
}

async function cmdCheck(client, id) {
  const row = await getRow(client, id);
  const err = transitionError('check', row?.status);
  if (err) die(err);
  const { meta, segs, sha } = readStore(id, row);
  if (meta.duration !== row.duration_seconds) die('stored transcript is for a different duration than the row — re-draft');
  const draft = draftFromRow(row);
  const bound = { transcript_sha256: sha, content_sha256: contentSha(createHash, row) };
  const mech = mechanicalCheck(draft, segs, row.duration_seconds);
  if (mech.length) {
    writeFileSync(join(storeDir(id), 'check.json'), JSON.stringify({ pass: false, failures: mech, ...bound, at: new Date().toISOString() }, null, 2));
    die(`mechanical check failed, row stays draft:\n  - ${mech.join('\n  - ')}`);
  }
  console.log('asking the checker (Codex)…');
  const nonce = randomBytes(12).toString('hex');
  const { text, checker, effort } = await checkWithCodex(checkerPrompt(meta, segs, draft, nonce));
  console.log(`checker ${checker} ran at effort ${effort}`);
  if (sameVendor(checker, row.written_by)) die(`checker ${checker} is the same vendor as writer ${row.written_by}`);
  writeFileSync(join(storeDir(id), 'check.raw.txt'), text, { mode: 0o600 });
  chmodSync(join(storeDir(id), 'check.raw.txt'), 0o600);
  const verdict = parseCheckerVerdict(text, draft, nonce, row.duration_seconds);
  writeFileSync(join(storeDir(id), 'check.json'), JSON.stringify({ checker, ...verdict, ...bound, at: new Date().toISOString() }, null, 2));
  if (!verdict.pass) die(`checker ${checker} failed the summary, row stays draft:\n  - ${verdict.failures.join('\n  - ')}`);

  const now = new Date().toISOString();
  const { data, error } = await client
    .from('video_summaries')
    .update({ status: 'checked', checked_by: checker, checked_at: now, updated_at: now })
    .eq('video_id', id)
    .eq('status', 'draft')
    .eq('updated_at', row.updated_at) // a re-draft since we read the row voids this check
    .select('video_id');
  if (error) die(`marking checked failed: ${error.message}`);
  if (!data?.length) die('the row changed while it was being checked — run check again');
  console.log(`checked by ${checker}: ${verdict.results.length} items passed. Next: the operator runs confirm ${id}`);
}

async function cmdConfirm(client, id, label) {
  const row = await getRow(client, id);
  const err = transitionError('confirm', row?.status);
  if (err) die(err);
  const report = readReport(id);
  // The passing report must be about exactly this content and transcript (the DB trigger also
  // voids a check on any content edit; this catches a report from another draft or environment).
  if (!report?.pass) die('no passing checker report for this row in the store — run check');
  if (report.content_sha256 !== contentSha(createHash, row) || report.transcript_sha256 !== row.transcript_sha256)
    die('the passing checker report is for different content than this row — run check again');
  if (!process.stdin.isTTY) die('confirm is the operator\'s own review: run it in a terminal, not from a pipe or a script');
  console.log(`\n${row.title} — ${row.channel} — ${mmss(row.duration_seconds)}   [${label}]`);
  console.log(`https://www.youtube.com/watch?v=${id}\n`);
  console.log(`TL;DR  ${row.tldr ?? ''}\n`);
  row.key_points.forEach((k, i) => console.log(`${i + 1}. ${k}`));
  console.log(`\n${row.summary}\n`);
  row.moments.forEach((m) => console.log(`  ${mmss(m.t).padStart(7)}  ${m.note}`));
  console.log(`\nwritten by ${row.written_by} · checked by ${row.checked_by} · checker report: ${report.results?.length ?? 0} items passed`);
  console.log('\nConfirm only after checking it against the video. Once confirmed, "Read video summary" appears under this video.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`Type the video id (${id}) to confirm, anything else to cancel: `)).trim();
  rl.close();
  if (answer !== id) die('not confirmed — nothing changed', 0);
  const now = new Date().toISOString();
  const { data, error } = await client
    .from('video_summaries')
    .update({ status: 'confirmed', confirmed_at: now, updated_at: now })
    .eq('video_id', id)
    .eq('status', 'checked')
    .eq('updated_at', row.updated_at)
    .select('video_id');
  if (error) die(`confirming failed: ${error.message}`);
  if (!data?.length) die('the row changed since it was shown — nothing confirmed');
  console.log(`confirmed on ${label}. The link now shows under every player of ${id}.`);
}

async function cmdDemote(client, id) {
  const row = await getRow(client, id);
  const err = transitionError('demote', row?.status);
  if (err) die(err);
  const { error } = await client
    .from('video_summaries')
    .update({ status: 'draft', checked_by: null, checked_at: null, confirmed_at: null, updated_at: new Date().toISOString() })
    .eq('video_id', id);
  if (error) die(`demoting failed: ${error.message}`);
  console.log(`${id} is back to draft (was ${row.status}); its link is gone.`);
}

async function cmdList(client) {
  const { data, error } = await client.from('video_summaries').select('video_id,status,title,written_by,checked_by,updated_at').order('updated_at', { ascending: false });
  if (error) die(error.message);
  for (const r of data ?? []) console.log(`${r.video_id}  ${r.status.padEnd(9)}  ${r.title.slice(0, 60)}`);
  if (!data?.length) console.log('(no rows)');
}

async function main() {
  const usage = 'usage: video-summary.mjs <draft|check|confirm|demote|list> [video id|url] [--env test|prod] [--force] [--revise]';
  const flags = { env: null, force: false, revise: false };
  const positional = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--env') {
      if (flags.env !== null) die('--env given twice', 2);
      flags.env = argv[++i];
      if (flags.env !== 'test' && flags.env !== 'prod') die('--env must be test or prod', 2);
    } else if (a === '--force' || a === '--revise') {
      if (flags[a.slice(2)]) die(`${a} given twice`, 2);
      flags[a.slice(2)] = true;
    } else if (a.startsWith('-')) die(`unknown option ${a}\n${usage}`, 2);
    else positional.push(a);
  }
  const [command, target, ...extra] = positional;
  const commands = ['draft', 'check', 'confirm', 'demote', 'list'];
  if (!commands.includes(command)) die(usage, 2);
  if (extra.length) die(`unexpected arguments: ${extra.join(' ')}\n${usage}`, 2);
  if ((flags.force || flags.revise) && command !== 'draft') die('--force and --revise apply only to draft', 2);
  const id = command === 'list' ? null : parseVideoId(target);
  if (command !== 'list' && !id) die(`not a YouTube video id or URL: ${target ?? '(none)'}\n${usage}`, 2);
  if (command === 'list' && target) die(`list takes no video\n${usage}`, 2);
  // Everything is validated before a prod credential is requested.
  ENV = flags.env ?? 'test';
  const { client, label } = await db(ENV);
  console.log(`[${label}] ${command}${id ? ` ${id}` : ''}`);
  if (command === 'list') return cmdList(client);
  if (command === 'draft') return cmdDraft(client, id, flags.force, flags.revise);
  if (command === 'check') return cmdCheck(client, id);
  if (command === 'confirm') return cmdConfirm(client, id, label);
  return cmdDemote(client, id);
}

main().catch((e) => die(e?.stack || String(e)));
