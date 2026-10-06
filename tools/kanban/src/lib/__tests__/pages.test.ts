import { describe, it, expect } from 'vitest'
import { resolveStoredPage } from '../pages'

// The board's visible pages, as App derives them from the page list + the embedder's config.
const VISIBLE = new Set(['board', 'focus', 'content', 'pipeline'])

describe('resolveStoredPage', () => {
  it('keeps a stored page that is visible', () => {
    expect(resolveStoredPage('focus', VISIBLE)).toBe('focus')
  })

  it("falls back to the default for a stored 'goals' (the page was deleted)", () => {
    expect(resolveStoredPage('goals', VISIBLE)).toBe('board')
  })

  it('falls back for a page this embedder hides', () => {
    expect(resolveStoredPage('content', new Set(['board', 'focus']))).toBe('board')
  })

  it('falls back for nothing stored and for junk', () => {
    expect(resolveStoredPage(null, VISIBLE)).toBe('board')
    expect(resolveStoredPage('', VISIBLE)).toBe('board')
    expect(resolveStoredPage('__proto__', VISIBLE)).toBe('board')
  })
})
