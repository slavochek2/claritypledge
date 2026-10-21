#!/usr/bin/env node
/**
 * P1528: move agent avatars from the Supabase Storage `agent-avatars` bucket to the public media
 * host (gs://claritypledge-story-images), as 256x256 metadata-stripped WebP with a 1-year
 * immutable cache header, then repoint profiles.avatar_url.
 *
 * Usage:
 *   node scripts/p1528-agent-avatars-to-media-host.mjs --env test|prod [--manifest <file>]
 *       DRY RUN (default): read-only. Lists the agent profiles it would migrate. Needs no service key.
 *   node scripts/p1528-agent-avatars-to-media-host.mjs --env test|prod --apply [--manifest <file>]
 *       Per profile: download, resize, verify WebP 256x256, create-only upload, HEAD-assert the public
 *       URL, guarded PATCH of profiles.avatar_url, read-back. Snapshot written first.
 *       PROD REQUIRES --manifest: a file of the approved profile ids (one UUID per line); the selected
 *       set must equal it exactly or the run aborts before any write.
 *   node scripts/p1528-agent-avatars-to-media-host.mjs --env test|prod --rollback <snapshot.json>
 *       Writes the snapshotted old URLs back, guarded on avatar_url = the new URL. Does not delete
 *       media-bucket objects (immutable, create-only).
 *
 * Keys: test reads TEST_SUPABASE_SERVICE_ROLE_KEY from .env.local; prod reads the locked
 * PROD_SUPABASE_SERVICE_ROLE_KEY through the keyring only (one dialog, answer Allow). Sent in a
 * request header only, never in argv or output. Uploads use the operator's gcloud login.
 * Snapshots: <main repo>/.private/p1528/ (gitignored).
 *
 * Exit: 0 ok/dry run - 1 usage/config - 2 any profile failed - 3 manifest mismatch
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { keyringGet } from './lib/keyring.mjs';
import {
  MEDIA_BUCKET, CACHE_CONTROL, AVATAR_SIZE, isUuid, parseOldUrl, newObjectPath, mediaUrl,
  checkManifest, parseManifest, isWebpOfSize,
} from './lib/p1528-agent-avatars.mjs';

const URLS = {
  test: 'https://ayibkeoyukulbsjpxgaw.supabase.co',
  prod: 'https://besjtuodziykmjidubzw.supabase.co',
};
const PAGE = 500;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WT_MARK = '/.claude/worktrees/';
const MAIN_ROOT = REPO_ROOT.includes(WT_MARK) ? REPO_ROOT.slice(0, REPO_ROOT.indexOf(WT_MARK)) : REPO_ROOT;
const ROOTS = MAIN_ROOT === REPO_ROOT ? [REPO_ROOT] : [REPO_ROOT, MAIN_ROOT];
const CWEBP = existsSync('/opt/homebrew/bin/cwebp') ? '/opt/homebrew/bin/cwebp' : 'cwebp';
const DWEBP = existsSync('/opt/homebrew/bin/dwebp') ? '/opt/homebrew/bin/dwebp' : 'dwebp';

function die(msg, code = 1) { console.error(`ERROR: ${msg}`); process.exit(code); }

function readEnvFile(name) {
  const p = ROOTS.map((r) => resolve(r, name)).find((f) => existsSync(f));
  if (!p) return {};
  return Object.fromEntries(readFileSync(p, 'utf8').split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
}

function parseArgs(argv) {
  const a = { env: null, apply: false, manifest: null, rollback: null };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--env') a.env = argv[++i];
    else if (v === '--apply') a.apply = true;
    else if (v === '--manifest') a.manifest = argv[++i];
    else if (v === '--rollback') a.rollback = argv[++i];
    else die(`unknown argument: ${v}`);
  }
  if (a.env !== 'test' && a.env !== 'prod') die('--env test|prod is required');
  if (a.apply && a.rollback) die('--apply and --rollback are exclusive');
  if (a.apply && a.env === 'prod' && !a.manifest) die('prod --apply requires --manifest <file> of the approved profile ids');
  return a;
}

function anonKey(env) {
  const k = readEnvFile(env === 'test' ? '.env.test.local' : '.env.prod').VITE_SUPABASE_ANON_KEY;
  if (!k) die(`no anon key for ${env}`);
  return k;
}

function serviceKey(env, reason) {
  if (env === 'test') {
    const k = readEnvFile('.env.local').TEST_SUPABASE_SERVICE_ROLE_KEY;
    if (!k) die('TEST_SUPABASE_SERVICE_ROLE_KEY not set in .env.local');
    return k;
  }
  try { return keyringGet('PROD_SUPABASE_SERVICE_ROLE_KEY', reason); } catch (e) { die(e.message); }
}

async function getJson(url, key) {
  const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) die(`read failed: HTTP ${res.status} ${url.split('?')[0]}`);
  return res.json();
}

/** Every agent profile (agent_accounts -> profiles), paginated to exhaustion, read over anon. */
async function agentProfiles(base, anon) {
  const ids = [];
  for (let offset = 0; ; offset += PAGE) {
    const rows = await getJson(`${base}/rest/v1/agent_accounts?select=profile_id&order=profile_id&limit=${PAGE}&offset=${offset}`, anon);
    ids.push(...rows.map((r) => r.profile_id));
    if (rows.length < PAGE) break;
  }
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    out.push(...await getJson(`${base}/rest/v1/profiles?select=id,name,avatar_url&id=in.(${chunk.join(',')})`, anon));
  }
  return { total: ids.length, profiles: out };
}

