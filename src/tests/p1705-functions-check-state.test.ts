// P1705 section C: every state of the dev-server functions mark, and every skip condition.
import { describe, it, expect } from 'vitest'
import { toState, skipReason, displayState, CHECK_INTERVAL_MS } from '../dev/functions-check-state'
import { bannerLines } from '../dev/test-functions-banner'

const NOW = Date.UTC(2030, 0, 1, 12, 0, 0)
const MATCH = 'match: 8 file(s)\nSTARTED: 1794986303408775000\n'
const DIFFERS = [
  'differs: fn-a, fn-b (server has feature/other from 2030-01-01T11:00:00Z, uncommitted)',
  'STARTED: 1794986303408775000',
  "Fix: TEST holds code that is not main's tip. From a clean checkout of main, deploy main's version:",
  '  scripts/selfhosted/deploy-functions.sh fn-a',
  '  scripts/selfhosted/deploy-functions.sh fn-b',
  'A deploy recreates the shared functions container.',
].join('\n')

describe('toState', () => {
  it('match', () => {
    const s = toState({ status: 0, stdout: MATCH, now: NOW })
    expect(s.kind).toBe('match')
    expect(s.checkedAt).toBe(NOW)
    expect(bannerLines(displayState(s, NOW)).tone).toBe('mark')
  })
  it('differs names the functions, the branch and the fix commands', () => {
    const s = toState({ status: 1, stdout: DIFFERS, now: NOW })
    expect(s.kind).toBe('differs')
    expect(s.functions).toEqual(['fn-a', 'fn-b'])
    expect(s.branch).toBe('feature/other from 2030-01-01T11:00:00Z, uncommitted')
    // Every fix line, so a command never appears without where it must run (Codex review, P1705).
    expect(s.fix).toEqual([
      "Fix: TEST holds code that is not main's tip. From a clean checkout of main, deploy main's version:",
      '  scripts/selfhosted/deploy-functions.sh fn-a',
      '  scripts/selfhosted/deploy-functions.sh fn-b',
      'A deploy recreates the shared functions container.',
    ])
    const text = bannerLines(displayState(s, NOW)).lines.join('\n')
    expect(text).toContain('fn-a, fn-b')
    expect(text).toContain('feature/other')
    expect(text).toContain('deploy-functions.sh fn-a')
    expect(text).toContain('From a clean checkout of main')
  })
  it('differs keeps the warning about functions this branch must not deploy', () => {
    const out = [
      'differs: fn-a, call-pass (server has feature/x from 2030-01-01T11:00:00Z)',
      'STARTED: 1794986303408775000',
      "Fix: deploy this branch's functions to TEST:",
      '  scripts/selfhosted/deploy-functions.sh fn-a',
      "Also differing from main's tip, and not changed by this branch: call-pass. Deploy those from a clean checkout of main, not from this branch.",
    ].join('\n')
    const text = bannerLines(displayState(toState({ status: 1, stdout: out, now: NOW }), NOW)).lines.join('\n')
    expect(text).toContain('not from this branch')
    // Order: summary first, then the fix text, the provenance last.
    expect(text.indexOf('Fix:')).toBeLessThan(text.indexOf('Server holds:'))
  })
  it('unknown from the check carries its reason', () => {
    const s = toState({ status: 2, stdout: 'unknown: gcloud not logged in\n', now: NOW })
    expect(s.kind).toBe('unknown')
    expect(s.reason).toBe('gcloud not logged in')
    expect(bannerLines(displayState(s, NOW)).tone).toBe('muted')
  })
  it('a timeout is unknown, never a pass', () => {
    const s = toState({ status: null, stdout: '', timedOut: true, now: NOW })
    expect(s.kind).toBe('unknown')
    expect(s.reason).toMatch(/deadline/)
  })
  it('a malformed answer and a spawn failure are unknown', () => {
    expect(toState({ status: 0, stdout: 'garbage\n', now: NOW }).kind).toBe('unknown')
    expect(toState({ status: 0, stdout: 'match: 3 file(s)\n', now: NOW }).kind).toBe('unknown') // no STARTED line
    expect(toState({ status: null, stdout: '', spawnError: 'ENOENT', now: NOW }).kind).toBe('unknown')
  })
})

describe('displayState', () => {
  it('is the last state while younger than one interval', () => {
    const s = toState({ status: 0, stdout: MATCH, now: NOW })
    expect(displayState(s, NOW + CHECK_INTERVAL_MS).kind).toBe('match')
  })
  it('is stale, with its age, once older than one interval', () => {
    const s = toState({ status: 1, stdout: DIFFERS, now: NOW })
    const d = displayState(s, NOW + CHECK_INTERVAL_MS + 5 * 60000)
    expect(d.kind).toBe('stale')
    expect(d.ageMinutes).toBe(35)
    expect(bannerLines(d).lines.join(' ')).toContain('35 min old')
  })
})

describe('skipReason', () => {
  it('runs with a clean environment', () => expect(skipReason({})).toBeNull())
  it('skips under Vitest', () => expect(skipReason({ VITEST: 'true' })).toMatch(/Vitest/))
  it('skips for a Playwright dev server', () => expect(skipReason({ P1705_SKIP_FUNCTIONS_CHECK: '1' })).toMatch(/Playwright/))
  it('skips for the load driver', () => expect(skipReason({ E2E_LOADTEST: '2' })).toMatch(/load driver/))
})

describe('P1705 banner element: a dismissal holds until the next result', () => {
  it('stays hidden across the per-minute repaint, and returns for a new check result', async () => {
    const { createFunctionsBanner } = await import('../dev/test-functions-banner')
    const differs = toState({ status: 1, stdout: DIFFERS, now: NOW })
    const b = createFunctionsBanner(document)
    b.update(differs, NOW)
    expect(b.el.isConnected).toBe(true)
    expect(b.el.style.display).not.toBe('none')
    ;(b.el.querySelector('button') as HTMLButtonElement).click()
    expect(b.el.style.display).toBe('none')
    b.repaint(NOW + 60_000) // the minute tick that used to bring it back
    expect(b.el.style.display).toBe('none')
    b.update({ ...differs, checkedAt: NOW + 30 * 60_000 }, NOW + 30 * 60_000)
    expect(b.el.style.display).not.toBe('none')
    b.el.remove()
  })

  it('the match mark lets clicks through (it sits over the mobile bottom nav); the banner takes them', async () => {
    const { createFunctionsBanner } = await import('../dev/test-functions-banner')
    const b = createFunctionsBanner(document)
    b.update(toState({ status: 0, stdout: MATCH, now: NOW }), NOW)
    expect(b.el.style.pointerEvents).toBe('none')
    expect(b.el.querySelector('button')).toBeNull()
    b.update(toState({ status: 1, stdout: DIFFERS, now: NOW }), NOW)
    expect(b.el.style.pointerEvents).toBe('auto')
    b.el.remove()
  })

  it('offline shows as unknown with its reason', () => {
    const s = toState({ status: null, stdout: '', offline: true, now: NOW })
    expect(s.kind).toBe('unknown')
    expect(bannerLines(displayState(s, NOW)).lines.join('\n')).toMatch(/offline/)
  })
})
