/** P1210 DW-12 — zero direct store inspections; the pattern is wider than `ls`. */
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { run, FIXTURES, SCANNED, INSPECTION_VERB, LITERAL_PATH } from '../../scripts/points/store-inspection-scan.mjs'

describe('P1210 DW-12 — store-inspection scan', () => {
  it('MUST-PASS: the edited tree — six skill files plus docs/points-process.md — is clean', () => {
    const r = run({})
    expect(r.verdict).toBe('PASS')
    expect(SCANNED).toHaveLength(7)
    console.log('[DW-12 must-pass]', r.detail)
  })

  it('MUST-FAIL: a planted store inspection is FLAGGED with its line number', () => {
    const r = run(FIXTURES.fail)
    expect(r.verdict).toBe('FLAG')
    expect(r.findings).toHaveLength(1)
    expect(r.findings[0].line).toBe(5)
    console.log('[DW-12 must-fail]', r.detail)
  })

  it('the clean fixture, which names the stores without inspecting them, PASSES', () => {
    expect(run(FIXTURES.pass).verdict).toBe('PASS')
  })

  it('the pattern is widened past `ls` — find, cat, stat and test -f all bite', () => {
    for (const verb of ['ls ', 'find ', 'cat ', 'stat ', 'test -f ']) {
      expect(INSPECTION_VERB.test(`${verb}the diarize-store directory`)).toBe(true)
    }
    expect(LITERAL_PATH.test('~/.local/share/anything')).toBe(true)
    expect(LITERAL_PATH.test('$HOME/.local/share/anything')).toBe(true)
  })

  it('the sanctioned naming in docs/points-process.md is exempt BY REGION, not by filename', () => {
    // Same file, outside the delimiters: still flagged.
    const r = run({ files: [path.resolve(__dirname, 'fixtures/p1210/store-inspection/planted.md')] })
    expect(r.verdict).toBe('FLAG')
  })
})
