import { describe, it, expect } from 'vitest'
import { COLUMN_COLOURS, statusStyleFor, wipCountColour } from '../columnColours'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const src = (f: string) => readFileSync(resolve(__dirname, '../../', f), 'utf-8')
/** The `{ id: 'x', title: 'X', color: '#...' }` rows of a file, id → colour. */
const colours = (f: string) => Object.fromEntries([...src(f).matchAll(/id: '([^']+)',\s*title: '[^']+',\s*color: '(#[0-9a-f]{6})'/g)].map((m) => [m[1], m[2]]))

describe('board column colours', () => {
  it('COLOURS — Blocked has its own red-family pill, distinct from QA amber', () => {
    const blocked = statusStyleFor(colours('App.tsx').blocked)
    const qa = statusStyleFor(colours('App.tsx').qa)
    expect(blocked.bg).toContain('status-red')
    expect(qa.bg).toContain('status-yellow')
    expect(blocked).not.toEqual(qa)
  })

  it('COLOURS — no Pipeline or Content column is amber; the ones that were map to slate', () => {
    const pipeline = colours('components/PipelinePage.tsx')
    const content = colours('components/ContentPage.tsx')
    for (const [id, c] of Object.entries({ ...pipeline, ...content })) expect(c, id).not.toBe(COLUMN_COLOURS.amber)
    expect(pipeline.qualified).toBe(COLUMN_COLOURS.slate)
    expect(content.editing).toBe(COLUMN_COLOURS.slate)
    expect(statusStyleFor(COLUMN_COLOURS.slate).bg).toContain('status-gray')
  })

  it('COLOURS — Column.tsx reads the shared map, not a local one that could say Blocked is amber', () => {
    const col = src('components/Column.tsx')
    expect(col).toContain('statusStyleFor')
    expect(col).not.toMatch(/#ef4444/)
  })

  it('COLOURS — Today may stay blue; an unknown colour is neutral, never amber', () => {
    expect(colours('App.tsx').today).toBe(COLUMN_COLOURS.blue)
    expect(statusStyleFor('#123456').bg).toContain('status-gray')
  })

  it('COLOURS — a column over its WIP limit counts in red, never amber; at or under it is not red', () => {
    expect(wipCountColour(6, 5)).toContain('cp-red')
    expect(wipCountColour(6, 5)).not.toContain('amber')
    expect(wipCountColour(5, 5)).not.toContain('cp-red')
    expect(wipCountColour(2, 5)).not.toContain('cp-red')
    expect(wipCountColour(9, undefined)).not.toContain('cp-red')
    expect(src('components/Column.tsx')).toContain('wipCountColour')
    expect(src('components/Column.tsx')).not.toContain('cp-amber')
  })

  it('COLOURS — the Focus page shows Blocked in the same red family, QA stays amber', () => {
    const focus = src('components/FocusPage.tsx')
    expect(focus).toMatch(/'blocked': \{ bg: 'var\(--status-red-bg\)'/)
    expect(focus).toMatch(/'qa': \{ bg: 'var\(--status-yellow-bg\)'/)
  })
})
