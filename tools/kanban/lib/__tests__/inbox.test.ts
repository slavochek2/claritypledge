import { describe, it, expect } from 'vitest'
import { parseStore, countStates, findById, kindOfId } from '../inbox'

/**
 * P1317 — coverage oracle for the inbox parser.
 *
 * The expected values below are HAND-LABELLED from reading the fixture, one line
 * per section, and are deliberately not derived from any regex the parser uses
 * (epistemic gates 7, 7b). If you change the fixture, re-label by reading it.
 */

const F = '```'

const PUBLIC_FIXTURE = [
  '# Process Learnings',
  '',
  'Prose that mentions **Status:** proposed mid-line is not a field.',
  '',
  '**Next ID:** 9',
  '',
  F + 'bash',
  "grep -c '^\\*\\*Status:\\*\\* proposed' docs/process-learnings.md",
  F,
  '',
  '---',
  '',
  '## A exact proposed',
  '',
  '**ID:** INBOX-1',
  '**Status:** proposed',
  '**due:** month',
  '',
  '## B typo propose',
  '',
  '**ID:** INBOX-2',
  '**Status:** propose',
  '',
  '## C empty status',
  '',
  '**ID:** INBOX-3',
  '**Status:**',
  '',
  '## D unbolded status',
  '',
  '**ID:** INBOX-4',
  'Status: proposed',
  '',
  '## E missing status',
  '',
  '**ID:** INBOX-5',
  '',
  '## F unbolded due, with a fenced heading inside',
  '',
  '**ID:** INBOX-6',
  '**Status:** proposed',
  'due: month',
  '',
  F + 'md',
  '## G heading inside a fence is not an entry',
  '**Status:** proposed',
  F,
  '',
  '## H status only inside a fence',
  '',
  '**ID:** INBOX-7',
  F,
  '**Status:** proposed',
  F,
  '',
  '## I duplicate ID, first',
  '',
  '**ID:** INBOX-8',
  '**Status:** proposed',
  '',
  '## J duplicate ID, second',
  '',
  '**ID:** INBOX-8',
  '**Status:** proposed',
  '',
  '## K no ID',
  '',
  '**Status:** proposed',
  '',
  '## L filed, ID above the counter',
  '',
  '**ID:** INBOX-10',
  '**Status:** filed as p1',
  '',
].join('\n')

// Hand label: title prefix → [state, due]
const LABEL: Record<string, ['open' | 'unparseable', string]> = {
  A: ['open', 'month'],
  B: ['unparseable', 'week'],
  C: ['unparseable', 'week'],
  D: ['unparseable', 'week'],
  E: ['unparseable', 'week'],
  F: ['open', 'week'],
  H: ['unparseable', 'week'],
  I: ['unparseable', 'week'],
  J: ['unparseable', 'week'],
  K: ['unparseable', 'week'],
  L: ['unparseable', 'week'],
}
const EXPECTED_SECTIONS = 11 // A B C D E F H I J K L — G is inside a fence
const EXPECTED_OPEN = 2 // A, F
const EXPECTED_UNPARSEABLE = 9

describe('P1317 inbox parser — hand-labelled oracle', () => {
  const store = parseStore(PUBLIC_FIXTURE, 'public')

  it('finds every section and no fenced heading', () => {
    expect(store.sections.map((s) => s.title[0]).join('')).toBe('ABCDEFHIJKL')
    expect(store.sections).toHaveLength(EXPECTED_SECTIONS)
  })

  it('open and unparseable counts match the hand label', () => {
    expect(countStates(store)).toEqual({ open: EXPECTED_OPEN, unparseable: EXPECTED_UNPARSEABLE })
  })

  it('classifies each section exactly as labelled', () => {
    for (const s of store.sections) {
      const [state, due] = LABEL[s.title[0]]
      expect({ title: s.title, state: s.state, due: s.due }).toEqual({ title: s.title, state, due })
    }
  })

  it('names the specific defect of each unparseable section', () => {
    const r = Object.fromEntries(store.sections.map((s) => [s.title[0], s.reasons]))
    expect(r.B).toEqual(['status-not-proposed'])
    expect(r.C).toEqual(['empty-status'])
    expect(r.D).toEqual(['missing-status'])
    expect(r.E).toEqual(['missing-status'])
    expect(r.H).toEqual(['missing-status'])
    expect(r.I).toEqual(['duplicate-id'])
    expect(r.J).toEqual(['duplicate-id'])
    expect(r.K).toEqual(['missing-id'])
    expect(r.L).toEqual(['status-not-proposed'])
  })

  it('an unbolded due: is not read (the entry stays weekly)', () => {
    const f = store.sections.find((s) => s.title.startsWith('F'))!
    expect(f.dueExplicit).toBe(false)
  })

  it('reads the counter, the max ID, and heading/end lines', () => {
    expect(store.nextId).toBe(9)
    expect(store.nextIdLine).toBe(5)
    expect(store.maxId).toBe(10) // counter is behind a hand-written ID
    const a = store.sections[0]
    expect(a.line).toBe(13)
    expect(a.endLine).toBe(18)
  })

  it('a duplicate ID resolves to both sections, so nothing can target one of them', () => {
    expect(findById(store, 'INBOX-8')).toHaveLength(2)
    expect(findById(store, 'INBOX-1')).toHaveLength(1)
    expect(findById(store, 'INBOX-99')).toHaveLength(0)
  })
})

