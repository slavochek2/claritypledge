#!/usr/bin/env node
/**
 * e2e-load-test.mjs — P1607: measure how many e2e runs the self-hosted TEST server carries at once.
 * Re-run it when the machine changes, then set SELFHOSTED_SLOT_LIMIT in scripts/lib/e2e-slot-lock.mjs.
 *
 *   node scripts/e2e-load-test.mjs --level <1-4> [--out <dir>] [--repeat 6] [--stop-ms 8000] [--no-ssh]
 *
 * Self-hosted TEST ONLY. It starts K identical Playwright runs from this checkout at the same moment, each
 * with E2E_LOADTEST=<i> (own port, own output, no lock: see scripts/lib/e2e-loadtest.mjs, which refuses
 * every other database) and a FIXED workload that calls no metered service (the spec list below). While
 * every run is alive it samples: database response (a timed REST read), the Mac's load and free memory, and
 * the server's load and memory over IAP ssh (read-only). Afterwards it reads each run's JSON report and
 * counts failures, retries and auth 429s, and reads the server's auth and edge-function logs for the window.
 *
 * It never touches a lock directory and never signals a process it did not start. Other sessions on the
 * server count toward the level: the driver names the Playwright runs it sees (and the holder of the old
 * lock) at the start and at every sample. It stops its own runs, and says so, when a database read takes
 * longer than --stop-ms twice in a row or fails three times in a row.
 */
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';
import { loadTestRefusal, loadTestPort } from './lib/e2e-loadtest.mjs';
import { WORKLOAD } from './lib/e2e-load-workload.mjs';
import { worktreePort } from './lib/worktree-port.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export { WORKLOAD };


const GCP = ['--project=gen-lang-client-0869694595', '--zone=asia-southeast1-a', '--tunnel-through-iap', '--quiet'];
const SSH_HOST = 'cp-test-supabase';

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i < 0 ? dflt : process.argv[i + 1];
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };

/** One timed REST read, as the lock's own probe does. */
async function probeDb(url, anonKey) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, { headers: { apikey: anonKey }, signal: AbortSignal.timeout(15_000) });
    return { ms: Math.round(performance.now() - t0), status: res.status };
  } catch (e) {
    return { ms: Math.round(performance.now() - t0), status: 0, error: e.name };
  }
}

function macSample() {
  let freeMb = null;
  try {
    const out = execFileSync('vm_stat').toString();
    const page = Number(/page size of (\d+)/.exec(out)?.[1] ?? 16384);
    const n = k => Number(new RegExp(`${k}:\\s+(\\d+)`).exec(out)?.[1] ?? 0);
    freeMb = Math.round(((n('Pages free') + n('Pages inactive') + n('Pages speculative')) * page) / 1048576);
  } catch { /* leave null */ }
  return { load1: Number(os.loadavg()[0].toFixed(2)), freeMb };
}

/** Playwright test runs on this Mac that are not ours: named by worktree, so the level can be stated honestly. */
function otherRuns(myPids) {
  const out = spawnSync('ps', ['-ax', '-o', 'pid=,etime=,command='], { encoding: 'utf8' }).stdout ?? '';
  const rows = [];
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const [, pid, etime, cmd] = m;
    if (!/node .*node_modules\/\.bin\/playwright test|node .*playwright\/cli\.js test|node .*@playwright\/test\/cli\.js test/.test(cmd) || /--list/.test(cmd)) continue;
    if (myPids.has(Number(pid))) continue;
    const wt = /\/worktrees\/([^/]+)\//.exec(cmd)?.[1] ?? 'main-or-unknown';
    rows.push({ pid: Number(pid), worktree: wt, etime, cmd: cmd.replace(/^.*node_modules\/\.bin\//, '').slice(0, 90) });
  }
  return rows;
}

function oldLockHolder() {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: REPO }).toString().trim();
    return JSON.parse(fs.readFileSync(path.join(common, 'e2e-test-db-selfhosted.lock', 'owner.json'), 'utf8'));
  } catch { return null; }
}

