// MUST-PASS fixture for P1210 DW-21. Named .fixture.ts, not .test.ts, so vitest
// does not collect it into the real suite — it exists to be SCANNED.
import { describe, it, expect } from 'vitest'

describe('a suite that actually executes', () => {
  it('asserts something', () => {
    expect(1 + 1).toBe(2)
  })
})
