#!/usr/bin/env node
/**
 * store-inspection-scan.mjs — P1210 §10 rule 1 / DW-12.
 *
 * The pipeline must ASK THE OWNING TOOL and read its HIT/MISS, never inspect a
 * store directory. The store's own README states the designed interface: "do
 * not consult this directory before diarizing: the reuse check lives inside the
 * tool." Run B was blocked for three days by an artifact that was on disk,
 * because the pipeline inspected the wrong store instead of asking.
 *
 * THE PATTERN IS DELIBERATELY WIDER THAN `ls` (DW-12). An earlier version had
 * exactly one occurrence to find and no known-bad control, so deleting that one
 * line would have made it permanently green. Two things are flagged:
 *   1. an inspection verb — ls, find, cat, test -f, stat — on a line naming a store
 *   2. ANY literal ~/.local/share or $HOME/.local/share path, verb or not,
 *      outside the single sanctioned naming region in docs/points-process.md
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const id = 'store-inspection-scan'
const HERE = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(HERE, '..', '..')

const SKILLS = '.claude/commands/slava/disagreement'
export const SCANNED = [
  `${SKILLS}/select.md`, `${SKILLS}/prepare.md`, `${SKILLS}/positions.md`,
  `${SKILLS}/story-draft.md`, `${SKILLS}/publish.md`, `${SKILLS}/run-pipeline.md`,
  'docs/points-process.md',
]

export const STORE_NAMES = /\b(yt-store|audio-store|diarize-store|agent-store)\b/
export const LITERAL_PATH = /(~|\$HOME|\$\{HOME\})\/\.local\/share/
export const INSPECTION_VERB = /(^|[\s`(|;&])(ls|find|cat|stat)\s|(^|[\s`(|;&])test\s+-[a-z]\s/

/** The one sanctioned naming, delimited so the exemption is a region, not a guess. */
const SANCTION_OPEN = /<!--\s*store-naming:start\s*-->/
const SANCTION_CLOSE = /<!--\s*store-naming:end\s*-->/
const SANCTIONED_FILE = 'docs/points-process.md'

/** @param {{files?: string[], root?: string}} input */
export function run(input = {}) {
  const root = input.root ?? REPO_ROOT
  const files = input.files ?? SCANNED.map(f => path.join(root, f))
  const findings = []
  for (const file of files) {
    if (!existsSync(file)) { findings.push({ file, line: 0, reason: 'file not found', text: '' }); continue }
    const isSanctionedFile = file.endsWith(SANCTIONED_FILE)
    let sanctioned = false
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (isSanctionedFile && SANCTION_OPEN.test(line)) { sanctioned = true; return }
      if (isSanctionedFile && SANCTION_CLOSE.test(line)) { sanctioned = false; return }
      if (sanctioned) return
      if (LITERAL_PATH.test(line)) {
        findings.push({ file, line: i + 1, reason: 'literal store path outside the sanctioned naming', text: line.trim() })
        return
      }
      if (STORE_NAMES.test(line) && INSPECTION_VERB.test(line)) {
        findings.push({ file, line: i + 1, reason: 'direct store inspection — ask the owning tool instead', text: line.trim() })
      }
    })
  }
  if (findings.length) {
    return {
      ok: false, verdict: 'FLAG', findings,
      detail: `FLAG — ${findings.length} store inspection(s):\n` +
        findings.map(f => `    ${path.relative(root, f.file)}:${f.line} — ${f.reason}\n      ${f.text}`).join('\n'),
    }
  }
  return { ok: true, verdict: 'PASS', findings: [], detail: `PASS — zero direct store inspections across ${files.length} file(s)` }
}

const FIXTURE_DIR = path.join(REPO_ROOT, 'src/tests/fixtures/p1210/store-inspection')
export const FIXTURES = {
  pass: { files: [path.join(FIXTURE_DIR, 'clean.md')] },
  fail: { files: [path.join(FIXTURE_DIR, 'planted.md')] },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = run({})
  console.log(r.detail)
  process.exit(r.ok ? 0 : 1)
}