/** Read-only look at another worktree's test-results directory: new entries there mean a test over there kept artifacts (failed or retried). */
function resultsEntries(worktree) {
  try { return fs.readdirSync(path.join(REPO, '..', worktree, 'test-results')).sort(); } catch { return null; }
}

function sshServer(command) {
  return new Promise((resolve) => {
    const p = spawn('gcloud', ['compute', 'ssh', SSH_HOST, ...GCP, '--command', command], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.on('close', code => resolve({ code, out }));
    p.on('error', () => resolve({ code: -1, out: '' }));
    setTimeout(() => p.kill('SIGTERM'), 45_000).unref();
  });
}
const SERVER_SAMPLE = `echo LOAD:$(cut -d' ' -f1 /proc/loadavg); echo MEMAVAIL:$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo); echo NETTX:$(awk '/:/ && !/lo:/ {split($0,a,":"); n=split(a[2],f," "); print f[9]; exit}' /proc/net/dev)`;
const parseServer = out => ({
  load1: Number(/LOAD:([\d.]+)/.exec(out)?.[1] ?? NaN),
  availMb: Number(/MEMAVAIL:(\d+)/.exec(out)?.[1] ?? NaN),
  txBytes: Number(/NETTX:(\d+)/.exec(out)?.[1] ?? NaN), // the server's outgoing bytes counter, ALL traffic on it (other sessions included)
});

function scanReport(file) {
  const r = { file, stats: null, failed: [], retried: 0, rate429: 0, specsRun: 0, readable: false };
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return r; }
  r.readable = true; r.stats = j.stats;
  const RATE = /\b429\b|over_request_rate_limit|rate.?limit/i;
  const walk = (suite, trail) => {
    const t = [...trail, suite.title].filter(Boolean);
    for (const spec of suite.specs ?? []) {
      r.specsRun++;
      for (const test of spec.tests ?? []) {
        const results = test.results ?? [];
        if (results.length > 1) r.retried++;
        for (const res of results) if (RATE.test(JSON.stringify(res.errors ?? res.error ?? ''))) r.rate429++;
        if (test.status === 'unexpected') {
          const last = results[results.length - 1];
          r.failed.push({ title: [...t, spec.title].join(' > ').slice(0, 160), error: String(last?.error?.message ?? last?.errors?.[0]?.message ?? '').split('\n')[0].slice(0, 200) });
        }
      }
    }
    for (const s of suite.suites ?? []) walk(s, t);
  };
  for (const s of j.suites ?? []) walk(s, []);
  return r;
}

