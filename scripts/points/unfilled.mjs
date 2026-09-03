#!/usr/bin/env node
/**
 * unfilled.mjs — P1210 DW-5. Derive the unfilled-position count from the CAST
 * ENTRIES and assert it agrees with the run file's own `positions_unfilled`.
 *
 * WHY DERIVED RATHER THAN READ. Run B's header says `positions_unfilled: []`
 * while its own arguer list carries `status: UNFILLED` on position 3. A check
 * that reads the field agrees with the file and misses the defect; the Risks
 * table says so in as many words — derive from the cast entries, never from
 * that field, and assert the two agree.
 */
import { loadFixture } from './run-scoring.mjs'

export const id = 'unfilled'

/** @param {{file?: string, run?: object}} input */
export function run(input) {
  const data = input.run ?? loadFixture(input.file)
  const derived = data.cast.filter(c => c.status === 'UNFILLED')
  const declared = data.unfilledField
  const positions = derived.map(c => c.position)
  if (derived.length !== declared) {
    return {
      ok: false, verdict: 'DISAGREE', derived: derived.length, declared,
      detail: `DISAGREE — derived ${derived.length} unfilled from the cast entries (position${positions.length === 1 ? '' : 's'} ${positions.join(', ')}), positions_unfilled says ${declared}. The assert FIRES.`,
    }
  }
  return {
    ok: true, verdict: 'AGREE', derived: derived.length, declared,
    detail: `AGREE — derived ${derived.length} unfilled from the cast entries, positions_unfilled says ${declared}.`,
  }
}

export const FIXTURES = {
  // Must-PASS here is the AGREEING fixture: the assert must NOT fire on it.
  pass: { run: {
    cast: [
      { position: 1, code: 'A1', status: 'FILLED' },
      { position: 2, code: 'A2', status: 'FILLED' },
      { position: 3, code: null, status: 'UNFILLED' },
    ],
    unfilledField: 1,
  } },
  // Must-FAIL is run B's real shape: one UNFILLED cast entry, the field says 0.
  fail: { run: {
    cast: [
      { position: 1, code: 'A1', status: 'FILLED' },
      { position: 2, code: 'A2', status: 'FILLED' },
      { position: 3, code: null, status: 'UNFILLED' },
    ],
    unfilledField: 0,
  } },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) { console.error('usage: unfilled.mjs <derived-run-fixture.md>'); process.exit(2) }
  const r = run({ file })
  console.log(r.detail)
  process.exit(r.ok ? 0 : 1)
}
