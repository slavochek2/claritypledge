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
 *   1. an inspection verb together with a store name, both inside ONE command span
 *   2. ANY literal ~/.local/share or $HOME/.local/share path, verb or not,
 *      outside the single sanctioned naming region in docs/points-process.md
 *
 * P1244 — TWO CORRECTIONS, and the second matters more than the first.
 *
 * (a) THE UNIT IS A COMMAND SPAN, NOT A LINE. Matching per line conflated a command
 * with a sentence about one: at the P1210 ship, adding `grep` to the verb list
 * flagged
 *   **Verification:** `grep -F` against the cleaned transcript … in the yt-store
 * where the verb is an inline code span and the store name is prose. Verb and store
 * must now appear in the SAME span — a fenced block, or one line's inline spans
 * taken together. See md-spans.mjs for the parsing and its stated limit.
 *
 * (b) ONLY EXISTENCE AND METADATA CHECKS ARE INSPECTIONS. Reading the CONTENT of a
 * named artifact is not what this rule forbids, and the old verb list did not know
 * the difference — it carried `cat`, and P1244 was about to add `grep`, `head` and
 * `tail`. Those are how the pipeline legitimately verifies a quote:
 *   select.md    grep -ciE "<surname>" "$YT_STORE"/<id>/en.vtt
 *   positions.md grep -cF "$q" "$YT_STORE"/<video-id>/<lang>.clean.txt
 * The defect the store README actually describes is inferring THAT WORK WAS DONE
 * from the filesystem — "do not consult this directory before diarizing: the reuse
 * check lives inside the tool." That is `ls`, `find`, `test -f`, `stat`, `tree`:
 * existence and metadata. So the verb list SHRANK on the content side and grew on
 * the existence side, and the store-name pattern could then safely learn the
 * $YT_STORE / ${DIARIZE_STORE} spelling the skill files actually use — which the
 * hyphenated-only pattern never matched, and which was the real false negative.
 *
 * Found by writing a control that the scanner failed, not by reading it.
 *
 * Rule 2 still scans EVERY line, prose included. A literal ~/.local/share path is
 * not casual English, and the sanctioned-naming region already carves out the one
 * place it belongs — narrowing rule 2 to command spans would lose coverage for no
 * measured false positive.
 */
import { readFileSync, existsSync } from 'node:fs'
import { commandSpans } from './md-spans.mjs'
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

// Both spellings: the prose/dir name, and the shell variables the skill files use.
export const STORE_NAMES =
  /\b(yt-store|audio-store|diarize-store|agent-store)\b|\$\{?(YT|AUDIO|DIARIZE|AGENT)_(STORE|LEDGER)\}?/
export const LITERAL_PATH = /(~|\$HOME|\$\{HOME\})\/\.local\/share/
// P1244: existence + metadata ONLY. Content reads (cat/grep/head/tail/wc) are the
// pipeline's legitimate quote verification and were removed — see (b) in the header.
export const INSPECTION_VERB =
  /(^|[\s`(|;&])(ls|find|stat|tree|readlink|realpath|du)\s|(^|[\s`(|;&])(test|\[)\s+-[a-z]\s/

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
    const raw = readFileSync(file, 'utf8')
    const lines = raw.split('\n')

    // Which lines are inside the sanctioned naming region — computed once, used by both rules.
    const exempt = new Array(lines.length).fill(false)
    if (isSanctionedFile) {
      let on = false
      lines.forEach((line, i) => {
        if (SANCTION_OPEN.test(line)) { on = true; exempt[i] = true; return }
        if (SANCTION_CLOSE.test(line)) { on = false; exempt[i] = true; return }
        exempt[i] = on
      })
    }

    // Rule 2 — literal store path, EVERY line including prose (see header).
    // ONE FINDING PER LINE, rule 2 taking precedence — the pre-P1244 code got this
    // from an early `return` inside a single loop. Splitting the rules into two
    // passes lost it, and `ls ~/.local/share/yt-store/…` reported twice: one defect,
    // two lines of output, and a must-fail control that counts findings breaks.
    const flagged = new Set()
    lines.forEach((line, i) => {
      if (exempt[i]) return
      if (LITERAL_PATH.test(line)) {
        findings.push({ file, line: i + 1, reason: 'literal store path outside the sanctioned naming', text: line.trim() })
        flagged.add(i + 1)
      }
    })

    // Rule 1 — verb AND store name inside ONE command span (P1244).
    const { units, malformed } = commandSpans(raw)
    for (const m of malformed) {
      if (exempt[m.line - 1]) continue
      findings.push({ file, line: m.line, reason: m.reason, text: (lines[m.line - 1] ?? '').trim() })
    }
    for (const u of units) {
      // A span is exempt only if its whole range sits inside the sanctioned region.
      let allExempt = true
      for (let i = u.startLine - 1; i < u.endLine && allExempt; i++) if (!exempt[i]) allExempt = false
      if (allExempt) continue
      if (STORE_NAMES.test(u.text) && INSPECTION_VERB.test(u.text)) {
        // Anchor on the first line of the span rule 2 has not already reported.
        // A span every line of which is already flagged is the same defect twice.
        let anchor = 0
        for (let i = u.startLine; i <= u.endLine; i++) if (!flagged.has(i)) { anchor = i; break }
        if (anchor === 0) continue
        flagged.add(anchor)
        const where = u.startLine === u.endLine ? `${u.startLine}` : `${u.startLine}-${u.endLine}`
        findings.push({
          file, line: anchor,
          reason: `direct store inspection — ask the owning tool instead (${u.kind} span ${where})`,
          text: u.text.split('\n').map(t => t.trim()).join(' ⏎ ').slice(0, 160),
        })
      }
    }
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
