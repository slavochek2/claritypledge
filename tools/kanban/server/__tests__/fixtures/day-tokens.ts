// P1552 — an INVENTED token block. Project names and figures are made up (spec Invariants:
// no private project name or account usage figure in any tracked file, test or screenshot).
import type { DayTokenPeriod, DayTokens } from '../../../src/lib/day'

const wk = (p: string, opus: number, sonnet: number, codex: number, o: Partial<DayTokenPeriod> = {}): DayTokenPeriod => ({
  p, output: { Opus: opus, Sonnet: sonnet, ...(codex ? { Codex: codex } : {}) }, days: { claude: 5, codex: codex ? 2 : 0, gemini: 1 }, gemini_calls: 4, ctx_per_reply: 94_000, ...o,
})

export const SYNTH_TOKENS: DayTokens = {
  collected: true,
  as_of: '2026-10-03',
  weeks: [
    wk('2026-07-27', 700_000, 100_000, 0),
    wk('2026-08-03', 800_000, 150_000, 0),
    wk('2026-08-10', 900_000, 200_000, 0),
    wk('2026-08-17', 1_000_000, 250_000, 0),
    wk('2026-08-24', 1_100_000, 280_000, 0),
    wk('2026-08-31', 1_200_000, 300_000, 0, { ctx_per_reply: 80_000 }),
    wk('2026-09-07', 1_800_000, 400_000, 100_000),
    wk('2026-09-14', 900_000, 500_000, 200_000),
    wk('2026-09-21', 2_400_000, 600_000, 300_000, { median4: 1_700_000 }),
    wk('2026-09-28', 3_000_000, 700_000, 500_000, { median4: 1_850_000 }),
  ],
  months: [
    { p: '2026-08', output: { Opus: 4_000_000, Sonnet: 1_000_000 }, days: { claude: 20, codex: 0 }, ctx_per_reply: 70_000 },
    { p: '2026-09', output: { Opus: 8_000_000, Sonnet: 2_000_000, Codex: 1_000_000 }, days: { claude: 25, codex: 9 }, ctx_per_reply: 90_000, median4: 5_000_000 },
  ],
  projects_28d: [
    { project: 'demo-site', output: 4_000_000, share: 0.5 },
    { project: 'demo-api-with-a-very-long-invented-name-that-truncates', output: 2_000_000, share: 0.25 },
    { project: 'demo-notes', output: 1_000_000, share: 0.125 },
    { project: 'demo-docs', output: 400_000, share: 0.05 },
    { project: 'demo-tools', output: 300_000, share: 0.0375 },
    { project: 'all others', output: 300_000, share: 0.0375 },
  ],
}
