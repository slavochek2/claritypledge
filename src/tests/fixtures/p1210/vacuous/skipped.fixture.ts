// MUST-FAIL fixture for P1210 DW-21. One skipped test and one todo — measured
// 2026-09-03: a file of exactly this shape exits 0 under vitest, which is why a
// whole-file contract row does not close the exit-0 hole.
import { describe, it, expect } from 'vitest'

describe('a suite that asserts nothing', () => {
  it.skip('is skipped', () => {
    expect(1 + 1).toBe(3)
  })

  it.todo('is not written yet')
})
