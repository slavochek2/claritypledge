// P1676: unit-test runs size their workers to the machine. Pure-logic tests: no processes are started.
// The scan against REAL vitest processes is scripts/test-p1676-scan-real.mjs (it starts real
// coordinators, so it stays out of the default suite).
import { describe, expect, it } from 'vitest'
import {
  computeShare,
  countOthers,
  isCoordinator,
  isProbableWatch,
  parsePs,
  resolveBudget,
  resolveCeiling,
  sizeTestWorkers,
} from '../../scripts/lib/test-worker-share.mjs'

const NODE = '/opt/homebrew/Cellar/node/26.9.0/bin/node'
const coord = (pid: number, ppid: number, tty: string, tail: string, root = '/r/w1') =>
  `${pid} ${ppid} ${tty} node ${root}/node_modules/.bin/vitest ${tail}`
const worker = (pid: number, ppid: number) =>
  `${pid} ${ppid} ?? ${NODE} --conditions node --require /r/node_modules/vitest/suppress-warnings.cjs /r/node_modules/vitest/dist/workers/forks.js`
const ps = (...lines: string[]) => lines.join('\n') + '\n'

describe('computeShare', () => {
  it('splits the budget across this run and the others, capped by the ceiling', () => {
    const cases: Array<[number, number, number, number]> = [
      // others, budget, ceiling, expected
      [0, 8, 4, 4],
      [1, 8, 4, 4],
      [2, 8, 4, 2],
      [3, 8, 4, 2],
      [5, 8, 4, 1],
      [20, 8, 4, 1],
      [0, 8, 3, 3],
      [3, 8, 3, 2],
      [0, 1, 4, 1],
    ]
    for (const [others, budget, ceiling, want] of cases) {
      expect(computeShare({ others, budget, ceiling }), `others=${others}`).toBe(want)
    }
  })

  it('is always an integer >= 1 and <= the ceiling, whatever it is fed', () => {
    for (const others of [0, 1, 5, 20, 1000, -3, NaN, 2.5]) {
      for (const budget of [1, 3, 8, 64]) {
        for (const ceiling of [1, 3, 4]) {
          const n = computeShare({ others, budget, ceiling })
          expect(Number.isInteger(n) && n >= 1 && n <= ceiling).toBe(true)
        }
      }
    }
  })
})

describe('resolveBudget / resolveCeiling', () => {
  it('budget defaults to cores minus 3 and never drops below 1', () => {
    expect(resolveBudget(undefined, 11).value).toBe(8)
    expect(resolveBudget(undefined, 4).value).toBe(1)
    expect(resolveBudget(undefined, 2).value).toBe(1)
    expect(resolveBudget('', 11).value).toBe(8)
  })
  it('a valid TEST_WORKER_BUDGET wins', () => {
    expect(resolveBudget('6', 11)).toEqual({ value: 6 })
  })
  it('invalid budgets fall back to the default with a warning', () => {
    for (const bad of ['0', '-2', 'abc', '3.5', ' ', '1e3']) {
      const r = resolveBudget(bad, 11)
      expect(r.value, bad).toBe(8)
      expect(r.warning, bad).toMatch(/TEST_WORKER_BUDGET/)
    }
  })
  it('ceiling defaults to 4; invalid values fall back with a warning', () => {
    expect(resolveCeiling(undefined)).toEqual({ value: 4 })
    expect(resolveCeiling('3')).toEqual({ value: 3 })
    for (const bad of ['0', '-1', 'abc', '2.5', '']) {
      const r = resolveCeiling(bad)
      expect(r.value, bad).toBe(4)
      expect(r.warning, bad).toBeTruthy()
    }
  })
})

describe('classification of ps lines', () => {
  it('parses pid, ppid, tty and the full args', () => {
    const rows = parsePs(ps(coord(10, 1, '??', 'run --maxWorkers=3'), 'garbage line', ''))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ pid: 10, ppid: 1, tty: '??' })
    expect(rows[0].args).toContain('node_modules/.bin/vitest run')
  })

  it('a coordinator is a vitest entry that is not a fork worker or a wrapper', () => {
    const [c] = parsePs(coord(10, 1, '??', 'run'))
    const [m] = parsePs(`11 1 ?? node /r/node_modules/vitest/vitest.mjs run`)
    const [w] = parsePs(worker(12, 10))
    const [npm] = parsePs('13 1 ?? npm exec vitest run --maxWorkers=3')
    const [npx] = parsePs('14 1 ?? npx vitest run')
    const [zsh] = parsePs('15 1 ?? zsh -c cd /r && node_modules/.bin/vitest run')
    const [sh] = parsePs('16 1 ?? /bin/sh -c node_modules/.bin/vitest run')
    const [bash] = parsePs('17 1 ?? /bin/bash node_modules/.bin/vitest run')
    const [other] = parsePs('18 1 ?? node /r/scripts/something.mjs')
    const [script] = parsePs('19 1 ?? script -q /dev/null node /r/node_modules/.bin/vitest run')
    const [pager] = parsePs('20 1 ttys001 vim /r/node_modules/.bin/vitest')
    expect(isCoordinator(c)).toBe(true)
    expect(isCoordinator(m)).toBe(true)
    for (const row of [w, npm, npx, zsh, sh, bash, other, script, pager]) expect(isCoordinator(row), row.args).toBe(false)
  })

  it('a coordinator on a terminal without run/--run is a probable watch session; everything else counts', () => {
    const row = (tty: string, tail: string) => parsePs(coord(10, 1, tty, tail))[0]
    expect(isProbableWatch(row('ttys003', ''))).toBe(true)
    expect(isProbableWatch(row('ttys003', 'related src/a.ts'))).toBe(true)
    expect(isProbableWatch(row('ttys003', 'run'))).toBe(false)
    expect(isProbableWatch(row('ttys003', '--run src/a.ts'))).toBe(false)
    expect(isProbableWatch(row('ttys003', 'related --run src/a.ts'))).toBe(false)
    // No terminal (an agent shell): vitest runs once, so it is an active run whatever the argv.
    expect(isProbableWatch(row('??', ''))).toBe(false)
    expect(isProbableWatch(row('?', 'related src/a.ts'))).toBe(false)
  })
})

