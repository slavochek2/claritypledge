// P1655 rule 2: the fingerprints (`<check>:<fault key>`) the repo's /day check prose emits, read from
// the prose itself. Only literal keys count (`<placeholder>` keys are skipped). The guard test
// compares them with day-fault-keys.snapshot.json: a key that vanished must have an alias.
//
//   npx tsx scripts/day-fault-keys.ts --write   regenerate the snapshot (after adding an alias)
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(HERE, '..', '..', '..')
const DIRS = [join(ROOT, '.claude', 'commands', 'slava', 'maintain')]
export const SNAPSHOT = join(HERE, 'day-fault-keys.snapshot.json')

const KEY = /^[a-z0-9][a-z0-9._:-]{0,59}$/

function mdFiles(dir: string): string[] {
  const out: string[] = []
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out.push(...mdFiles(p))
    else if (n.endsWith('.md')) out.push(p)
  }
  return out
}

export function extractFaultKeys(text: string): Set<string> {
  const t = text.replace(/\s+/g, ' ')
  const out = new Set<string>()
  const add = (check: string, key: string) => {
    const k = key.replace(/[`.,;:)]+$/, '')
    if (KEY.test(k) && /^[A-Za-z0-9._-]+$/.test(check)) out.add(`${check}:${k}`)
  }
  // inline: --check X ... --fault-key Y (within 200 characters, no other --check between)
  for (const m of t.matchAll(/--check ([A-Za-z0-9._-]+)((?:(?!--check ).){0,200}?)--fault-key ([^\s`]+)/g)) add(m[1], m[3])
  // table rows: | fault | check id | `key`, `key` ... |
  for (const row of text.split('\n')) {
    const cells = row.split('|').map((c) => c.trim())
    if (cells.length < 5 || cells[0] !== '') continue
    const check = cells[2]
    if (!/^[a-z]+\.[A-Za-z0-9._-]+$/.test(check)) continue
    for (const m of cells[3].matchAll(/`([^`]+)`/g)) add(check, m[1])
  }
  return out
}

export function emittedFaultKeys(): Set<string> {
  const out = new Set<string>()
  for (const d of DIRS) for (const f of mdFiles(d)) for (const k of extractFaultKeys(readFileSync(f, 'utf-8'))) out.add(k)
  return out
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--write')) {
  const keys = [...emittedFaultKeys()].sort()
  writeFileSync(SNAPSHOT, `${JSON.stringify(keys, null, 2)}\n`)
  process.stdout.write(`${keys.length} fault keys written\n`)
}
