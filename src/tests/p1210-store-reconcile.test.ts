/**
 * P1210 DW-13 + DW-18 — walk the BYTES and diff them against the ledger.
 *
 * Runs against a committed fixture store tree, never a home directory: the store
 * root and the ledger path are parameters, which is what makes this row ci-tier
 * honestly.
 */
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { run, walk, readLedger, FIXTURES } from '../../scripts/points/store-reconcile.mjs'

const TREE = path.resolve(__dirname, 'fixtures/p1210/stores')

describe('P1210 DW-13 + DW-18 — store reconciliation', () => {
  it('DW-13: the store root and ledger are PARAMETERS, resolved inside the repo', () => {
    expect(FIXTURES.pass.storeRoot).toContain('src/tests/fixtures/p1210/stores')
    expect(FIXTURES.pass.storeRoot.startsWith(path.resolve(__dirname, '../..'))).toBe(true)
    expect(walk(FIXTURES.pass.storeRoot).length).toBeGreaterThan(0)
  })

  it('MUST-PASS (DW-18 half one): the staged ledger-ORPHAN is FOUND and does NOT stop the run', () => {
    const r = run(FIXTURES.pass)
    expect(r.verdict).toBe('CLEAR')
    expect(r.orphans).toContain('MWMe7yjPYpE/0s+1751s.json')
    expect(r.blockers).toEqual([])
    console.log('[DW-18 must-pass]\n' + r.detail)
  })

  it('MUST-FAIL (DW-18 half two): a genuinely absent artifact STILL BLOCKS', () => {
    const r = run(FIXTURES.fail)
    expect(r.verdict).toBe('BLOCK')
    expect(r.blockers).toContain('NEVER_FETCHED/0s+900s.json')
    console.log('[DW-18 must-fail]\n' + r.detail)
  })

  it('the orphan is exactly the shape that blocked run B: bytes present, zero ledger rows', () => {
    const bytes = walk(path.join(TREE, 'diarize-store')).map(b => b.rel)
    const ledger = readLedger(path.join(TREE, 'index.ledger'))
    expect(bytes).toContain('MWMe7yjPYpE/0s+1751s.json')
    expect(ledger).not.toContain('MWMe7yjPYpE/0s+1751s.json')
  })

  it('a LEDGER QUERY cannot find the orphan — which is why the rule says walk the bytes', () => {
    const ledger = readLedger(path.join(TREE, 'index.ledger'))
    // The circular form: ask the ledger whether it knows the artifact.
    const ledgerSaysPresent = ledger.includes('MWMe7yjPYpE/0s+1751s.json')
    expect(ledgerSaysPresent).toBe(false)
    // The byte walk finds it anyway, and clears the blocker.
    expect(run(FIXTURES.pass).verdict).toBe('CLEAR')
  })
})