describe('countOthers', () => {
  it('counts coordinators only, not workers or wrappers, and skips watchers', () => {
    const rows = parsePs(
      ps(
        coord(100, 1, '??', 'run'),
        worker(101, 100),
        worker(102, 100),
        '103 1 ?? npm exec vitest run',
        coord(110, 103, '??', ''),
        coord(120, 1, 'ttys001', 'related src/a.ts'),
        coord(130, 1, 'ttys002', 'run'),
        '140 1 ?? grep vitest',
      ),
    )
    expect(countOthers(rows, 99999)).toBe(3)
  })

  it('excludes the caller and its ancestors', () => {
    const rows = parsePs(
      ps(
        coord(200, 1, '??', 'run'), // an ancestor that is itself a coordinator (a test spawned by a run)
        `201 200 ?? ${NODE} /r/scripts/child.mjs`,
        coord(300, 1, '??', 'run'), // an unrelated run
      ),
    )
    expect(countOthers(rows, 201)).toBe(1)
    expect(countOthers(rows, 200)).toBe(1)
    expect(countOthers(rows, 300)).toBe(1)
  })

  it('terminates on a malformed parent chain', () => {
    const rows = parsePs(ps('1 2 ?? a', '2 1 ?? b'))
    expect(countOthers(rows, 1)).toBe(0)
  })

  it('scales: 0, 1, 5 and 20 other runs', () => {
    for (const n of [0, 1, 5, 20]) {
      const lines = Array.from({ length: n }, (_, i) => coord(1000 + i, 1, '??', 'run', `/r/w${i}`))
      expect(countOthers(parsePs(ps(...lines)), 1)).toBe(n)
    }
  })
})

describe('sizeTestWorkers', () => {
  const run = (opts: Parameters<typeof sizeTestWorkers>[0]) => {
    const lines: string[] = []
    const workers = sizeTestWorkers({ ...opts, write: (s: string) => lines.push(s) })
    return { workers, lines }
  }
  const three = ps(coord(1, 0, '??', 'run'), coord(2, 0, '??', 'run'), coord(3, 0, '??', 'run'))

  it('prints exactly one line and returns the share', () => {
    const { workers, lines } = run({ psText: three, pid: 999, cores: 11, env: {}, ceiling: 4 })
    expect(workers).toBe(2)
    expect(lines).toEqual(['test workers: 2 (3 other runs, budget 8, ceiling 4)'])
  })

  it('honours TEST_WORKER_BUDGET and a lower ceiling', () => {
    expect(run({ psText: '', pid: 999, cores: 11, env: { TEST_WORKER_BUDGET: '16' }, ceiling: 3 }).workers).toBe(3)
    expect(run({ psText: three, pid: 999, cores: 11, env: { TEST_WORKER_BUDGET: '16' }, ceiling: 9 }).workers).toBe(4)
  })

  it('invalid inputs yield an integer >= 1 and <= the ceiling, with a warning on the one line', () => {
    for (const bad of ['0', '-1', 'abc']) {
      const { workers, lines } = run({ psText: '', pid: 999, cores: 11, env: { TEST_WORKER_BUDGET: bad }, ceiling: bad })
      expect(Number.isInteger(workers) && workers >= 1 && workers <= 4, bad).toBe(true)
      expect(lines).toHaveLength(1)
      expect(lines[0]).toMatch(/\[ceiling .*TEST_WORKER_BUDGET/)
    }
  })

  it('a budget below 1 on a small machine still yields 1', () => {
    expect(run({ psText: three, pid: 999, cores: 2, env: {}, ceiling: 4 }).workers).toBe(1)
    expect(run({ psText: '', pid: 999, cores: 0, env: {}, ceiling: 4 }).workers).toBe(1)
  })

  it('a failed scan yields 1 with a one-line warning, never 0, NaN or undefined', () => {
    const { workers, lines } = run({
      pid: 999,
      cores: 11,
      env: { TEST_WORKER_SHARE_PS_FILE: '/nonexistent/p1676-ps-file' },
      ceiling: 4,
    })
    expect(workers).toBe(1)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^test workers: 1 \(sizing failed: /)
  })

  it('an exception anywhere in sizing yields 1', () => {
    const env = {} as Record<string, string>
    Object.defineProperty(env, 'TEST_WORKER_BUDGET', {
      get() {
        throw new Error('boom')
      },
    })
    const { workers, lines } = run({ psText: '', pid: 999, env, ceiling: 4 })
    expect(workers).toBe(1)
    expect(lines).toEqual(['test workers: 1 (sizing failed: boom)'])
  })
})
