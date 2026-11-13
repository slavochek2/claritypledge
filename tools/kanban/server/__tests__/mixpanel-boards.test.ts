// P1669: the Analytics tab embeds the five public Mixpanel boards. Their links live only in the
// gitignored .env.local; nothing in committed code names them (fake tokens only here).
import { describe, expect, it } from 'vitest'
import { parseBoards, BOARD_KEYS, BOARD_LABELS } from '../mixpanelBoards'

const env = [
  '# comment',
  'OTHER=1',
  'MIXPANEL_BOARD_PULSE=https://eu.mixpanel.com/p/AAA111',
  'MIXPANEL_BOARD_PATH="https://eu.mixpanel.com/p/BBB222"',
  'MIXPANEL_BOARD_RETURN=https://eu.mixpanel.com/public/CCC333',
  'MIXPANEL_BOARD_FRICTION=https://evil.example.com/p/DDD',
  'MIXPANEL_BOARD_USE=',
].join('\n')

describe('parseBoards', () => {
  it('returns the boards in fixed order, embedding each link exactly as given', () => {
    const { boards } = parseBoards(env)
    expect(boards.map((b) => b.key)).toEqual(['pulse', 'path', 'return'])
    expect(boards[0].url).toBe('https://eu.mixpanel.com/p/AAA111')
    expect(boards[1].url).toBe('https://eu.mixpanel.com/p/BBB222')
    expect(boards[2].url).toBe('https://eu.mixpanel.com/public/CCC333')
  })

  it('never embeds an arbitrary host, and names the variable (not its value) as invalid', () => {
    const r = parseBoards(env)
    expect(r.boards.some((b) => b.url.includes('evil'))).toBe(false)
    expect(r.invalid).toEqual(['MIXPANEL_BOARD_FRICTION'])
    expect(JSON.stringify(r.invalid)).not.toContain('evil')
  })

  it('rejects http, internal login links and values with spaces', () => {
    const r = parseBoards(
      [
        'MIXPANEL_BOARD_PULSE=http://eu.mixpanel.com/p/AAA111',
        'MIXPANEL_BOARD_PATH=https://eu.mixpanel.com/project/1/app/boards#id=2',
        'MIXPANEL_BOARD_USE=https://eu.mixpanel.com/p/AAA111 extra',
      ].join('\n'),
    )
    expect(r.boards).toEqual([])
    expect(r.invalid).toEqual(['MIXPANEL_BOARD_PULSE', 'MIXPANEL_BOARD_PATH', 'MIXPANEL_BOARD_USE'])
  })

  it('an empty value counts as not configured, not invalid', () => {
    expect(parseBoards('MIXPANEL_BOARD_USE=\n')).toEqual({ boards: [], invalid: [] })
  })

  it('reads values the way dotenv does: an inline comment after an unquoted value is not part of it', () => {
    const r = parseBoards(
      [
        'MIXPANEL_BOARD_PULSE=https://eu.mixpanel.com/p/AAA111 # the pulse board',
        'MIXPANEL_BOARD_PATH="https://eu.mixpanel.com/p/BBB222" # quoted, then a comment',
        "MIXPANEL_BOARD_RETURN='https://eu.mixpanel.com/p/CCC333'",
      ].join('\n'),
    )
    expect(r.boards.map((b) => b.url)).toEqual(['https://eu.mixpanel.com/p/AAA111', 'https://eu.mixpanel.com/p/BBB222', 'https://eu.mixpanel.com/p/CCC333'])
    expect(r.invalid).toEqual([])
  })

  it('labels match the board titles in Mixpanel', () => {
    expect(BOARD_LABELS.return).toBe('Do they come back?')
    expect(BOARD_LABELS.use).toBe('What do people use?')
  })

  it('returns nothing when no board is configured', () => {
    expect(parseBoards('OTHER=1')).toEqual({ boards: [], invalid: [] })
  })

  it('knows all five boards', () => {
    expect(BOARD_KEYS).toHaveLength(5)
  })
})

describe('GET /api/day/mixpanel-boards', () => {
  it('answers only when the Day page is enabled, like every other /api/day route', async () => {
    const express = (await import('express')).default
    const { createServer } = await import('http')
    const { mkdtemp, writeFile, rm } = await import('fs/promises')
    const { tmpdir } = await import('os')
    const { join } = await import('path')
    const { registerMixpanelBoardRoutes } = await import('../mixpanelBoards')
    const root = await mkdtemp(join(tmpdir(), 'p1669-boards-'))
    await writeFile(join(root, '.env.local'), 'MIXPANEL_BOARD_PULSE=https://eu.mixpanel.com/p/AAA111\n')
    process.env.KANBAN_PROJECT_ROOT = root
    const app = express()
    registerMixpanelBoardRoutes(app)
    const server = createServer(app)
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/day/mixpanel-boards`
    try {
      delete process.env.KANBAN_DAY_DIR
      expect((await fetch(url)).status).toBe(404)
      process.env.KANBAN_DAY_DIR = root
      const res = await fetch(url)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ boards: [{ key: 'pulse', label: BOARD_LABELS.pulse, url: 'https://eu.mixpanel.com/p/AAA111' }], invalid: [] })
    } finally {
      delete process.env.KANBAN_DAY_DIR
      delete process.env.KANBAN_PROJECT_ROOT
      await new Promise<void>((r) => server.close(() => r()))
      await rm(root, { recursive: true, force: true })
    }
  })
})
