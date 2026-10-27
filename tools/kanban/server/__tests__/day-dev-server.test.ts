import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

/** P1578 E: the board's API reloads its own code. A server-side change must not need a manual restart. */
describe('dev:server', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')) as { scripts: Record<string, string> }
  it('runs the API in tsx watch mode', () => {
    expect(pkg.scripts['dev:server']).toMatch(/^tsx watch\s+server\/api\.ts$/)
  })
  it('the production-style entry the e2e config uses is untouched (no watch there)', () => {
    expect(readFileSync(new URL('../../playwright.day.config.ts', import.meta.url), 'utf-8')).toContain("command: 'npx tsx server/api.ts'")
  })
})
