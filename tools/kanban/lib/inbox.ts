// P1317: the deferred-work inbox parser — ONE parser, shared by the board
// (server/inbox.ts) and the CLI the skills call (scripts/inbox-cli.ts), so the
// board and /note, /weekly, /prioritize can never disagree about what an entry is.
//
// Store format (the header of docs/process-learnings.md documents it for humans):
//   - an entry is a column-1 `## ` heading outside a code fence, up to the next one
//   - it is OPEN only when its single bold `**Status:**` line is exactly `proposed`
//   - it carries one bold `**ID:**` line: `INBOX-<n>` (public) or `INBOX-P<n>` (private)
//   - the preamble (before the first entry) carries a bold `**Next ID:** <n>` counter
// Anything else is UNPARSEABLE and is still returned — never dropped. There is no
// "closed" state: closing an entry means deleting it.
//
// PRIVACY: nothing in this module logs. `reasons` is a fixed vocabulary that never
// quotes file content, so a caller may log `path:line (reasons)` safely.

export type InboxKind = 'public' | 'private'

export type UnparseableReason =
  | 'missing-status'
  | 'empty-status'
  | 'status-not-proposed'
  | 'multiple-status-lines'
  | 'missing-id'
  | 'malformed-id'
  | 'multiple-id-lines'
  | 'duplicate-id'

export interface InboxSection {
  /** 1-based line of the `## ` heading */
  line: number
  /** 1-based line of the last line that belongs to this section */
  endLine: number
  title: string
  /** the ID token, when exactly one well-formed ID line for this store is present */
  id?: string
  state: 'open' | 'unparseable'
  reasons: UnparseableReason[]
  /** bold `**due:**` value; `week` when absent (absent means week, per the store header) */
  due: string
  dueExplicit: boolean
}

export interface ParsedStore {
  kind: InboxKind
  sections: InboxSection[]
  /** value of the preamble `**Next ID:**` line; null when absent or not a number */
  nextId: number | null
  /** 1-based line of the preamble `**Next ID:**` line; null when absent */
  nextIdLine: number | null
  /** highest numeric ID among well-formed IDs (0 when there are none) */
  maxId: number
}

const HEADING = /^## (.+)$/
const FENCE = /^ {0,3}(```|~~~)/
const STATUS = /^\*\*Status:\*\*(.*)$/
const ID_LINE = /^\*\*ID:\*\*(.*)$/
const DUE = /^\*\*due:\*\*\s*(\S*)/
const NEXT_ID = /^\*\*Next ID:\*\*\s*(\S*)\s*$/

export function idPattern(kind: InboxKind): RegExp {
  return kind === 'public' ? /^INBOX-(\d+)$/ : /^INBOX-P(\d+)$/
}

export function formatId(kind: InboxKind, n: number): string {
  return kind === 'public' ? `INBOX-${n}` : `INBOX-P${n}`
}

/** The store an ID token belongs to, or null when it is neither shape. */
export function kindOfId(token: string): InboxKind | null {
  if (/^INBOX-P\d+$/.test(token)) return 'private'
  if (/^INBOX-\d+$/.test(token)) return 'public'
  return null
}

/** Splits into lines and marks each line that is a fence delimiter or sits inside a fence. */
export function scanLines(text: string): { lines: string[]; fenced: boolean[] } {
  const lines = text.split('\n')
  const fenced: boolean[] = []
  let inFence = false
  for (const l of lines) {
    if (FENCE.test(l)) {
      fenced.push(true)
      inFence = !inFence
    } else {
      fenced.push(inFence)
    }
  }
  return { lines, fenced }
}

interface RawSection {
  line: number
  endLine: number
  title: string
  statuses: string[]
  ids: string[]
  due?: string
}

export function parseStore(text: string, kind: InboxKind): ParsedStore {
  const { lines, fenced } = scanLines(text)
  const pattern = idPattern(kind)

  let nextId: number | null = null
  let nextIdLine: number | null = null
  const raw: RawSection[] = []
  let current: RawSection | null = null

  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue
    const l = lines[i]
    const h = l.match(HEADING)
    if (h) {
      if (current) current.endLine = i // 1-based number of the line above this heading
      current = { line: i + 1, endLine: lines.length, title: h[1].trim(), statuses: [], ids: [] }
      raw.push(current)
      continue
    }
    if (!current) {
      const n = l.match(NEXT_ID)
      if (n && nextIdLine === null) {
        nextIdLine = i + 1
        nextId = /^\d+$/.test(n[1]) ? Number(n[1]) : null
      }
      continue
    }
    const s = l.match(STATUS)
    if (s) { current.statuses.push(s[1].trim()); continue }
    const id = l.match(ID_LINE)
    if (id) { current.ids.push(id[1].trim()); continue }
    const d = l.match(DUE)
    if (d && current.due === undefined) current.due = d[1]
  }

  const idCounts = new Map<string, number>()
  for (const r of raw) {
    if (r.ids.length === 1 && pattern.test(r.ids[0])) {
      idCounts.set(r.ids[0], (idCounts.get(r.ids[0]) ?? 0) + 1)
    }
  }

  let maxId = 0
  const sections: InboxSection[] = raw.map((r) => {
    const reasons: UnparseableReason[] = []
    if (r.statuses.length === 0) reasons.push('missing-status')
    else if (r.statuses.length > 1) reasons.push('multiple-status-lines')
    else if (r.statuses[0] === '') reasons.push('empty-status')
    else if (r.statuses[0] !== 'proposed') reasons.push('status-not-proposed')

    let id: string | undefined
    if (r.ids.length === 0) reasons.push('missing-id')
    else if (r.ids.length > 1) reasons.push('multiple-id-lines')
    else if (!pattern.test(r.ids[0])) reasons.push('malformed-id')
    else {
      id = r.ids[0]
      const num = id.match(pattern)?.[1]
      if (num !== undefined) maxId = Math.max(maxId, Number(num))
      if ((idCounts.get(id) ?? 0) > 1) reasons.push('duplicate-id')
    }

    return {
      line: r.line,
      endLine: r.endLine,
      title: r.title,
      id,
      state: reasons.length === 0 ? 'open' : 'unparseable',
      reasons,
      due: r.due ? r.due : 'week',
      dueExplicit: !!r.due,
    }
  })

  return { kind, sections, nextId, nextIdLine, maxId }
}

/** Sections carrying exactly this well-formed ID (0, 1, or several on a duplicate). */
export function findById(store: ParsedStore, id: string): InboxSection[] {
  return store.sections.filter((s) => s.id === id)
}

export function countStates(store: ParsedStore): { open: number; unparseable: number } {
  let open = 0
  for (const s of store.sections) if (s.state === 'open') open++
  return { open, unparseable: store.sections.length - open }
}
