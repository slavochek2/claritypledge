#!/usr/bin/env npx tsx
/**
 * P1417: make the small copy (800px WebP) of event banners, stored next to the original at the
 * path `src/lib/banner-small.ts` derives (`<original path>.w800.webp`). The app requests that copy
 * on phones and falls back to the original when it does not exist, so running this is always
 * safe to repeat and never required for the site to work.
 *
 * Usage:
 *   npx tsx scripts/event-banner-small.ts encode <input-image> <output.webp>     # local only, no network
 *   npx tsx scripts/event-banner-small.ts backfill --env test|prod [--dry-run] [--force]
 *   npx tsx scripts/event-banner-small.ts one --env test|prod <banner_url> [--force]
 *
 * backfill: every events row's banner_url and banner_mobile_url. Skips URLs with no derivable copy
 * (GCS, story/profile banners), URLs on the other environment's storage, and copies at least as
 * new as their original (unless --force). A copy OLDER than its original (the original was
 * replaced at the same path) is stale and is replaced; nothing else is ever overwritten. Writes ONLY the small copies — never an original, never a DB row.
 * Rows are listed with the public anon key (events SELECT is USING (true)); --dry-run writes nothing.
 *
 * Credentials: test uses TEST_SUPABASE_SERVICE_ROLE_KEY from .env.local (routine half). Prod reads
 * the service key through the per-access lock (scripts/lib/keyring.mjs, P1316) — one dialog per
 * run, only when something will be written. The key never reaches a command's argv. Env files are
 * read from this checkout, else from the main checkout (a worktree has no .env.prod).
 *
 * Exit: 0 all done or skipped · 1 usage/credential error · 2 at least one banner failed.
 * Status lines use ':' separators only (shell-safety.md).
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { parseBannerStorageUrl, bannerSmallUrl } from '../src/lib/banner-small';
import { encodeSmallBanner } from './lib/banner-small-encode';
import { keyringGet } from './lib/keyring.mjs';

type EnvName = 'test' | 'prod';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const URLS: Record<EnvName, string> = {
  test: 'https://gfjctyxqlwexxwsmkakq.supabase.co',
  prod: 'https://besjtuodziykmjidubzw.supabase.co',
};
const PAGE = 500;

function die(msg: string, code = 1): never {
  console.error(`ERROR: ${msg}`);
  process.exit(code);
}

// <main>/.claude/worktrees/wN: a worktree reads env files the main checkout holds.
const WT_MARK = '/.claude/worktrees/';
const ROOTS = REPO_ROOT.includes(WT_MARK) ? [REPO_ROOT, REPO_ROOT.slice(0, REPO_ROOT.indexOf(WT_MARK))] : [REPO_ROOT];

function readEnvFile(name: string): Record<string, string> {
  const p = ROOTS.map((r) => resolve(r, name)).find((f) => existsSync(f));
  if (!p) return {};
  return Object.fromEntries(
    readFileSync(p, 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
      }),
  );
}

/** Read key: anon is enough to list (events SELECT is public) and storage reads are public. */
function readKey(env: EnvName): string {
  const k = env === 'test' ? readEnvFile('.env.test.local').VITE_SUPABASE_ANON_KEY : readEnvFile('.env.prod').VITE_SUPABASE_ANON_KEY;
  if (!k) die(`no anon key for ${env} (.env.${env === 'test' ? 'test.local' : 'prod'}: VITE_SUPABASE_ANON_KEY)`);
  return k;
}

function writeKey(env: EnvName): string {
  if (env === 'test') {
    const k = readEnvFile('.env.local').TEST_SUPABASE_SERVICE_ROLE_KEY;
    if (!k) die('TEST_SUPABASE_SERVICE_ROLE_KEY not set in .env.local');
    return k;
  }
  try {
    return keyringGet('PROD_SUPABASE_SERVICE_ROLE_KEY', 'event-banner-small: upload small banner copies to prod storage');
  } catch (e) {
    die((e as Error).message);
  }
}

