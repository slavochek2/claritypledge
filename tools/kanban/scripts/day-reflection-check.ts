// P1445 C: the reflection writer's reply → a checked reflection for the report. Three modes, run in
// this order by /day step 9r (each reads stdin and prints JSON on stdout only when it passes):
//
//   npx tsx scripts/day-reflection-check.ts --parse < reply.txt
//       the writer's reply: a `MODEL: <id>` line, then one JSON object
//       {"statements":[{"text","review"?,"agent":{"position","story","sources":[{"ref","quote"}]}}]}
//       (a ```json fence is allowed). Refused (exit 1, the reason on stderr): not 3–5 statements, a
//       statement over 140 characters, an agent position outside -3…3, an empty or overlong story, no
//       source, a source without a quote. Prints {model, statements:[{id:"rN",text,review?,agent}]}.
//
//   npx tsx scripts/day-reflection-check.ts --quotes --sources FILE --day-dir DIR [--hist BIN] < parsed.json
//       the mechanical half of the checker (PS-3): every cited quote must be found, verbatim (spacing
//       and ** / ` aside), in the source its id names in FILE (written by day-reflection-context.ts):
//       a decision → that dated section of that decisions file; a conversation → that session's turn at
//       that time, re-read through `hist --jsonl`; a story → the story's current version in the day
//       folder's decisions.jsonl; an issue card → its title. Any miss → exit 1, one stderr line per miss
//       ("not found" or "unavailable"). Otherwise prints the reflection with each ref replaced by the
//       stable reference (file + date + heading, session + time, …).
//
//   npx tsx scripts/day-reflection-check.ts --finalize --verdicts FILE < quoted.json
//       the checker agent's verdicts per statement, as {"r1":["pass"],"r2":["fail","pass"],"r3":["fail","fail"]}
//       (round 1, then round 2 after a rewrite; "fail: why" is a fail). The last verdict decides; two
//       fails drop the statement (its id and text on stderr: "dropped r3 …" — quote that line in the
//       pass evidence). A statement whose last verdict is a fail it was not re-checked after, or that
//       has no verdict, is refused (exit 2): never published unchecked. Every statement dropped → exit 1.
//       Prints the reflection with agent.checker = "pass" on every kept statement.
//
// The agent ("Agent on Slava") is the writer's own entity: its position is ITS prediction, shown beside
// the founder's control, and it never becomes a decision line (board answers are written only from
// the founder's own clicks: src/lib/day.ts storyAnswer/clearPosition). PRIVACY: quotes and refs are
// private; stdout goes to `day-step.sh data reflection` (the day folder), stderr to the terminal only.

import { execFile } from 'child_process'
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { pathToFileURL } from 'url'
import { parseLines, readDecisionsText } from '../server/dayStore'
import { ledgerOf, loadRunStatements } from '../server/dayStories'
import { sections, type Hit, type Source } from './day-reflection-context'

export interface IO { out: (s: string) => void; err: (s: string) => void }

export const AGENT_NAME = 'Slava'
const MAX_STATEMENT = 140
const MAX_STORY = 900
const MAX_QUOTE = 300
const MAX_SOURCES = 6
const REF = /^[DCSF][1-9][0-9]{0,3}$/

export interface AgentSource { ref: string; quote: string }
export interface AgentView { name: string; position: number; story: string; sources: AgentSource[]; checker?: 'pass' }
export interface Statement { id: string; text: string; review?: 'weekly' | 'monthly'; agent: AgentView }
export interface Reflection { model: string; statements: Statement[] }

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
/** spacing, markdown bold and code ticks do not change what a sentence says */
const norm = (s: string) => s.replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim()

class Refused extends Error {}

// ------------------------------------------------------------------ --parse

