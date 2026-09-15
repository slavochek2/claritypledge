// P1317: inbox cards for the board — read-only, parsed at request time.
//
// Enable setting (recorded in the P1317 spec): the inbox is ON when the server runs
// with no KANBAN_PROJECT_ROOT — that is cp, launched via scripts/kanban.sh or
// `npm run kanban`, neither of which sets it — and OFF when KANBAN_PROJECT_ROOT is
// set, which is how pp embeds this codebase. KANBAN_INBOX=on|off overrides both.
//
// Stores always resolve against the MAIN checkout (git common dir), never the
// directory the server was launched from: a worktree copy of the public store is
// stale by definition, and a worktree has no .private/ at all.
//
// PRIVACY: nothing derived from a store's content is logged. Logs carry a path,
// a line number and a fixed-vocabulary reason only.

import type { Express, Response } from 'express'
import { readFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { basename, dirname, join } from 'path'
import { parseStore, findById, countStates, kindOfId, type InboxKind, type InboxSection } from '../lib/inbox'

export const INBOX_STORES: { kind: InboxKind; rel: string }[] = [
  { kind: 'public', rel: join('docs', 'process-learnings.md') },
  { kind: 'private', rel: join('.private', 'docs', 'process-learnings.md') },
]

/** Store path relative to the main checkout. */
export function storeRel(kind: InboxKind): string {
  return kind === 'public' ? INBOX_STORES[0].rel : INBOX_STORES[1].rel
}

// Read at request time (not module load) so tests and embedders can flip them.
export function inboxEnabled(): boolean {
  if (process.env.KANBAN_INBOX === 'off') return false
  if (process.env.KANBAN_INBOX === 'on') return true
  // `=== undefined`, not falsiness: an embedder that exports KANBAN_PROJECT_ROOT="" has
  // still declared itself an embedder, and must not get cp's inbox (Gemini review of P1317).
  return process.env.KANBAN_PROJECT_ROOT === undefined
}

/** The main checkout that owns `projectRoot`, or null when it cannot be proven. */
export function resolveInboxRoot(projectRoot: string): string | null {
  if (process.env.KANBAN_INBOX_ROOT) return process.env.KANBAN_INBOX_ROOT
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    // A normal repository's common dir is <main checkout>/.git. Anything else (a bare
    // repo, a submodule's modules/ dir) has no main checkout we can name, so refuse
    // rather than guess — guessing is how a worktree's stale copy gets read.
    return basename(common) === '.git' ? dirname(common) : null
  } catch {
    return null
  }
}

export interface InboxCard {
  /** what the open endpoint accepts: the ID for an open entry, `<kind>:L<line>` otherwise */
  key: string
  kind: InboxKind
  id?: string
  line: number
  title: string
  state: 'open' | 'unparseable'
  reasons: string[]
  due: string
  dueExplicit: boolean
}

export interface InboxStoreView {
  kind: InboxKind
  state: 'present' | 'absent' | 'error'
  open?: number
  unparseable?: number
  nextId?: number | null
  /** the counter is not above the highest ID in the file — /note must raise it */
  counterBehind?: boolean
  entries: InboxCard[]
}

type LoadedStore =
  | { kind: InboxKind; path: string; state: 'present'; text: string }
  | { kind: InboxKind; path: string | null; state: 'absent' | 'error' }

function loadStore(root: string | null, kind: InboxKind): LoadedStore {
  const rel = storeRel(kind)
  if (!root) {
    console.error(`[kanban] inbox: cannot resolve the main checkout; ${kind} store not read`)
    return { kind, path: null, state: 'error' }
  }
  const path = join(root, rel)
  try {
    return { kind, path, state: 'present', text: readFileSync(path, 'utf-8') }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code ?? 'unknown'
    if (code === 'ENOENT') return { kind, path, state: 'absent' }
    console.error(`[kanban] inbox: store unreadable: ${path} (${code})`)
    return { kind, path, state: 'error' }
  }
}

function cardKey(kind: InboxKind, s: InboxSection): string {
  return s.state === 'open' && s.id ? s.id : `${kind}:L${s.line}`
}

export function readInbox(projectRoot: string): { enabled: false } | { enabled: true; stores: InboxStoreView[] } {
  if (!inboxEnabled()) return { enabled: false }
  const root = resolveInboxRoot(projectRoot)
  const stores = INBOX_STORES.map(({ kind }): InboxStoreView => {
    const loaded = loadStore(root, kind)
    if (loaded.state !== 'present') return { kind, state: loaded.state, entries: [] }
    const parsed = parseStore(loaded.text, kind)
    for (const s of parsed.sections) {
      if (s.state === 'unparseable') {
        console.warn(`[kanban] inbox: unparseable entry at ${loaded.path}:${s.line} (${s.reasons.join(',')})`)
      }
    }
    const { open, unparseable } = countStates(parsed)
    return {
      kind,
      state: 'present',
      open,
      unparseable,
      nextId: parsed.nextId,
      counterBehind: parsed.nextId === null || parsed.nextId <= parsed.maxId,
      entries: parsed.sections.map((s) => ({
        key: cardKey(kind, s),
        kind,
        id: s.id,
        line: s.line,
        title: s.title,
        state: s.state,
        reasons: s.reasons,
        due: s.due,
        dueExplicit: s.dueExplicit,
      })),
    }
  })
  return { enabled: true, stores }
}

const LINE_KEY = /^(public|private):L(\d+)$/

export function registerInboxRoutes(
  app: Express,
  projectRoot: string,
  openInEditor: (target: string, res: Response) => void,
) {
  app.get('/api/inbox', (_req, res) => {
    try {
      res.json(readInbox(projectRoot))
    } catch {
      // Never log the error object: it could carry file content.
      console.error('[kanban] GET /api/inbox failed')
      res.status(500).json({ error: 'Failed to read inbox' })
    }
  })

  // Accepts ONLY an entry key — never a path. The server resolves the canonical
  // store and the heading line itself; the generic /api/open allowlist is untouched.
  app.post('/api/inbox/open', (req, res) => {
    if (!inboxEnabled()) return res.status(404).json({ error: 'Inbox is not enabled' })
    const key = req.body?.id
    if (typeof key !== 'string') return res.status(400).json({ error: 'id required' })

    const lineKey = key.match(LINE_KEY)
    const kind: InboxKind | null = lineKey ? (lineKey[1] as InboxKind) : kindOfId(key)
    if (!kind) return res.status(400).json({ error: 'Not an inbox entry ID' })

    const loaded = loadStore(resolveInboxRoot(projectRoot), kind)
    if (loaded.state !== 'present') return res.status(404).json({ error: `The ${kind} store is ${loaded.state}` })
    const parsed = parseStore(loaded.text, kind)

    let section: InboxSection | undefined
    if (lineKey) {
      section = parsed.sections.find((s) => s.line === Number(lineKey[2]))
    } else {
      const hits = findById(parsed, key)
      if (hits.length > 1) return res.status(409).json({ error: 'Duplicate entry ID — fix the store' })
      section = hits[0]
    }
    if (!section) return res.status(404).json({ error: 'Unknown entry' })

    if (process.env.KANBAN_OPEN_DRY_RUN === 'true') {
      return res.json({ success: true, dryRun: true, kind, line: section.line })
    }
    openInEditor(`${loaded.path}:${section.line}`, res)
  })
}