async function listBannerUrls(base: string, key: string): Promise<string[]> {
  const urls = new Set<string>();
  for (let offset = 0; ; offset += PAGE) {
    const q = `select=id,banner_url,banner_mobile_url&or=(banner_url.not.is.null,banner_mobile_url.not.is.null)&order=id&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(`${base}/rest/v1/events?${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) die(`events read failed: HTTP ${res.status} ${await res.text()}`);
    const rows = (await res.json()) as { banner_url: string | null; banner_mobile_url: string | null }[];
    for (const r of rows) {
      if (r.banner_url) urls.add(r.banner_url);
      if (r.banner_mobile_url) urls.add(r.banner_mobile_url);
    }
    if (rows.length < PAGE) break; // paginated to exhaustion
  }
  return [...urls];
}

/**
 * An object's last_modified from the storage INFO endpoint (public bucket, no key needed), or null
 * when it does not exist. Not the public URL's HEAD: that is CDN-cached, and on TEST it kept the
 * old Last-Modified after an upsert (measured during P1417).
 */
async function lastModified(base: string, bucket: string, path: string): Promise<number | null> {
  const res = await fetch(`${base}/storage/v1/object/info/public/${bucket}/${path}`);
  if (!res.ok) return null;
  const t = Date.parse(((await res.json()) as { last_modified?: string }).last_modified ?? '');
  return Number.isNaN(t) ? null : t;
}

export type Outcome = 'made' | 'would-make' | 'exists' | 'skipped' | 'failed';

export async function processUrl(
  url: string,
  base: string,
  opts: { dryRun: boolean; force: boolean; getWriteKey: () => string },
): Promise<Outcome> {
  // One unreachable banner must not end the run: it is counted, and the run exits 2 at the end.
  try {
    return await processUrlUnsafe(url, base, opts);
  } catch (e) {
    console.log(`FAIL  : ${(e as Error).message} : ${url}`);
    return 'failed';
  }
}