function snapshotPath(env) {
  const dir = join(MAIN_ROOT, '.private', 'p1528');
  mkdirSync(dir, { recursive: true });
  return join(dir, `${env}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
}

/** Download old bytes, resize with cwebp, verify by header AND by decoding. Returns the webp Buffer. */
async function buildWebp(oldUrl, tmp, id) {
  const res = await fetch(oldUrl);
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  const src = join(tmp, `${id}.src`);
  const dst = join(tmp, `${id}.webp`);
  writeFileSync(src, Buffer.from(await res.arrayBuffer()));
  // Source may be PNG or JPEG bytes (P1370); cwebp reads both. Strip all metadata.
  execFileSync(CWEBP, ['-quiet', '-resize', String(AVATAR_SIZE), String(AVATAR_SIZE), '-q', '80', '-metadata', 'none', src, '-o', dst]);
  const buf = readFileSync(dst);
  if (!isWebpOfSize(buf)) throw new Error('output is not a 256x256 WebP (header)');
  execFileSync(DWEBP, ['-quiet', dst, '-o', join(tmp, `${id}.check.png`)]); // throws if undecodable
  return { buf, file: dst };
}

/** Create-only upload: fails if the object already exists. */
function upload(file, objectPath) {
  execFileSync('gcloud', [
    'storage', 'cp', file, `gs://${MEDIA_BUCKET}/${objectPath}`,
    '--if-generation-match=0', `--cache-control=${CACHE_CONTROL}`, '--content-type=image/webp', '--quiet',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
}

async function assertPublic(url) {
  const res = await fetch(url, { method: 'HEAD' });
  const ct = res.headers.get('content-type') ?? '';
  const cc = res.headers.get('cache-control') ?? '';
  if (res.status !== 200) throw new Error(`HEAD ${res.status}`);
  if (!ct.startsWith('image/webp')) throw new Error(`content-type ${ct}`);
  if (!cc.includes('max-age=31536000')) throw new Error(`cache-control ${cc}`);
}

/** Guarded PATCH: only the row still holding `from`; must return exactly one row holding `to`. */
async function guardedPatch(base, key, id, from, to) {
  const res = await fetch(`${base}/rest/v1/profiles?id=eq.${id}&avatar_url=eq.${encodeURIComponent(from)}`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ avatar_url: to }),
  });
  if (!res.ok) throw new Error(`PATCH HTTP ${res.status}`);
  const rows = await res.json();
  if (rows.length !== 1 || rows[0].id !== id || rows[0].avatar_url !== to) throw new Error(`PATCH returned ${rows.length} row(s), expected exactly 1 with the new url`);
}

/** Rollback must never restore a URL that no longer serves an image (portrait would fall to initials). */
async function assertImage(url) {
  const res = await fetch(url, { method: 'HEAD' });
  const ct = res.headers.get('content-type') ?? '';
  if (res.status !== 200 || !ct.startsWith('image/')) throw new Error(`old url not an image: ${res.status} ${ct}`);
}

async function currentUrl(base, anon, id) {
  const rows = await getJson(`${base}/rest/v1/profiles?select=id,avatar_url&id=eq.${id}`, anon);
  if (rows.length !== 1) throw new Error(`profile read returned ${rows.length} row(s)`);
  return rows[0].avatar_url;
}

