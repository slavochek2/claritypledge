/**
 * P1244 — the points scanners must read commands, not prose.
 *
 * Every must-pass fixture here is REAL TEXT from the pipeline's own files that was
 * wrongly flagged when the verb and phrase lists were widened at the P1210 ship
 * (2026-09-03). They are the false-positive rate, made permanent. The must-fail
 * cases include one defect that was a silent false NEGATIVE before this spec: an
 * existence check written with the $DIARIZE_STORE variable spelling, which the
 * hyphenated-only store pattern never matched.
 */
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { commandSpans } from '../../scripts/points/md-spans.mjs'
import { run as storeScan } from '../../scripts/points/store-inspection-scan.mjs'
import { INPUT_ASK } from '../../scripts/points/input-block-scan.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const FX = path.join(ROOT, 'src/tests/fixtures/p1244')
const fx = (n: string) => path.join(FX, n)

describe('P1244 — md-spans separates commands from prose', () => {
  it('a verb in an inline span and a store name in prose are NOT one unit', () => {
    const { units } = commandSpans(
      '**Verification:** `grep -F` against the cleaned transcript, from the RAW `.vtt` file in the yt-store (§0.6).')
    expect(units).toHaveLength(1)
    expect(units[0].text).not.toMatch(/yt-store/)
    console.log('[P1244 spans]', JSON.stringify(units[0].text))
  })

  it('an inline code span that WRAPS across source lines is one span', () => {
    const { units } = commandSpans(
      '> walk the bytes against the ledger — `node scripts/points/store-reconcile.mjs --store-root\n' +
      '> "$DIARIZE_STORE" --ledger "$AGENT_LEDGER"` — because a ledger query cannot.')
    expect(units).toHaveLength(1)
    expect(units[0].text).toContain('store-reconcile.mjs')
    expect(units[0].text).toContain('AGENT_LEDGER')
    expect(units[0].endLine).toBeGreaterThan(units[0].startLine)
  })

  it('an unterminated fence is reported and does NOT swallow the tail', () => {
    const { units, malformed } = commandSpans('```bash\nls foo\n\nthe diarize-store is nice\n')
    expect(malformed).toHaveLength(1)
    expect(malformed[0].reason).toMatch(/unterminated/)
    expect(units.filter(u => u.kind === 'fence')).toHaveLength(0)
  })
})

describe('P1244 — store-inspection-scan: existence vs content, span vs prose', () => {
  it('MUST-PASS: the real 2026-09-03 false positives stay CLEAN', () => {
    const r = storeScan({ files: [fx('prose-not-instruction.md')] })
    console.log('[P1244 must-pass prose]', r.detail)
    expect(r.verdict).toBe('PASS')
  })

  it('MUST-PASS: reading the CONTENT of a named artifact is legitimate', () => {
    const r = storeScan({ files: [fx('content-read-is-legitimate.md')] })
    console.log('[P1244 must-pass content-read]', r.detail)
    expect(r.verdict).toBe('PASS')
  })

  it('MUST-FAIL: existence checks in command spans are FLAGGED, incl. the $VAR spelling', () => {
    const r = storeScan({ files: [fx('existence-check-in-fence.md')] })
    expect(r.verdict).toBe('FLAG')
    const text = r.findings.map((f: any) => f.text).join(' | ')
    // the $VAR spelling — a silent false NEGATIVE before P1244
    expect(text).toMatch(/\$DIARIZE_STORE/)
    // the split-line case, caught because a fenced block is one unit
    expect(text).toMatch(/diarize-store directory/)
    expect(r.findings.length).toBeGreaterThanOrEqual(3)
    console.log('[P1244 must-fail]', r.detail)
  })

  it('MUST-FAIL: an unterminated fence is reported as malformed', () => {
    const r = storeScan({ files: [fx('unterminated-fence.md')] })
    expect(r.verdict).toBe('FLAG')
    expect(r.findings.some((f: any) => /unterminated/.test(f.reason))).toBe(true)
  })

  it('the real tree passes — the check that caught the reverted widening (gate 7c)', () => {
    const r = storeScan({})
    console.log('[P1244 gate 7c]', r.detail)
    expect(r.verdict).toBe('PASS')
  })
})

/**
 * Bypasses an independent codex review reproduced against the first implementation
 * (2026-09-04). Each is kept as a permanent control: the author of a scanner is the
 * worst judge of what evades it, and three of these were live after a pass that had
 * already run nine of my own controls.
 */
describe('P1244 — codex-review bypasses, closed', () => {
  it('a leading path does not disguise the command: /bin/ls is still ls', () => {
    const r = storeScan({ files: [fx('codex-bypasses.md')] })
    expect(r.verdict).toBe('FLAG')
    const t = r.findings.map((f: any) => f.text).join(' | ')
    expect(t).toMatch(/\/bin\/ls/)
    expect(t).toMatch(/\[\[ -d/)
    console.log('[P1244 codex F1]', r.detail)
  })

  it('a command inside an HTML comment is NOT a command span', () => {
    const { units } = commandSpans('<!-- `node scripts/points/fake.mjs` is documentation -->')
    expect(units).toHaveLength(0)
  })

  it('an HTML comment does not shift the line numbers of later spans', () => {
    const { units } = commandSpans('<!-- `a` -->\n\nrun `ls` here\n')
    expect(units).toHaveLength(1)
    expect(units[0].startLine).toBe(3)
  })

  it('unbalanced store-naming markers DISABLE the exemption and are reported', () => {
    const r = storeScan({ files: [fx('unbalanced-sanction/docs/points-process.md')] })
    expect(r.verdict).toBe('FLAG')
    expect(r.findings.some((f: any) => /unbalanced store-naming/.test(f.reason))).toBe(true)
    console.log('[P1244 codex F5]', r.detail)
  })
})

describe('P1244 — input-block-scan: widened by object, not by verb', () => {
  const asks = [
    ['ask for the event tag if not supplied', 'the original shape still bites'],
    ['Confirm the event tag with the founder before filing.', 'reworded ask, was invisible'],
    ['Obtain the filing identity from the operator.', 'reworded ask, was invisible'],
    ['The founder supplies the event tag here.', 'passive form'],
  ] as const
  for (const [line, why] of asks) {
    it(`MATCHES an input ask — ${why}`, () => expect(INPUT_ASK.test(line)).toBe(true))
  }

  const clean = [
    ['A whitelist-and-count check is what makes a hash of an opaque SQL string mean anything.', 'REAL false positive'],
    ['Same shape as the check above and for the same reason — this skill does not author.', 'REAL false positive'],
    ['Confirm the hash matches before writing.', 'confirm with no person named'],
    ['halt for founder approval before any write', 'APPROVAL gate — §9 weakens none of them'],
    ['requires an explicit founder affirmative', 'APPROVAL gate — §9 weakens none of them'],
  ] as const
  for (const [line, why] of clean) {
    it(`does NOT match — ${why}`, () => expect(INPUT_ASK.test(line)).toBe(false))
  }
})
