import { describe, it, expect } from 'vitest'
import { loopNotices, waitingText } from '../../src/components/day/loops'

describe('the words a card says about its loop', () => {
  const owner = { kind: 'branch' as const, ref: 'fix/x', label: 'fix/x', state: 'live' as const, since: '2026-10-26', last_commit_at: '2026-10-26T09:00:00Z', idle_days: 1, unshipped: true }
  it('says an agent was sent and it is not fixed, with the count', () => {
    expect(loopNotices({ sent: { outcome: 'still-open', at: '2026-10-26T06:30:55Z', run_id: 'r', sent_id: 's', attempts: 4 } })[0].text).toBe('Agent sent 2026-10-26, 4 times, not fixed.')
    expect(loopNotices({ sent: { outcome: 'never-started', at: '2026-10-26T06:30:55Z', run_id: 'r', sent_id: 's' } })[0].text).toBe('Sent 2026-10-26, the agent never started.')
  })
  it('names the owner, whether the fix has shipped, and its age', () => {
    expect(loopNotices({ owner })[0].text).toBe('Owned by fix/x (a fix exists and has not shipped, since 2026-10-26, last commit 1 day ago)')
  })
  it('asks what now when the owner stopped moving or is gone, ahead of everything else', () => {
    const n = loopNotices({ owner: { ...owner, state: 'stale', idle_days: 11 }, escalated: { why: 'idle', days: 11 }, sent: { outcome: 'still-open', at: '2026-10-26T06:30:55Z', run_id: 'r', sent_id: 's' } })
    expect(n[0]).toEqual({ kind: 'escalated', text: 'This in-flight work (fix/x) has not moved in 11 days. What now?' })
    expect(loopNotices({ owner: { ...owner, state: 'gone' }, escalated: { why: 'gone' } })[0].text).toContain('is gone')
  })
  it('collapsed waiting row', () => {
    expect(waitingText({ owner, waiting: true })).toBe('Waiting on fix/x, last commit 1 day ago')
  })
  it('nothing to say with no annotation', () => {
    expect(loopNotices(undefined)).toEqual([])
  })
})
