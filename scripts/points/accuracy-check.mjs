#!/usr/bin/env node
/**
 * accuracy-check.mjs — P1370. The accuracy evidence promote-to-prod §2 requires, written by the
 * stage that earned it, bound to the bytes actually in the database.
 *
 * WHY. ikigai1 (2026-09-28): story-draft's checkers passed 21 of 21 stories, but nothing turned
 * those verdicts into the `disagreement:accuracy-check` ledger line promote-to-prod refuses
 * without — so the check was redone by hand at promote time. That re-check then re-fetched the
 * transcripts from YouTube instead of reading the sealed yt-store, and YouTube's `en` track for one
 * source had meanwhile become a machine translation: every true quote "failed" against it.
 *
 *   node scripts/points/accuracy-check.mjs hash   --env test|prod --tag <tag>
 *   node scripts/points/accuracy-check.mjs verify --env test --tag <tag>
 *       exit 0 MATCH · 3 MISSING (no line) · 4 STALE (line's hash is not the current bytes)
 *   node scripts/points/accuracy-check.mjs record --env test|prod --tag <tag> --run <slug>
 *       --checked-by "<model + who>" [--method "<how>"] [--dry-run]
 *       exit 0 line appended · 1 REFUSED (reason printed, nothing written)
 *   node scripts/points/accuracy-check.mjs seal-verify --run <slug>
 *       exit 0 every sealed transcript found in the store by hash · 1 REFUSED
 *
 * What `record` asserts before writing, all of it or nothing:
 *   1. every transcript in .points-run-seals/<slug>.transcripts.sha256 is in the store with the
 *      sealed raw + clean hashes (and served_track / clean_chars when the seal carries them).
 *      It NEVER fetches. A mismatch is a refusal, never a substitution.
 *   2. every row read back from the target (anon, the rows actually written) equals — minus the
 *      appended "\n\n#<tag>" — exactly one `checker: PASS` draft in the run file's Story Drafts.
 *   3. every quote in every row's video_quotes is found verbatim (grep -F semantics) in the sealed
 *      clean transcript of that row's video.
 *   4. the checker is not the writer: --checked-by names no model that wrote any matched story.
 * The content hash is computed from those rows: sha256 over contents sorted by code point and
 * concatenated with no separator (the recipe promote-to-prod reads; reproduces the ikigai1 line).
 *
 * Only anon keys are read: stories are public, and the hash must come from what a reader sees.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, existsSync, appendFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'

export const sha256 = s => createHash('sha256').update(s).digest('hex')

/** UTF-8 byte order == code point order, which is what Python's sorted() on str gives. */
export function contentSha256(rows) {
  const contents = rows.map(r => r.content)
  contents.sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')))
  return sha256(contents.join(''))
}