describe('P1317 inbox parser — fence and comment edge cases (review findings)', () => {
  // Hand label: A, B, D, E are entries and all four are open. C sits inside a closed
  // multi-line HTML comment and is not an entry. The `~~~` inside A's backtick block must
  // not close it, and D's trailing unterminated fence must not hide E.
  const EDGE = [
    '# S',
    '',
    '## A backtick block containing a tilde line',
    '**ID:** INBOX-1',
    '**Status:** proposed',
    '',
    F,
    '~~~ not a closer',
    '## not a heading, still inside the backtick block',
    F,
    '',
    '## B after the block',
    '**ID:** INBOX-2',
    '**Status:** proposed',
    '',
    '<!--',
    '## C inside a comment',
    '**ID:** INBOX-3',
    '**Status:** proposed',
    '-->',
    '',
    '## D followed by an unterminated fence',
    '**ID:** INBOX-4',
    '**Status:** proposed',
    F,
    '## E after the unterminated fence',
    '**ID:** INBOX-5',
    '**Status:** proposed',
    '',
  ]

  it('drops nothing and admits no commented or fenced heading', () => {
    const s = parseStore(EDGE.join('\n'), 'public')
    expect(s.sections.map((x) => `${x.title[0]}:${x.state}`)).toEqual(['A:open', 'B:open', 'D:open', 'E:open'])
  })

  it('reads a CRLF store identically', () => {
    const s = parseStore(EDGE.join('\r\n'), 'public')
    expect(s.sections.map((x) => `${x.title[0]}:${x.state}`)).toEqual(['A:open', 'B:open', 'D:open', 'E:open'])
    expect(s.sections.map((x) => x.id)).toEqual(['INBOX-1', 'INBOX-2', 'INBOX-4', 'INBOX-5'])
  })

  it('a 4-backtick fence is not closed by 3 backticks', () => {
    const text = ['## X', '**ID:** INBOX-1', '**Status:** proposed', '````', F, '## hidden', '````', '## Y', '**ID:** INBOX-2', '**Status:** proposed'].join('\n')
    expect(parseStore(text, 'public').sections.map((x) => x.title)).toEqual(['X', 'Y'])
  })
})

describe('P1317 inbox parser — private store IDs', () => {
  const text = [
    '# Private',
    '**Next ID:** 4',
    '## ok',
    '**ID:** INBOX-P3',
    '**Status:** proposed',
    '## public-shaped ID in the private store',
    '**ID:** INBOX-3',
    '**Status:** proposed',
  ].join('\n')

  it('accepts INBOX-P<n> and rejects the public shape', () => {
    const store = parseStore(text, 'private')
    expect(store.sections.map((s) => s.state)).toEqual(['open', 'unparseable'])
    expect(store.sections[1].reasons).toEqual(['malformed-id'])
    expect(store.maxId).toBe(3)
  })

  it('kindOfId routes tokens to their store', () => {
    expect(kindOfId('INBOX-12')).toBe('public')
    expect(kindOfId('INBOX-P7')).toBe('private')
    expect(kindOfId('INBOX-')).toBeNull()
    expect(kindOfId('NOTE-1')).toBeNull()
  })
})
