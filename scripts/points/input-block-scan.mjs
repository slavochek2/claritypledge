#!/usr/bin/env node
/**
 * input-block-scan.mjs — P1210 §9 / DW-16. Founder inputs are asked ONCE, in a
 * block, up front — not discovered one at a time mid-stage.
 *
 * Two things are checked, and the second is the one with teeth:
 *   1. The named inputs sit INSIDE the declared input block.
 *      publish.md Stage 0: the event tag and the filing identity.
 *      run-pipeline.md: the story fan-out approval.
 *   2. ZERO founder-input asks appear after that block, to the end of the file.
 *
 * WHAT IS NOT AN INPUT ASK. §9 is explicit that nothing here weakens a gate
 * around identity creation, publishing, a database write, or quote/speaker
 * verification. Those gates ASK FOR AN APPROVAL, not for a value, and they stay.
 * A line may also carry an explicit `<!-- must-stay-gate -->` marker to say so.
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const id = 'input-block-scan'
const HERE = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(HERE, '..', '..')
const SKILLS = '.claude/commands/slava/disagreement'

const BLOCK_OPEN = /<!--\s*input-block:start\s*-->/
const BLOCK_CLOSE = /<!--\s*input-block:end\s*-->/
const MUST_STAY = /<!--\s*must-stay-gate\s*-->/

/** Asking for a VALUE. Not an approval, not a confirmation, not a gate.
 *
 * P1244 — WIDENED BY OBJECT, NOT BY VERB, and the distinction is the whole fix.
 * The old pattern was anchored on the literal word "ask", so every rewording that
 * asks for a value without it slipped through: "confirm the event tag with the
 * founder", "obtain the filing identity from the operator".
 *
 * The obvious repair — add more verbs — was attempted at the P1210 ship and
 * REVERTED. Adding `check` and `get` flagged two ordinary English sentences:
 *   "A whitelist-and-count check is what makes a hash … mean anything."
 *   "Same shape as the check above and for the same reason …"
 * Those verbs are too common in prose about a pipeline to carry a rule.
 *
 * NOTE this scanner does NOT use md-spans.mjs, unlike store-inspection-scan.mjs.
 * That module restricts matching to command spans, which is right for shell
 * commands and wrong here: an input ask is an INSTRUCTION IN PROSE to the agent
 * running the stage. Restricting it to code spans would delete the check.
 *
 * So the widening is by OBJECT instead. Branch 1 keeps the original ask-shape.
 * Branch 2 admits more verbs only when the founder or the operator is named as the
 * thing being asked — "confirm X with the founder" is an input ask; "confirm the
 * hash matches" is not, and no amount of verb-listing separates them.
 */
export const INPUT_ASK = new RegExp(
  '\\bask\\b[^.\\n]{0,60}?\\b(if not supplied|for the |for a |which |what )' +
  '|' +
  '\\b(ask|confirm|obtain|request|collect|solicit)\\b[^.\\n]{0,60}?\\b(with|from|of)\\s+the\\s+(founder|operator|user)\\b' +
  '|' +
  '\\b(founder|operator)\\s+(supplies|provides|is asked)\\b',
  'i')

export const TARGETS = [
  {
    file: `${SKILLS}/publish.md`,
    requiredInBlock: [['the event tag', /event tag/i], ['the filing identity', /filing identity/i]],
    scanAfterBlock: true,
  },
  {
    file: `${SKILLS}/run-pipeline.md`,
    requiredInBlock: [['the story fan-out approval', /fan-out/i]],
    scanAfterBlock: false,
  },
]

/** @param {{targets?: typeof TARGETS, root?: string}} input */
export function run(input = {}) {
  const root = input.root ?? REPO_ROOT
  const targets = input.targets ?? TARGETS
  const findings = []
  const found = []

  for (const t of targets) {
    const file = path.isAbsolute(t.file) ? t.file : path.join(root, t.file)
    if (!existsSync(file)) { findings.push({ file: t.file, section: '—', reason: 'file not found' }); continue }
    const lines = readFileSync(file, 'utf8').split('\n')
    const start = lines.findIndex(l => BLOCK_OPEN.test(l))
    const end = lines.findIndex(l => BLOCK_CLOSE.test(l))
    if (start === -1 || end === -1 || end < start) {
      findings.push({ file: t.file, section: '—', reason: 'no delimited input block' })
      continue
    }
    const block = lines.slice(start + 1, end).join('\n')
    for (const [label, re] of t.requiredInBlock) {
      if (re.test(block)) found.push(`${t.file}: ${label} is inside the input block`)
      else findings.push({ file: t.file, section: '(input block)', reason: `MISSING from the input block — ${label}` })
    }
    if (!t.scanAfterBlock) continue

    let section = '(top)'
    for (let i = 0; i <= end; i++) {
      const h = lines[i].match(/^#{2,3}\s+(.*)$/)
      if (h) section = h[1].trim()
    }
    for (let i = end + 1; i < lines.length; i++) {
      const h = lines[i].match(/^#{2,3}\s+(.*)$/)
      if (h) { section = h[1].trim(); continue }
      if (MUST_STAY.test(lines[i])) continue
      if (INPUT_ASK.test(lines[i])) {
        findings.push({ file: t.file, section, line: i + 1, reason: 'founder-input ask after the input block', text: lines[i].trim() })
      }
    }
  }

  if (findings.length) {
    return {
      ok: false, verdict: 'FLAG', findings, found,
      detail: `FLAG — ${findings.length} finding(s):\n` +
        findings.map(f => `    ${f.file} §${f.section}${f.line ? `:${f.line}` : ''} — ${f.reason}${f.text ? `\n      ${f.text}` : ''}`).join('\n'),
    }
  }
  return { ok: true, verdict: 'PASS', findings: [], found, detail: `PASS — every named input is in its block; no founder-input ask MATCHING THE KNOWN SHAPES after it`
    + ` (this pattern cannot enumerate English — see P1244 Open #2)` }
}

const FIXTURE_DIR = path.join(REPO_ROOT, 'src/tests/fixtures/p1210/input-blocks')
export const FIXTURES = {
  pass: { targets: [{ file: path.join(FIXTURE_DIR, 'clean-publish.md'), requiredInBlock: [['the event tag', /event tag/i], ['the filing identity', /filing identity/i]], scanAfterBlock: true }] },
  fail: { targets: [{ file: path.join(FIXTURE_DIR, 'moved-ask-publish.md'), requiredInBlock: [['the event tag', /event tag/i], ['the filing identity', /filing identity/i]], scanAfterBlock: true }] },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = run({})
  console.log(r.detail)
  process.exit(r.ok ? 0 : 1)
}