async function main() {
  const level = Number(arg('--level'));
  if (!Number.isInteger(level) || level < 1 || level > 4) { console.error('usage: e2e-load-test.mjs --level <1-4> [--out dir] [--repeat 6] [--stop-ms 8000] [--no-ssh]'); process.exit(2); }
  const stopMs = Number(arg('--stop-ms', '8000'));
  const useSsh = !process.argv.includes('--no-ssh');
  const repeat = Number(arg('--repeat', '6')); // a run lasts long enough to overlap the others for minutes
  const out = arg('--out', path.join(os.tmpdir(), `p1607-loadtest-${Date.now()}`));
  fs.mkdirSync(out, { recursive: true });

  dotenv.config({ path: path.join(REPO, '.env.test.local') });
  const url = process.env.VITE_SUPABASE_URL ?? '';
  const anon = process.env.VITE_SUPABASE_ANON_KEY ?? '';
  // The driver's own check (the Playwright runs it starts repeat it from inside the config, with their real argv).
  const refusal = loadTestRefusal({ url, env: { ...process.env, E2E_LOADTEST_DRIVER_PID: String(process.pid) }, argv: null, pid: process.pid, ancestorCheck: false });
  if (refusal) { console.error(`[P1607 load] refused: ${refusal}`); process.exit(1); }

  const base = worktreePort(REPO);
  const legacy = oldLockHolder();
  const othersAtStart = otherRuns(new Set());
  const w1Watch = [...new Set(othersAtStart.map(o => o.worktree))].map(w => ({ worktree: w, before: resultsEntries(w) }));
  console.log(`[P1607 load] level ${level}: ${level} run(s) x ${WORKLOAD.length} specs x ${repeat} repeats, ports ${Array.from({ length: level }, (_, i) => loadTestPort(base, i + 1)).join(',')}`);
  console.log(`[P1607 load] others on the server at start: ${othersAtStart.map(o => `${o.worktree} (pid ${o.pid}, up ${o.etime}, ${o.cmd})`).join('; ') || 'none'}; old-lock holder: ${legacy ? `${legacy.worktree} pid ${legacy.pid}` : 'none'}`);

  // Pre-level health: three timed reads.
  const baseline = [];
  for (let i = 0; i < 3; i++) { baseline.push(await probeDb(url, anon)); await sleep(500); }
  console.log(`[P1607 load] baseline reads: ${baseline.map(b => `${b.status}/${b.ms}ms`).join(' ')}`);
  if (baseline.some(b => b.status < 200 || b.status >= 300 || b.ms > stopMs)) { console.error('[P1607 load] baseline read unhealthy: not starting'); process.exit(3); }
  const serverBefore = useSsh ? parseServer((await sshServer(SERVER_SAMPLE)).out) : null;
  if (serverBefore) console.log(`[P1607 load] server before: load1 ${serverBefore.load1}, available ${serverBefore.availMb} MB`);

  // Start every run in the same tick.
  const t0 = Date.now();
  const runs = Array.from({ length: level }, (_, k) => {
    const i = k + 1;
    const report = path.join(out, `run-${i}.json`);
    const log = fs.openSync(path.join(out, `run-${i}.log`), 'w');
    const child = spawn(process.execPath, [path.join(REPO, 'node_modules/@playwright/test/cli.js'), 'test', '--reporter=json', `--repeat-each=${repeat}`, ...WORKLOAD], {
      cwd: REPO, stdio: ['ignore', log, log],
      env: { ...process.env, E2E_LOADTEST: String(i), E2E_LOADTEST_DRIVER_PID: String(process.pid), PLAYWRIGHT_JSON_OUTPUT_NAME: report, FORCE_COLOR: '0' },
    });
    const r = { i, report, child, startedAt: Date.now(), endedAt: null, code: null };
    child.on('exit', code => { r.endedAt = Date.now(); r.code = code; });
    return r;
  });
  const myPids = new Set(runs.map(r => r.child.pid));

  const samples = [];
  let aborted = null; let slow = 0; let bad = 0; let serverBusy = false; let lastServer = 0;
  const serverSamples = [];
  while (runs.some(r => r.endedAt === null)) {
    await sleep(5_000);
    const allAlive = runs.every(r => r.endedAt === null);
    const p = await probeDb(url, anon);
    const mac = macSample();
    const others = otherRuns(myPids);
    const s = { t: Math.round((Date.now() - t0) / 1000), allAlive, db: p, mac, others: others.map(o => o.worktree) };
    samples.push(s);
    if (useSsh && !serverBusy && Date.now() - lastServer > 20_000) {
      serverBusy = true; lastServer = Date.now();
      sshServer(SERVER_SAMPLE).then(({ out: o }) => { const v = parseServer(o); serverSamples.push({ t: Math.round((Date.now() - t0) / 1000), allAlive: runs.every(r => r.endedAt === null), ...v }); serverBusy = false; });
    }
    slow = p.ms > stopMs ? slow + 1 : 0;
    bad = (p.status < 200 || p.status >= 300) ? bad + 1 : 0;
    if (!aborted && (slow >= 2 || bad >= 3)) {
      aborted = `database read ${slow >= 2 ? `took over ${stopMs}ms twice in a row (last ${p.ms}ms)` : `failed ${bad} times in a row (status ${p.status})`} at t=${s.t}s`;
      console.error(`[P1607 load] STOP: ${aborted}; interrupting this driver's runs only`);
      for (const r of runs) if (r.endedAt === null) r.child.kill('SIGINT');
      setTimeout(() => { for (const r of runs) if (r.endedAt === null) r.child.kill('SIGTERM'); }, 20_000).unref();
    }
    if (s.t % 30 < 5) console.log(`[P1607 load] t=${s.t}s alive=${runs.filter(r => r.endedAt === null).length}/${level} db=${p.status}/${p.ms}ms macLoad=${mac.load1} macFree=${mac.freeMb}MB others=[${others.map(o => o.worktree).join(',')}]`);
  }
  const wallS = Math.round((Date.now() - t0) / 1000);
  const w1After = w1Watch.map(w => ({ worktree: w.worktree, before: w.before, after: resultsEntries(w.worktree) }));

  const serverAfter = useSsh ? parseServer((await sshServer(SERVER_SAMPLE)).out) : null;

  // Server logs for the window (read-only): auth 429s and which edge functions were invoked.
  let logs = null;
  if (useSsh) {
    const since = Math.ceil((Date.now() - t0) / 60_000) + 2;
    const r = await sshServer(`echo AUTH429:$(sudo docker logs --since ${since}m supabase-auth 2>&1 | grep -c '"status":429'); echo FUNCS:; sudo docker logs --since ${since}m supabase-edge-functions 2>&1 | grep -oE '/functions/v1/[a-z0-9-]+|"path":"/[a-z0-9-]+"' | sort | uniq -c | sort -rn | head -15`);
    logs = r.code === 0 ? r.out.trim() : `unavailable (ssh exit ${r.code})`;
  }

  const reports = runs.map(r => ({ i: r.i, exit: r.code, seconds: Math.round((r.endedAt - r.startedAt) / 1000), ...scanReport(r.report) }));
  const overlap = samples.filter(s => s.allAlive);
  const db = overlap.map(s => s.db.ms);
  const summary = {
    level, specs: WORKLOAD.length, repeatEach: repeat, wallSeconds: wallS, out, aborted,
    othersAtStart: othersAtStart.map(o => `${o.worktree} (pid ${o.pid})`), oldLockHolder: legacy ? `${legacy.worktree} pid ${legacy.pid}` : null,
    othersSeen: [...new Set(samples.flatMap(s => s.others))],
    overlap: { samples: overlap.length, seconds: overlap.length * 5, dbMsMedian: pct(db, 0.5), dbMsP95: pct(db, 0.95), dbMsWorst: db.length ? Math.max(...db) : null,
      dbNon2xx: overlap.filter(s => s.db.status < 200 || s.db.status >= 300).length,
      macLoadMax: overlap.length ? Math.max(...overlap.map(s => s.mac.load1)) : null, macFreeMbMin: overlap.length ? Math.min(...overlap.map(s => s.mac.freeMb ?? Infinity)) : null,
      serverLoadMax: (serverSamples.filter(s => s.allAlive).length ? Math.max(...serverSamples.filter(s => s.allAlive).map(s => s.load1)) : null),
      serverAvailMbMin: (serverSamples.filter(s => s.allAlive).length ? Math.min(...serverSamples.filter(s => s.allAlive).map(s => s.availMb)) : null) },
    serverBefore, serverAfter, serverTxBytesDuringRun: serverBefore && serverAfter ? serverAfter.txBytes - serverBefore.txBytes : null,
    reads: { dbProbes: samples.length + baseline.length, sshCalls: serverSamples.length + 3 },
    serverSamples, baseline: baseline.map(b => b.ms),
    runs: reports.map(r => ({ i: r.i, exit: r.exit, seconds: r.seconds, stats: r.stats, failed: r.failed, retriedTests: r.retried, rate429InReport: r.rate429 })),
    totals: { unexpected: reports.reduce((a, r) => a + (r.stats?.unexpected ?? 0), 0), flaky: reports.reduce((a, r) => a + (r.stats?.flaky ?? 0), 0), retriedTests: reports.reduce((a, r) => a + r.retried, 0), rate429InReports: reports.reduce((a, r) => a + r.rate429, 0), unreadableReports: reports.filter(r => !r.readable).length },
    otherWorktreeResults: w1After, serverLogs: logs,
  };
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