/** `### Story — <Name> — <P>` blocks with their writer, checker verdict and content. */
export function parseDrafts(md) {
  const start = md.search(/^## Story Drafts\s*$/m)
  if (start < 0) return []
  const rest = md.slice(start).split('\n').slice(1)
  const end = rest.findIndex(l => /^## /.test(l))
  const lines = end < 0 ? rest : rest.slice(0, end)
  const drafts = []
  let cur = null
  let inContent = false
  for (const line of lines) {
    const h = line.match(/^### Story — (.+?) — (\S+)\s*$/)
    if (h) { cur = { arguer: h[1], point: h[2], writer: null, checker: null, content: [] }; drafts.push(cur); inContent = false; continue }
    if (!cur) continue
    if (/^### /.test(line)) { cur = null; continue }
    const meta = line.match(/^writer:\s*([^|]+?)\s*\|.*\bchecker:\s*([A-Z]+)/)
    if (meta && !inContent) { cur.writer = meta[1]; cur.checker = meta[2]; continue }
    if (/^content:\s*\|\s*$/.test(line)) { inContent = true; continue }
    if (inContent) {
      if (line === '' || line.startsWith('  ')) cur.content.push(line.slice(2))
      else inContent = false
    }
  }
  return drafts.map(d => ({ ...d, content: d.content.join('\n').replace(/\n+$/, '') }))
}

/** One seal line per source; later fields are optional (older seals lack them). */
export function parseSeal(text) {
  return text.split('\n').filter(l => l.startsWith('source:')).map(l => {
    const f = Object.fromEntries(l.split(' | ').map(p => { const i = p.indexOf(':'); return [p.slice(0, i).trim(), p.slice(i + 1).trim()] }))
    return { source: f.source, track: f.track, raw: f.raw_sha256, clean: f.clean_sha256, vttClean: f['vtt-clean'], servedTrack: f.served_track ?? null, cleanChars: f.clean_chars ? Number(f.clean_chars) : null }
  })
}

export const charCount = s => [...s].length

/** Find each sealed transcript in the store by its bytes. Never fetches. */
export function verifySeal(entries, storeDir) {
  const problems = []
  const found = new Map()
  for (const e of entries) {
    const dir = path.join(storeDir, e.source)
    if (!existsSync(dir)) { problems.push(`${e.source}: not in the store (${dir}) — re-verification refuses; it does not re-fetch`); continue }
    const files = readdirSync(dir).filter(f => statSync(path.join(dir, f)).isFile())
    const hashOf = f => sha256(readFileSync(path.join(dir, f)))
    const rawMatches = files.filter(f => f.endsWith('.vtt') && hashOf(f) === e.raw)
    const cleanFile = files.filter(f => f.endsWith('.txt')).find(f => hashOf(f) === e.clean)
    if (!rawMatches.length) problems.push(`${e.source}: no stored .vtt matches the sealed raw_sha256 — the track changed or was replaced`)
    if (!cleanFile) { problems.push(`${e.source}: no stored clean transcript matches the sealed clean_sha256`); continue }
    if (e.servedTrack && !rawMatches.includes(e.servedTrack)) problems.push(`${e.source}: sealed served_track ${e.servedTrack} does not hold the sealed raw bytes (matches: ${rawMatches.join(', ') || 'none'})`)
    const text = readFileSync(path.join(dir, cleanFile), 'utf8')
    if (e.cleanChars != null && charCount(text) !== e.cleanChars) problems.push(`${e.source}: clean transcript is ${charCount(text)} chars, seal says ${e.cleanChars}`)
    found.set(e.source, { file: cleanFile, text, rawMatches })
  }
  return { ok: problems.length === 0, problems, found }
}

export const videoId = url => {
  if (!url) return null
  const m = url.match(/[?&]v=([\w-]{11})/) ?? url.match(/youtu\.be\/([\w-]{11})/) ?? url.match(/\/(?:embed|shorts)\/([\w-]{11})/)
  return m?.[1] ?? null
}

/** Each row, minus its "\n\n#<tag>" suffix, must equal exactly one checker-PASS draft. */
export function matchRows(rows, drafts, tag) {
  const problems = []
  const matched = []
  const suffix = `\n\n#${tag}`
  const used = new Set()
  for (const r of rows) {
    const body = r.content.endsWith(suffix) ? r.content.slice(0, -suffix.length) : null
    if (body == null) { problems.push(`${r.id}: content does not end with "\\n\\n#${tag}"`); continue }
    const hits = drafts.map((d, i) => [d, i]).filter(([d]) => d.content === body)
    if (!hits.length) { problems.push(`${r.id}: no draft in the run file equals this row — the text moved after the check; it needs a fresh check`); continue }
    const pass = hits.filter(([d, i]) => d.checker === 'PASS' && !used.has(i))
    if (!pass.length) { problems.push(`${r.id}: its draft (${hits[0][0].arguer} ${hits[0][0].point}) is not checker: PASS`); continue }
    used.add(pass[0][1])
    matched.push({ row: r, draft: pass[0][0] })
  }
  return { ok: problems.length === 0, problems, matched }
}

export function checkQuotes(rows, found) {
  const problems = []
  let n = 0
  for (const r of rows) {
    const quotes = r.video_quotes?.quotes ?? []
    if (!quotes.length) continue
    const id = videoId(r.video_url)
    const tx = id && found.get(id)
    if (!tx) { problems.push(`${r.id}: video ${id ?? r.video_url} has no sealed transcript`); continue }
    for (const q of quotes) {
      n++
      if (!tx.text.includes(q.text)) problems.push(`${r.id}: quote not verbatim in ${id}/${tx.file}: "${q.text}"`)
    }
  }
  return { ok: problems.length === 0, problems, n }
}

const MODELS = ['gemini', 'opus', 'sonnet', 'haiku', 'fable', 'gpt', 'codex', 'grok', 'llama', 'mistral']
const modelsIn = s => MODELS.filter(m => new RegExp(`\\b${m}`, 'i').test(s))

/** PS-3: the checker must not be the writer's model. A writer we cannot name is a refusal. */
export function writerOverlap(checkedBy, matched) {
  const problems = []
  const checker = modelsIn(checkedBy)
  if (!checker.length) problems.push(`--checked-by "${checkedBy}" names no model; say which model checked`)
  for (const w of new Set(matched.map(m => m.draft.writer))) {
    const wm = modelsIn(w ?? '')
    if (!wm.length) problems.push(`writer "${w}" names no model, so checker independence cannot be shown`)
    const same = wm.filter(m => checker.includes(m))
    if (same.length) problems.push(`checker shares the writer's model (${same.join(', ')}): writer "${w}", checker "${checkedBy}"`)
  }
  return { ok: problems.length === 0, problems }
}

export function buildLine({ iso, env, tag, n, hash, method, checkedBy, findings = 'none' }) {
  for (const [k, v] of Object.entries({ method, checkedBy, findings })) if (/[|\n]/.test(v)) throw new Error(`${k} may not contain "|" or a newline`)
  return `${iso} | disagreement:accuracy-check | env:${env} | tag:${tag} | stories:${n} | content_sha256:${hash} | verdict:${n}/${n} clean | method:${method} | checked_by:${checkedBy} | findings:${findings}`
}

/** The newest accuracy line for this env + tag. */
export function latestLine(ledger, env, tag) {
  const lines = ledger.split('\n').filter(l => l.includes('| disagreement:accuracy-check |') && l.includes(`| env:${env} |`) && l.includes(`| tag:${tag} |`))
  const last = lines.at(-1)
  if (!last) return null
  return { line: last, hash: last.match(/content_sha256:([0-9a-f]{64})/)?.[1] ?? null, stories: Number(last.match(/\| stories:(\d+) \|/)?.[1]) }
}

export const id = 'accuracy-check'

/**
 * The row-level decision `record` makes, pure: rows vs PASS drafts, quotes vs the sealed clean
 * transcripts (already verified by hash), checker vs writer. `found` maps video id -> {file, text}.
 * The seal-vs-store check is file-based and runs before this, in verifySeal.
 */
export function run({ rows, runMd, tag, found, checkedBy }) {
  const m = matchRows(rows, parseDrafts(runMd), tag)
  const q = checkQuotes(rows, found instanceof Map ? found : new Map(Object.entries(found)))
  const w = writerOverlap(checkedBy, m.matched)
  const problems = [...m.problems, ...q.problems, ...(m.ok ? w.problems : [])]
  if (!rows.length) problems.push('no rows')
  return { ok: problems.length === 0, verdict: problems.length ? 'REFUSE' : 'RECORD', detail: problems.join('; ') || `${m.matched.length} rows, ${q.n} quotes`, problems, matched: m.matched, quotes: q }
}

const FX_MD = '## Story Drafts\n\n### Story — A — P1\nwriter: gemini-3.8-flash | rounds: 1 | checker: PASS\ncontent: |\n  A says it.\n'
const FX_ROW = { id: 'r1', content: 'A says it.\n\n#t', video_url: 'https://youtu.be/AAAAAAAAAAA', video_quotes: { quotes: [{ text: 'it was hard' }] } }
const FX_FOUND = { AAAAAAAAAAA: { file: 'en.clean.txt', text: '[00:00] it was hard' } }
export const FIXTURES = {
  pass: { rows: [FX_ROW], runMd: FX_MD, tag: 't', found: FX_FOUND, checkedBy: 'Claude Sonnet' },
  // Edited after the check AND a quote the transcript does not hold.
  fail: { rows: [{ ...FX_ROW, content: 'A says it again.\n\n#t', video_quotes: { quotes: [{ text: 'it was easy' }] } }], runMd: FX_MD, tag: 't', found: FX_FOUND, checkedBy: 'Claude Sonnet' },
}

// ---------------------------------------------------------------- I/O

const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim()
/** The main checkout: .private/ is gitignored and lives only there, even when run from a worktree. */
export const mainRoot = () => path.dirname(git(['rev-parse', '--path-format=absolute', '--git-common-dir']))
const toplevel = () => git(['rev-parse', '--show-toplevel'])

function envVar(file, name) {
  if (!existsSync(file)) return null
  const line = readFileSync(file, 'utf8').split('\n').find(l => l.startsWith(`${name}=`))
  return line ? line.slice(name.length + 1).trim().replace(/^"|"$/g, '') : null
}

/** URL from the env file matching the target (never merged), anon key only. */
export function target(env, root = mainRoot()) {
  const local = path.join(root, '.env.local')
  const [url, key] = env === 'prod'
    ? [envVar(path.join(root, '.env.prod'), 'VITE_SUPABASE_URL'), envVar(local, 'PROD_SUPABASE_ANON_KEY')]
    : env === 'test' ? [envVar(local, 'VITE_SUPABASE_URL'), envVar(local, 'VITE_SUPABASE_ANON_KEY')] : [null, null]
  if (!url || !key) throw new Error(`cannot resolve ${env} URL + anon key (env must be test or prod)`)
  return { url, key }
}

export async function fetchRows(env, tag) {
  if (!/^[a-z0-9]+$/.test(tag)) throw new Error(`tag "${tag}" is not [a-z0-9]+`)
  const { url, key } = target(env)
  const r = await fetch(`${url}/rest/v1/stories?select=id,content,video_url,video_quotes,tags&tags=cs.%7B${tag}%7D&limit=1000`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!r.ok) throw new Error(`read ${env} stories: HTTP ${r.status}`)
  const rows = await r.json()
  if (rows.length >= 1000) throw new Error('1000+ rows: pagination not exhausted')
  return rows
}

const storeDir = () => process.env.YT_STORE_DIR ?? path.join(os.homedir(), '.local/share/yt-store')
function sealPath(slug) {
  for (const root of [toplevel(), mainRoot()]) {
    const p = path.join(root, '.points-run-seals', `${slug}.transcripts.sha256`)
    if (existsSync(p)) return p
  }
  return null
}

async function main(argv) {
  const [cmd, ...rest] = argv
  const opt = n => { const i = rest.indexOf(n); return i < 0 ? null : rest[i + 1] }
  const env = opt('--env'); const tag = opt('--tag'); const slug = opt('--run')
  const ledgerPath = opt('--ledger') ?? path.join(mainRoot(), '.private/logs/points-runs.log')
  const refuse = (problems, code = 1) => { console.log('accuracy-check: REFUSED, nothing written'); problems.forEach(p => console.log(`  - ${p}`)); return code }

  if (cmd === 'seal-verify' || cmd === 'record') {
    if (!slug) return refuse(['--run <slug> is required'], 2)
  }
  let seal = null
  if (slug) {
    const sp = sealPath(slug)
    if (!sp) return refuse([`no transcripts seal .points-run-seals/${slug}.transcripts.sha256`])
    const entries = parseSeal(readFileSync(sp, 'utf8'))
    seal = verifySeal(entries, storeDir())
    console.log(`transcripts: ${entries.length - seal.problems.length >= 0 ? seal.found.size : 0} of ${entries.length} found in the store by sealed hash`)
    if (!seal.ok) return refuse(seal.problems)
    if (cmd === 'seal-verify') { console.log('seal-verify: OK'); return 0 }
  }

  if (!['hash', 'verify', 'record'].includes(cmd) || !env || !tag) {
    console.error('usage: accuracy-check.mjs hash|verify|record --env test|prod --tag <tag> [--run <slug> --checked-by <who>] | seal-verify --run <slug>')
    return 2
  }
  const rows = await fetchRows(env, tag)
  const hash = contentSha256(rows)
  console.log(`rows: ${rows.length} stories on ${env} under #${tag}`)
  console.log(`content_sha256: ${hash}`)
  if (cmd === 'hash') return 0

  if (cmd === 'verify') {
    const last = latestLine(existsSync(ledgerPath) ? readFileSync(ledgerPath, 'utf8') : '', env, tag)
    if (!last) { console.log(`accuracy evidence: MISSING (no accuracy-check line for env:${env} tag:${tag})`); return 3 }
    if (last.hash !== hash || last.stories !== rows.length) { console.log(`accuracy evidence: STALE (line has ${last.hash} over ${last.stories} stories; current bytes ${hash} over ${rows.length})`); return 4 }
    console.log(`accuracy evidence: MATCH sha ${hash}`)
    console.log(`  ${last.line}`)
    return 0
  }

  // record
  const checkedBy = opt('--checked-by')
  if (!checkedBy) return refuse(['--checked-by "<model + who>" is required'], 2)
  if (!rows.length) return refuse([`no stories on ${env} under #${tag}`])
  const runFile = path.join(mainRoot(), '.private/points-runs', `${slug}.md`)
  if (!existsSync(runFile)) return refuse([`no run file ${runFile}`])
  const r = run({ rows, runMd: readFileSync(runFile, 'utf8'), tag, found: seal.found, checkedBy })
  const m = { matched: r.matched }, q = r.quotes, problems = r.problems
  console.log(`drafts: ${m.matched.length} of ${rows.length} rows equal a checker-PASS draft`)
  console.log(`quotes: ${q.n - q.problems.filter(p => p.includes('quote not verbatim')).length} of ${q.n} verbatim in the sealed transcripts`)
  if (problems.length) return refuse(problems)
  const method = opt('--method') ?? `run-file checker verdicts (story-draft) + accuracy-check.mjs: ${m.matched.length}/${rows.length} rows equal a PASS draft; ${q.n}/${q.n} quotes grep -F in sealed clean transcripts (store hashes verified; no re-fetch)`
  const line = buildLine({ iso: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), env, tag, n: rows.length, hash, method, checkedBy })
  if (rest.includes('--dry-run')) { console.log(`DRY RUN, not written:\n${line}`); return 0 }
  appendFileSync(ledgerPath, line + '\n')
  console.log(`written to ${ledgerPath}:\n${line}`)
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(c => process.exit(c), e => { console.error(`accuracy-check: ERROR: ${e.message}`); process.exit(1) })
}
