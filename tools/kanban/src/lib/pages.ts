import type { PageId } from '../components/Sidebar'

export const DEFAULT_PAGE: PageId = 'board'

// A stored page preference is trusted only if it names a page this board shows right now.
// Anything else (a page since removed, a page this embedder hides, junk) falls back to the
// default instead of rendering an empty shell.
export function resolveStoredPage(stored: string | null, visible: ReadonlySet<string>): PageId {
  return stored !== null && visible.has(stored) ? (stored as PageId) : DEFAULT_PAGE
}