async function readBack(base, anon, id, expected) {
  const rows = await getJson(`${base}/rest/v1/profiles?select=id,avatar_url&id=eq.${id}`, anon);
  if (rows.length !== 1 || rows[0].avatar_url !== expected) throw new Error('read-back mismatch');
}

async function rollback(args, base, anon) {
  const snap = JSON.parse(readFileSync(args.rollback, 'utf8'));
  if (snap.env !== args.env) die(`snapshot is for ${snap.env}, not ${args.env}`);
  const key = serviceKey(args.env, `p1528: roll back ${snap.rows.length} agent avatar(s) on ${args.env}`);
  let failed = 0;
  for (const r of snap.rows) {
    try {
      const cur = await currentUrl(base, anon, r.id);
      if (cur === r.old) { console.log(`ALREADY OLD ${r.id}`); continue; }
      if (cur !== r.new) throw new Error('row holds neither the snapshotted old nor new url; refusing');
      await assertImage(r.old);
      await guardedPatch(base, key, r.id, r.new, r.old);
      await readBack(base, anon, r.id, r.old);
      console.log(`ROLLED BACK ${r.id}`);
    } catch (e) { failed++; console.error(`FAIL ${r.id}: ${e.message}`); }
  }
  return failed ? 2 : 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const base = URLS[args.env];
  const anon = anonKey(args.env);
  if (args.rollback) return rollback(args, base, anon);

  const { total, profiles } = await agentProfiles(base, anon);
  const rows = [];
  const skipped = [];
  for (const p of profiles) {
    const parsed = parseOldUrl(base, p.avatar_url);
    if (!parsed) { skipped.push(p); continue; }
    rows.push({ id: p.id, name: p.name, old: p.avatar_url, new: mediaUrl(newObjectPath(args.env, parsed)), path: newObjectPath(args.env, parsed) });
  }
  console.log(`env: ${args.env} - agents: ${total} - on Supabase agent-avatars: ${rows.length} - skipped (other/none): ${skipped.length}`);
  for (const r of rows) console.log(`  ${r.id}  ${r.name}\n    ${r.old}\n -> ${r.new}`);
  for (const s of skipped) console.log(`  SKIP ${s.id}  ${s.name}  avatar_url=${s.avatar_url ?? 'null'}`);

  if (args.manifest) {
    const m = checkManifest(rows.map((r) => r.id), parseManifest(readFileSync(args.manifest, 'utf8')));
    if (!m.ok) {
      console.error(`MANIFEST MISMATCH: unexpected=[${m.unexpected}] missing=[${m.missing}]`);
      return 3;
    }
    console.log(`manifest: selected set matches exactly (${rows.length})`);
  }
  if (!args.apply) { console.log('DRY RUN: nothing written. Re-run with --apply to migrate these.'); return 0; }
  if (rows.length === 0) return 0;

  const snapFile = snapshotPath(args.env);
  writeFileSync(snapFile, JSON.stringify({ env: args.env, taken: new Date().toISOString(), rows: rows.map(({ id, old, new: n }) => ({ id, old, new: n })) }, null, 2));
  console.log(`snapshot: ${snapFile}`);

  const key = serviceKey(args.env, `p1528: repoint ${rows.length} agent avatar(s) on ${args.env}`);
  const tmp = mkdtempSync(join(tmpdir(), 'p1528-'));
  let failed = 0;
  try {
    for (const r of rows) {
      try {
        // Resume: a prior run may have uploaded this create-only object and then failed before the
        // row update. Reuse it only if it already passes the same public check the upload must pass.
        const reuse = await assertPublic(r.new).then(() => true, () => false);
        if (!reuse) {
          const { file } = await buildWebp(r.old, tmp, r.id);
          upload(file, r.path);
          await assertPublic(r.new);
        }
        await guardedPatch(base, key, r.id, r.old, r.new);
        await readBack(base, anon, r.id, r.new);
        console.log(`OK   ${r.id} ${r.name}`);
      } catch (e) { failed++; console.error(`FAIL ${r.id}: ${String(e.message).slice(0, 300)}`); }
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  console.log(`done: ${rows.length - failed} ok, ${failed} failed. Rollback: --rollback ${snapFile}`);
  return failed ? 2 : 0;
}

main().then((c) => process.exit(c), (e) => die(e.message));
