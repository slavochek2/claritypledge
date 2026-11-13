// P1669: the Analytics tab embeds the five public Mixpanel boards. The links are read from the
// project's gitignored .env.local (MIXPANEL_BOARD_*) so committed code never names them. Only
// https Mixpanel public-board links (/p/<token> or /public/<token>) are accepted, and they are
// embedded unchanged: Mixpanel documents public boards as embeddable, and no other form is verified.
import type { Express } from 'express'
import { readFileSync } from 'fs'
import { join } from 'path'
import { dayEnabled } from './day'

export const BOARD_KEYS = ['pulse', 'path', 'return', 'friction', 'use'] as const
export type BoardKey = (typeof BOARD_KEYS)[number]

export const BOARD_LABELS: Record<BoardKey, string> = {
  // The titles the boards carry in Mixpanel, so the tab and Mixpanel name them the same.
  pulse: 'Pulse — is it growing?',
  path: 'Path to value — where do people drop?',
  return: 'Do they come back?',
  friction: 'Friction — what is broken for people?',
  use: 'What do people use?',
}

const PUBLIC_BOARD = /^https:\/\/(?:eu\.)?mixpanel\.com\/(?:p|public)\/([A-Za-z0-9_-]+)$/

export interface Board {
  key: BoardKey
  label: string
  url: string
}

export interface ParsedBoards {
  boards: Board[]
  /** Names (never values) of MIXPANEL_BOARD_* variables that are set but are not a public link. */
  invalid: string[]
}

export function parseBoards(envText: string): ParsedBoards {
  const vars: Record<string, string> = {}
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?(MIXPANEL_BOARD_[A-Z]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    const quoted = m[2].match(/^(["'])(.*?)\1/)
    // dotenv: a quoted value ends at its closing quote; an unquoted one ends before ` #` (an inline comment).
    vars[m[1]] = quoted ? quoted[2] : m[2].replace(/\s+#.*$/, '')
  }
  const boards: Board[] = []
  const invalid: string[] = []
  for (const key of BOARD_KEYS) {
    const name = `MIXPANEL_BOARD_${key.toUpperCase()}`
    const raw = vars[name]
    if (!raw) continue
    const m = raw.match(PUBLIC_BOARD)
    if (!m) {
      invalid.push(name)
      continue
    }
    // Embedded exactly as Mixpanel's Share dialog gave it: no rewriting of the path, which nothing verifies.
    boards.push({ key, label: BOARD_LABELS[key], url: raw })
  }
  return { boards, invalid }
}

const projectRoot = () => process.env.KANBAN_PROJECT_ROOT ?? join(process.cwd(), '..', '..')

export function registerMixpanelBoardRoutes(app: Express) {
  app.get('/api/day/mixpanel-boards', (_req, res) => {
    // Same gate as every other /api/day/* route.
    if (!dayEnabled()) return res.status(404).json({ error: 'Day page is not enabled' })
    let text = ''
    try {
      text = readFileSync(join(projectRoot(), '.env.local'), 'utf8')
    } catch {
      // No private settings file: the tab says how to configure it.
    }
    res.json(parseBoards(text))
  })
}