export function parseReply(reply: string): Reflection {
  let model = 'unknown'
  const rest: string[] = []
  for (const line of reply.split('\n')) {
    const m = /^\s*MODEL:\s*(\S.*?)\s*$/.exec(line)
    if (m && model === 'unknown') model = m[1].slice(0, 80)
    else rest.push(line)
  }
  const body = rest.join('\n').replace(/^\s*```(?:json)?\s*$/gm, '').trim()
  let o: unknown
  try {
    o = JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1))
  } catch {
    throw new Refused('the reply has no JSON object after the MODEL line')
  }
  if (!isObj(o) || !Array.isArray(o.statements)) throw new Refused('the JSON has no "statements" list')
  const raw = o.statements
  if (raw.length < 3 || raw.length > 5) throw new Refused(`need 3 to 5 statements, got ${raw.length}`)
  const statements = raw.map((x, i): Statement => {
    const id = `r${i + 1}`
    if (!isObj(x) || typeof x.text !== 'string' || !x.text.trim()) throw new Refused(`${id}: no statement text`)
    const text = x.text.replace(/\s+/g, ' ').trim()
    if (text.length > MAX_STATEMENT) throw new Refused(`${id}: statement over ${MAX_STATEMENT} characters: ${text.slice(0, 40)}`)
    const a = x.agent
    if (!isObj(a)) throw new Refused(`${id}: no "agent" (its own position, story and sources)`)
    if (typeof a.position !== 'number' || !Number.isInteger(a.position) || a.position < -3 || a.position > 3) throw new Refused(`${id}: agent position must be an integer from -3 to 3`)
    if (typeof a.story !== 'string' || !a.story.trim()) throw new Refused(`${id}: the agent's story is empty`)
    const story = a.story.trim()
    if (story.length > MAX_STORY) throw new Refused(`${id}: the agent's story is over ${MAX_STORY} characters`)
    if (!Array.isArray(a.sources) || !a.sources.length) throw new Refused(`${id}: the story cites no source`)
    if (a.sources.length > MAX_SOURCES) throw new Refused(`${id}: more than ${MAX_SOURCES} sources`)
    const sources = a.sources.map((s, k): AgentSource => {
      if (!isObj(s) || typeof s.ref !== 'string' || !REF.test(s.ref.trim())) throw new Refused(`${id}: source ${k + 1} has no id like D1, C2, S3 or F4`)
      if (typeof s.quote !== 'string' || !norm(s.quote)) throw new Refused(`${id}: source ${s.ref} has no quote`)
      if (s.quote.length > MAX_QUOTE) throw new Refused(`${id}: the quote from ${s.ref} is over ${MAX_QUOTE} characters`)
      return { ref: s.ref.trim(), quote: s.quote.trim() }
    })
    const st: Statement = { id, text, agent: { name: AGENT_NAME, position: a.position, story, sources } }
    if (x.review === 'weekly' || x.review === 'monthly') st.review = x.review
    return st
  })
  return { model, statements }
}

function readReflection(stdin: string): Reflection {
  let o: unknown
  try {
    o = JSON.parse(stdin)
  } catch {
    throw new Refused('stdin is not JSON')
  }
  if (!isObj(o) || !Array.isArray(o.statements) || !o.statements.every((s) => isObj(s) && typeof s.id === 'string' && isObj(s.agent) && Array.isArray((s.agent as Record<string, unknown>).sources)))
    throw new Refused('stdin is not a parsed reflection (run --parse first)')
  return o as unknown as Reflection
}

// ------------------------------------------------------------------ --quotes

function histHits(bin: string, args: string[]): Promise<Hit[] | string> {
  return new Promise((done) => {
    execFile(bin, args, { maxBuffer: 512 * 1024 * 1024, timeout: 300_000 }, (err, stdout) => {
      const code = err && typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : err ? -1 : 0
      if (code !== 0 && code !== 1) return done(`hist failed (exit ${code})`)
      const hits: Hit[] = []
      for (const l of stdout.split('\n'))
        if (l.trim()) {
          try {
            hits.push(JSON.parse(l) as Hit)
          } catch {
            return done('hist printed a line that is not JSON')
          }
        }
      done(hits)
    })
  })
}

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function stableRef(s: Source): string {
  switch (s.kind) {
    case 'decision':
      return `${s.source} decisions ${s.heading}`
    case 'conversation':
      return `conversation ${s.session} at ${s.ts}`
    case 'story':
      return `founder story ${s.run_id}/${s.target}`
    case 'finding':
      return `issue card: ${s.title}`
  }
}

export async function checkQuotes(r: Reflection, sources: Record<string, Source>, dayDir: string, hist: string): Promise<{ out: Reflection; misses: string[] }> {
  const misses: string[] = []
  const files = new Map<string, string | null>()
  const fileText = (p: string) => {
    if (!files.has(p)) {
      try {
        files.set(p, readFileSync(p, 'utf-8'))
      } catch {
        files.set(p, null)
      }
    }
    return files.get(p) ?? null
  }
  let ledger: ReturnType<typeof ledgerOf> | null = null
  const stories = () => {
    if (!ledger) {
      try {
        ledger = ledgerOf(parseLines(readDecisionsText(dayDir)), loadRunStatements(dayDir))
      } catch {
        ledger = []
      }
    }
    return ledger
  }

  // One hist call for every cited conversation (hist's regex is case-insensitive; containment below is exact).
  const convo = r.statements.flatMap((s) => s.agent.sources.filter((q) => sources[q.ref]?.kind === 'conversation'))
  let hits: Hit[] | string = []
  if (convo.length) {
    const since = convo.map((q) => (sources[q.ref] as Extract<Source, { kind: 'conversation' }>).ts.slice(0, 10)).sort()[0]
    const words = (q: string) => norm(q).split(' ').slice(0, 6).map(escapeRx).join('\\s+')
    hits = await histHits(hist, ['--role', 'user', '--jsonl', '--since', since, convo.map((q) => `(?:${words(q.quote)})`).join('|')])
  }

  const out: Reflection = { ...r, statements: [] }
  for (const st of r.statements) {
    const resolved: AgentSource[] = []
    for (const q of st.agent.sources) {
      const src = sources[q.ref]
      const miss = (why: string) => misses.push(`${st.id}: quote from ${q.ref} ${why}: "${norm(q.quote).slice(0, 80)}"`)
      if (!src) {
        miss('cites an id the grounding block never had')
        continue
      }
      const want = norm(q.quote)
      let found = false
      if (src.kind === 'decision') {
        const text = fileText(src.file)
        if (text === null) {
          miss(`unavailable (${src.source} decisions unreadable)`)
          continue
        }
        const sec = sections(text).find((x) => x.date === src.date && x.heading === src.heading)
        if (!sec) {
          miss(`unavailable (no section "${src.heading.slice(0, 60)}" in ${src.source} decisions)`)
          continue
        }
        found = norm(`${sec.heading}\n${sec.body}`).includes(want)
      } else if (src.kind === 'conversation') {
        if (typeof hits === 'string') {
          miss(`unavailable (${hits})`)
          continue
        }
        const turns = hits.filter((h) => h.session === src.session && h.ts === src.ts && h.role === 'user')
        found = turns.some((h) => norm(h.text).includes(want))
      } else if (src.kind === 'story') {
        const e = stories().find((x) => x.run_id === src.run_id && x.target === src.target && x.hash === src.hash)
        if (!e) {
          miss('unavailable (the story was edited or removed since)')
          continue
        }
        found = norm(e.story).includes(want)
      } else found = norm(src.title).includes(want)
      if (!found) miss('not found in that source')
      else resolved.push({ ref: stableRef(src), quote: q.quote })
    }
    out.statements.push({ ...st, agent: { ...st.agent, sources: resolved } })
  }
  return { out, misses }
}