async function processUrlUnsafe(
  url: string,
  base: string,
  opts: { dryRun: boolean; force: boolean; getWriteKey: () => string },
): Promise<Outcome> {
  const obj = parseBannerStorageUrl(url);
  const small = bannerSmallUrl(url);
  if (!obj || !small) {
    console.log(`skip  : no small copy for this kind of URL : ${url}`);
    return 'skipped';
  }
  if (!url.startsWith(`${base}/`)) {
    console.log(`skip  : stored on another environment : ${url}`);
    return 'skipped';
  }

  // A copy older than its original means the original was replaced at the same path (a new crop):
  // the copy shows the old picture, so it is treated as missing and replaced.
  const smallAt = await lastModified(base, obj.bucket, obj.smallPath);
  const origAt = await lastModified(base, obj.bucket, obj.path);
  let stale = false;
  if (smallAt !== null && !opts.force) {
    stale = origAt !== null && smallAt < origAt;
    if (!stale) {
      console.log(`exists: ${obj.bucket}/${obj.smallPath}`);
      return 'exists';
    }
  }
  const label = stale ? 'stale ' : '';
  if (opts.dryRun) {
    console.log(`would : ${label}${obj.bucket}/${obj.smallPath}`);
    return 'would-make';
  }

  const orig = await fetch(url);
  if (!orig.ok) {
    console.log(`FAIL  : original HTTP ${orig.status} : ${url}`);
    return 'failed';
  }
  const input = Buffer.from(await orig.arrayBuffer());
  let encoded: Awaited<ReturnType<typeof encodeSmallBanner>>;
  try {
    encoded = await encodeSmallBanner(input);
  } catch (e) {
    console.log(`FAIL  : could not decode (${(e as Error).message}) : ${url}`);
    return 'failed';
  }

  // The original may have been replaced while this run downloaded and encoded it (a concurrent
  // refresh): then this copy is of the old picture, so do not upload it. A replace landing between
  // this check and the upload can still slip through — accepted, banners have a single operator.
  if ((await lastModified(base, obj.bucket, obj.path)) !== origAt) {
    console.log(`skip  : original changed during this run, run again : ${obj.bucket}/${obj.path}`);
    return 'skipped';
  }

  const key = opts.getWriteKey();
  // Overwrite only on purpose: --force, or a stale copy. Otherwise a copy that appeared since the
  // check above (another run, an upload) wins, and the conflict is a skip.
  const replace = opts.force || stale;
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'image/webp',
    // Same as the hand-uploaded originals' stored cache_control.
    'cache-control': 'no-cache',
  };
  if (replace) headers['x-upsert'] = 'true';
  const up = await fetch(`${base}/storage/v1/object/${obj.bucket}/${obj.smallPath}`, {
    method: 'POST',
    headers,
    body: encoded.data,
  });
  if (!up.ok) {
    const text = await up.text();
    if (!replace && (up.status === 409 || /Duplicate|already exists/i.test(text))) {
      console.log(`exists: ${obj.bucket}/${obj.smallPath} (made concurrently)`);
      return 'exists';
    }
    console.log(`FAIL  : upload HTTP ${up.status} ${text} : ${obj.bucket}/${obj.smallPath}`);
    return 'failed';
  }
  // Read it back through the public URL the app uses (cache-busted) — the upload's 200 is not the proof.
  const check = await fetch(`${small}${small.includes('?') ? '&' : '?'}v=${Date.now()}`, { method: 'HEAD' });
  const type = check.headers.get('content-type') ?? '';
  if (check.status !== 200 || !type.startsWith('image/webp')) {
    console.log(`FAIL  : uploaded but public HEAD says ${check.status} ${type} : ${small}`);
    return 'failed';
  }
  console.log(`made  : ${label}${obj.bucket}/${obj.smallPath} : ${input.length} B original, ${encoded.data.length} B small, ${encoded.width}x${encoded.height}`);
  return 'made';
}

function parseEnv(args: string[]): EnvName {
  const i = args.indexOf('--env');
  const v = i >= 0 ? args[i + 1] : undefined;
  if (v !== 'test' && v !== 'prod') die('--env test|prod is required');
  return v;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === 'encode') {
    const [input, output] = args;
    if (!input || !output) die('usage: encode <input-image> <output.webp>');
    const { data, width, height } = await encodeSmallBanner(readFileSync(input));
    writeFileSync(output, data);
    console.log(`encoded: ${output} : ${data.length} B, ${width}x${height}`);
    return;
  }

  if (cmd !== 'backfill' && cmd !== 'one') {
    die('usage: encode <in> <out> | backfill --env test|prod [--dry-run] [--force] | one --env test|prod <banner_url> [--force]');
  }
  const env = parseEnv(args);
  const base = URLS[env];
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  let cachedKey: string | undefined;
  const getWriteKey = () => (cachedKey ??= writeKey(env)); // one dialog per run, only if needed

  let urls: string[];
  if (cmd === 'one') {
    const url = args.find((a) => a.startsWith('http'));
    if (!url) die('one: pass the banner URL');
    urls = [url];
  } else {
    urls = await listBannerUrls(base, readKey(env));
  }

  console.log(`${env}: ${urls.length} banner URL(s)${dryRun ? ' (dry run, nothing written)' : ''}`);
  const counts: Record<Outcome, number> = { made: 0, 'would-make': 0, exists: 0, skipped: 0, failed: 0 };
  for (const url of urls) counts[await processUrl(url, base, { dryRun, force, getWriteKey })]++;
  console.log(
    `done: made ${counts.made}, would make ${counts['would-make']}, already there ${counts.exists}, skipped ${counts.skipped}, failed ${counts.failed}`,
  );
  if (counts.failed > 0) process.exit(2);
}

// Run only as a CLI, so tests can import processUrl.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => die((e as Error).stack ?? String(e)));
}
