#!/usr/bin/env node
/**
 * run-status.mjs — P1367 S3. Where a disagreement-pipeline run stands, printed without anyone asking.
 *
 * WHY. Across Clarity Night #2 the founder opened at least six resumes by asking where things
 * were ("what next what we did what now", "but where is it?"). The handoff was a long log with
 * no fixed state block, and the post-compaction rule in CLAUDE.md is prose that did not fire.
 * So every handoff carries a `## Now` block at the top, each stage rewrites it when it ends,
 * and this script reads it and CHECKS IT AGAINST THE DATABASE, so a stale block says so.
 *
 * The block (plain lines, in this order; `check:` is the machine line):
 *
 *   ## Now
 *   - done: <last completed stage> on <env>
 *   - next: <next stage>; gate: <what it waits for>
 *   - see: <url per environment>
 *   - date: <Weekday D Mon YYYY, HH:MM Bangkok>
 *   - not on PROD: <what is still TEST-only, or "nothing">
 *   - check: env=<test|prod> tag=<tag> event=<event slug> datetime=<UTC ISO>
 *
 *   node scripts/events/run-status.mjs <run-slug>        one run; exit 0 fresh, 1 stale, 2 unreadable
 *   node scripts/events/run-status.mjs <handoff.md>      same, for a handoff path
 *   node scripts/events/run-status.mjs --recent [days]   every handoff changed in N days (default 7);
 *                                                        used by the SessionStart hook
 *   --offline                                            skip the database cross-check
 *
 * Handoff locations: `.private/events/<slug>/handoff.md` first, then the legacy
 * `.private/points-runs/<slug>.handoff.md`. Reads use ANON keys only (public, read-only).
 * Output uses ':' separators, never '>' '<' or '|' (shell-safety.md).
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

export const FIELDS = ['done', 'next', 'see', 'date', 'not on PROD', 'check']

export function handoffPath(slug, root = '.') {
  const a = path.join(root, '.private/events', slug, 'handoff.md')
  const b = path.join(root, '.private/points-runs', `${slug}.handoff.md`)
  return existsSync(a) ? a : existsSync(b) ? b : null
}

/** @returns {{ok: boolean, fields?: Record<string,string>, check?: Record<string,string>, error?: string}} */
export function parseNow(text) {
  const m = text.match(/^## Now[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)
  if (!m) return { ok: false, error: 'no "## Now" block' }
  const fields = {}
  for (const line of m[1].split('\n')) {
    const f = line.match(/^\s*-\s*([^:]+?):\s*(.*)$/)
    if (f) fields[f[1].trim()] = f[2].trim()
  }
  const missing = FIELDS.filter(k => !fields[k])
  if (missing.length) return { ok: false, error: `"## Now" block is missing: ${missing.join(', ')}` }
  const check = Object.fromEntries(fields.check.split(/\s+/).map(kv => kv.split('=')).filter(p => p.length === 2))
  const need = ['env', 'tag', 'event', 'datetime'].filter(k => !check[k])
  if (need.length) return { ok: false, error: `check: line is missing ${need.join(', ')}` }
  if (!['test', 'prod'].includes(check.env)) return { ok: false, error: `check: env must be test or prod, got "${check.env}"` }
  return { ok: true, fields, check }
}

function env(root = '.') {
  const p = path.join(root, '.env.local')
  if (!existsSync(p)) return {}
  return Object.fromEntries(readFileSync(p, 'utf8').split('\n').filter(l => /^[A-Z_]+=/.test(l))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }))
}

async function get(target, pathQs, vars) {
  const [url, key] = target === 'prod'
    ? ['https://besjtuodziykmjidubzw.supabase.co', vars.PROD_SUPABASE_ANON_KEY]
    : [vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_ANON_KEY]
  if (!url || !key) throw new Error(`no anon key for ${target} in .env.local`)
  const r = await fetch(`${url}/rest/v1/${pathQs}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) })
  if (!r.ok) throw new Error(`${target} returned HTTP ${r.status}`)
  return r.json()
}

/** Cross-check the block against the environment it names. Returns a list of stale findings. */
export async function crossCheck(check, { fetchJson = get, vars = env() } = {}) {
  const stale = []
  const points = await fetchJson(check.env, `points?tags=cs.%7B${encodeURIComponent(check.tag)}%7D&select=id`, vars)
  if (!points.length) stale.push(`no points tagged ${check.tag} on ${check.env}`)
  const rows = await fetchJson(check.env, `events?slug=eq.${encodeURIComponent(check.event)}&select=datetime`, vars)
  if (!rows.length) stale.push(`no event ${check.event} on ${check.env}`)
  else if (new Date(rows[0].datetime).getTime() !== new Date(check.datetime).getTime()) {
    stale.push(`date: block says ${check.datetime}, ${check.env} row says ${rows[0].datetime}`)
  }
  return { stale, points: points.length }
}

export async function status(file, { offline = false, ...deps } = {}) {
  const name = path.basename(file).replace(/\.handoff\.md$|\/?handoff\.md$/, '') || path.basename(path.dirname(file))
  const p = parseNow(readFileSync(file, 'utf8'))
  if (!p.ok) return { code: 2, lines: [`run ${name}: UNREADABLE: ${p.error} (${file})`] }
  const lines = [`run ${name}:`, ...['done', 'next', 'see', 'date', 'not on PROD'].map(k => `  ${k}: ${p.fields[k]}`)]
  if (offline) return { code: 0, lines: [...lines.slice(0, 1).map(l => l + ' (not cross-checked)'), ...lines.slice(1)] }
  try {
    const { stale, points } = await crossCheck(p.check, deps)
    if (stale.length) return { code: 1, lines: [`run ${name}: STALE: ${stale.join('; ')}`, ...lines.slice(1)] }
    return { code: 0, lines: [`run ${name}: matches ${p.check.env} (${points} points, event date)`, ...lines.slice(1)] }
  } catch (e) {
    return { code: 1, lines: [`run ${name}: NOT CHECKED: ${e.message}`, ...lines.slice(1)] }
  }
}

export function recentHandoffs(days, root = '.', now = Date.now()) {
  const out = []
  const cutoff = now - days * 86400000
  const legacy = path.join(root, '.private/points-runs')
  if (existsSync(legacy)) for (const f of readdirSync(legacy)) if (f.endsWith('.handoff.md')) out.push(path.join(legacy, f))
  const events = path.join(root, '.private/events')
  if (existsSync(events)) for (const d of readdirSync(events)) {
    const f = path.join(events, d, 'handoff.md')
    if (existsSync(f)) out.push(f)
  }
  return out.filter(f => statSync(f).mtimeMs >= cutoff)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const offline = args.includes('--offline')
  const rest = args.filter(a => a !== '--offline')
  if (rest[0] === '--recent') {
    const days = Number(rest[1] ?? 7)
    const files = recentHandoffs(days)
    let worst = 0
    for (const f of files) {
      const r = await status(f, { offline })
      console.log(r.lines.join('\n'))
      worst = Math.max(worst, r.code)
    }
    process.exit(worst)
  }
  if (!rest[0]) { console.error('usage: run-status.mjs <run-slug|handoff.md> | --recent [days]  [--offline]'); process.exit(2) }
  const file = rest[0].endsWith('.md') ? rest[0] : handoffPath(rest[0])
  if (!file || !existsSync(file)) { console.log(`run ${rest[0]}: UNREADABLE: no handoff found`); process.exit(2) }
  const r = await status(file, { offline })
  console.log(r.lines.join('\n'))
  process.exit(r.code)
}