// ------------------------------------------------------------------ --finalize

export function finalize(r: Reflection, verdicts: unknown): { out: Reflection; dropped: Statement[] } {
  if (!isObj(verdicts)) throw new Refused('verdicts must be an object of statement id → ["pass"|"fail", …]')
  const kept: Statement[] = []
  const dropped: Statement[] = []
  for (const st of r.statements) {
    const v = verdicts[st.id]
    if (!Array.isArray(v) || !v.length || !v.every((x) => typeof x === 'string' && /^(pass|fail)\b/i.test(x.trim())))
      throw new Refused(`${st.id} has no checker verdict: never published unchecked`)
    const fails = v.filter((x) => /^fail/i.test(x.trim())).length
    const last = (v[v.length - 1] as string).trim().toLowerCase()
    if (last.startsWith('pass')) kept.push({ ...st, agent: { ...st.agent, checker: 'pass' } })
    else if (fails >= 2) dropped.push(st)
    else throw new Refused(`${st.id} failed the checker once and was not checked again after a rewrite: never published unchecked`)
  }
  return { out: { ...r, statements: kept }, dropped }
}

// ------------------------------------------------------------------ cli

const USAGE = 'usage: --parse | --quotes --sources FILE --day-dir DIR [--hist BIN] | --finalize --verdicts FILE'

export async function run(argv: string[], stdin: string, io: IO): Promise<number> {
  const say = (m: string) => io.err(`day-reflection-check: ${m}\n`)
  const opt = (k: string) => {
    const i = argv.indexOf(k)
    return i >= 0 ? argv[i + 1] : undefined
  }
  try {
    if (argv[0] === '--parse' && argv.length === 1) {
      io.out(JSON.stringify(parseReply(stdin)))
      return 0
    }
    if (argv[0] === '--quotes') {
      const sf = opt('--sources')
      const dayDir = opt('--day-dir')
      if (!sf || !dayDir) {
        say(USAGE)
        return 2
      }
      let sources: Record<string, Source>
      try {
        sources = JSON.parse(readFileSync(sf, 'utf-8'))
      } catch {
        say(`cannot read --sources ${sf}`)
        return 2
      }
      const { out, misses } = await checkQuotes(readReflection(stdin), sources, dayDir, opt('--hist') ?? join(homedir(), '.agents/bin/hist'))
      if (misses.length) {
        for (const m of misses) io.err(`${m}\n`)
        return 1
      }
      io.out(JSON.stringify(out))
      return 0
    }
    if (argv[0] === '--finalize') {
      const vf = opt('--verdicts')
      if (!vf) {
        say(USAGE)
        return 2
      }
      let verdicts: unknown
      try {
        verdicts = JSON.parse(readFileSync(vf, 'utf-8'))
      } catch {
        say(`cannot read --verdicts ${vf}`)
        return 2
      }
      let res: ReturnType<typeof finalize>
      try {
        res = finalize(readReflection(stdin), verdicts)
      } catch (e) {
        if (e instanceof Refused) {
          say(e.message)
          return 2
        }
        throw e
      }
      for (const d of res.dropped) io.err(`dropped ${d.id} after two failed checks: "${d.text}"\n`)
      if (!res.out.statements.length) {
        say('every statement failed the checker twice: nothing to record')
        return 1
      }
      io.out(JSON.stringify(res.out))
      return 0
    }
  } catch (e) {
    if (e instanceof Refused) {
      say(e.message)
      return 1
    }
    throw e
  }
  say(USAGE)
  return 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let stdin = ''
  try {
    stdin = readFileSync(0, 'utf-8')
  } catch {
    stdin = ''
  }
  run(process.argv.slice(2), stdin, { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) }).then((c) => (process.exitCode = c))
}
