// P1399: the Day page shell — tabs, the day switcher, warnings, and the sticky bottom bar
// (pager · progress · Start fixing). Spec §3 and §7 are the contract.
//
// Writes (rule 5): picking an option, "Accept & next" / "Accept" (P1432: written at once, like a
// pick), rating, a story (on blur, if changed), a budget raise or undo, a connection Fix, the custom
// answer's text (on blur), Bring back, and the batch on Start fixing / copy (the unanswered agent
// work). Paging NEVER writes and never accepts: Previous, Next, ← and → only move.
//
// PRIVACY: report content lives only in React state. Nothing is put in localStorage or
// sessionStorage, and nothing is logged.

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { OWN, PARK, isAgentWork, pendingPreselected, stillYours, type ConnectionView, type DayView, type DecisionInput, type IssueView } from '../../lib/day'
import { copyText, dayLabel, getIndex, getPrompt, getRun, HttpError, postDecisions, startRun, type DayIndex, type RunPayload } from './api'
import { DailyReport } from './DailyReport'
import { MonitoringTab } from './MonitoringTab'
import { ReflectionTab } from './ReflectionTab'
import { cycle, DEFAULT_POS, sideOf } from './positions'
import { StatsTab } from './StatsTab'
import './day.css'

type Tab = 'report' | 'stats' | 'monitoring' | 'reflection'
const TABS: [Tab, string][] = [
  ['report', 'Daily report'],
  ['stats', 'Stats'],
  ['monitoring', 'Monitoring'],
  ['reflection', 'Reflection'],
]

/** Below ~420px of page width the tabs keep one row with these. */
const SHORT_TAB: Record<Tab, string> = { report: 'Report', stats: 'Stats', monitoring: 'Monitor', reflection: 'Reflect' }

/** "08:12" in the founder's local time. */
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

const isFree = (id: string | undefined): id is typeof OWN => id === OWN
type WriteResult = { ok: true } | { ok: false; status: number; message: string }

/** True when a key press is typing, so ← → and 1–9 must be left alone. */
function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || el.closest('[contenteditable=""],[contenteditable="true"]')) return true
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLInputElement) return !['radio', 'checkbox', 'button', 'submit', 'reset'].includes(el.type)
  return false
}

const CopyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

export function DayPage() {
  const [index, setIndex] = useState<DayIndex | null>(null)
  const [indexErr, setIndexErr] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [run, setRun] = useState<RunPayload | null>(null)
  const [runErr, setRunErr] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('report')
  /** where the pager is in each set: the founder's cards, and the agent work after Review */
  const [idx, setIdx] = useState({ yours: 0, agent: 0 })
  const [agentMode, setAgentMode] = useState(false)
  // read by an Accept whose save finished after the founder moved on
  const idxRef = useRef(idx)
  idxRef.current = idx
  const agentModeRef = useRef(agentMode)
  agentModeRef.current = agentMode
  const [reflIdx, setReflIdx] = useState(0)
  const [ownFocus, setOwnFocus] = useState(0)
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<{ text: string; action?: { label: string; run: () => void } } | null>(null)
  const [busy, setBusy] = useState(false)
  /** Start fixing request in flight (the server waits for Claude to acknowledge, up to ~20s). What
   *  was sent is the server's to say: the bar reads `lastSentAt` / `collectedCount` from the run. */
  const [opening, setOpening] = useState(false)
  /** set when a newer run appeared while this page was open */
  const [newerId, setNewerId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const stories = useRef<Record<string, string>>({})
  const toastTimer = useRef<number>()
  // The selected run, readable from async callbacks: a response for any other run is dropped.
  const runIdRef = useRef<string | null>(null)
  runIdRef.current = runId
  const latestRef = useRef<string | null>(null)

  const say = useCallback((text: string, action?: { label: string; run: () => void }) => {
    setToast({ text, action })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 8000 : 3000)
  }, [])

  // ---- loading -------------------------------------------------------------------------

  useEffect(() => {
    getIndex()
      .then((ix) => {
        setIndex(ix)
        if (ix.enabled) {
          latestRef.current = ix.latestId ?? ix.runs[0]?.id ?? null
          setRunId(latestRef.current)
        }
      })
      .catch((e: Error) => setIndexErr(e.message))
  }, [])

  /** Re-read the run list; if the latest run is not the one on screen, offer to open it. */
  const checkNewer = useCallback(async () => {
    try {
      const ix = await getIndex()
      setIndex(ix)
      if (!ix.enabled) return
      const latest = ix.latestId ?? ix.runs[0]?.id ?? null
      const wasLatest = latestRef.current
      latestRef.current = latest
      if (latest && latest !== wasLatest && runIdRef.current === wasLatest) setNewerId(latest)
    } catch {
      // the next action will try again
    }
  }, [])

  const reload = useCallback(
    async (id: string) => {
      try {
        const r = await getRun(id)
        if (runIdRef.current !== id) return null // the founder already switched runs
        setRun(r)
        setRunErr(null)
        if (!r.isLatest && id === latestRef.current) void checkNewer()
        return r
      } catch (e) {
        if (runIdRef.current === id) setRunErr((e as Error).message)
        return null
      }
    },
    [checkNewer],
  )

  useEffect(() => {
    if (!runId) return
    setRun(null)
    setIdx({ yours: 0, agent: 0 })
    setAgentMode(false)
    setReflIdx(0)
    setChoice({})
    setDrafts({})
    setOpening(false)
    stories.current = {}
    void reload(runId)
  }, [runId, reload])

  const ok = run?.kind === 'ok' ? run : null
  const view: DayView | null = ok?.view ?? null
  const readOnly = !ok || !ok.isLatest
  const everyIssue = useMemo(() => view?.issues ?? [], [view])
  /** Phase D: the pager walks the founder's cards; agent work is one line away (Review). With no founder cards it opens on the agent work. */
  const yours = useMemo(() => everyIssue.filter((i) => !isAgentWork(i)), [everyIssue])
  const agentCards = useMemo(() => everyIssue.filter(isAgentWork), [everyIssue])
  const mode: 'yours' | 'agent' = (agentMode && agentCards.length > 0) || yours.length === 0 ? 'agent' : 'yours'
  const issues = mode === 'agent' ? agentCards : yours
  const issueIdx = idx[mode]
  const setIssueIdx = useCallback((i: number) => setIdx((s) => ({ ...s, [mode]: i })), [mode])
  const statements = ok?.report.reflection?.statements ?? []

  useEffect(() => {
    if (issueIdx > 0 && issueIdx >= issues.length) setIssueIdx(Math.max(0, issues.length - 1))
  }, [issues.length, issueIdx, setIssueIdx])

  // ---- writes ---------------------------------------------------------------------------

  /** Writes go one at a time, in click order, each followed by a re-read of the run. */
  const write = useCallback(
    (ds: DecisionInput[], opts: { quiet?: boolean } = {}): Promise<WriteResult> => {
      if (!runId || !ds.length) return Promise.resolve({ ok: true })
      const id = runId
      const next = chain.current.then(
        async (): Promise<WriteResult> => {
          try {
            await postDecisions(id, ds)
            await reload(id)
            return { ok: true }
          } catch (e) {
            const status = e instanceof HttpError ? e.status : 0
            if (!opts.quiet) say(`Not saved: ${(e as Error).message}`)
            setChoice((c) => Object.fromEntries(Object.entries(c).filter(([, v]) => isFree(v))))
            if (status === 409) await checkNewer()
            await reload(id)
            return { ok: false, status, message: (e as Error).message }
          }
        },
      )
      chain.current = next
      return next
    },
    [runId, reload, say, checkNewer],
  )

  /** An earlier run shows only what was decided on it; the latest run preselects the recommendation. */
  const selected = useCallback(
    (i: IssueView) =>
      readOnly ? i.decision?.option_id ?? '' : choice[i.fp] ?? i.decision?.option_id ?? i.options[i.recommended_index]?.id ?? '',
    [choice, readOnly],
  )

  /** The custom answer picked but no text yet: not an answer. */
  const freeEmpty = useCallback(
    (i: IssueView): boolean => {
      if (!isFree(choice[i.fp])) return false
      return !(drafts[i.fp] ?? (i.decision?.option_id === OWN ? i.decision.text ?? '' : '')).trim()
    },
    [choice, drafts],
  )

  const draftOf = useCallback((i: IssueView) => drafts[i.fp] ?? (i.decision?.option_id === OWN ? i.decision.text ?? '' : ''), [drafts])

  const choose = useCallback(
    (i: IssueView, optionId: string) => {
      if (readOnly) return
      setChoice((c) => ({ ...c, [i.fp]: optionId }))
      if (isFree(optionId)) setOwnFocus((n) => n + 1)
      else void write([{ kind: 'option', target: i.fp, option_id: optionId }])
    },
    [readOnly, write],
  )

  /** Custom-answer text not yet in the file (never a custom answer without text). */
  const unsavedFree = useCallback(
    (v: DayView): DecisionInput[] =>
      v.issues.flatMap((i) => {
        if (!isFree(choice[i.fp])) return []
        const text = (drafts[i.fp] ?? '').trim()
        if (!text || (i.decision?.option_id === OWN && i.decision.text === text)) return []
        return [{ kind: 'option' as const, target: i.fp, option_id: OWN, text }]
      }),
    [choice, drafts],
  )

  const draftBlur = useCallback(
    (i: IssueView) => {
      if (!view || readOnly) return
      void write(unsavedFree({ ...view, issues: [i] }))
    },
    [view, readOnly, unsavedFree, write],
  )

  const fix = useCallback((c: ConnectionView) => void write([{ kind: 'connection', target: c.id }]), [write])
  const undoFix = useCallback((c: ConnectionView) => void write([{ kind: 'connection', target: c.id, remove: true }]), [write])
  const bringBack = useCallback((fp: string) => void write([{ kind: 'option', target: fp, remove: true }]), [write])
  const raise = useCallback(
    async (target: string, amount: number): Promise<string | null> => {
      const r = await write([{ kind: 'budget', target, amount, scope: 'monthly' }], { quiet: true })
      if (r.ok) {
        say('Added to Start fixing')
        return null
      }
      return r.status === 409 ? 'conflict' : `Not saved: ${r.message}`
    },
    [write, say],
  )
  const undoRaise = useCallback((target: string) => void write([{ kind: 'budget', target, remove: true }]), [write])

  const storyOf = useCallback((id: string) => stories.current[id] ?? view?.reflection[id]?.story ?? '', [view])
  const setPosition = useCallback(
    (id: string, position: number) => {
      if (readOnly) return
      const story = storyOf(id)
      void write([{ kind: 'reflection', target: id, position, ...(story ? { story } : {}) }])
    },
    [readOnly, storyOf, write],
  )
  const removePosition = useCallback((id: string) => void write([{ kind: 'reflection', target: id, remove: true }]), [write])
  const setStory = useCallback(
    (id: string, story: string) => {
      const pos = view?.reflection[id]?.position
      if (readOnly || typeof pos !== 'number') return
      stories.current[id] = story
      void write([{ kind: 'reflection', target: id, position: pos, ...(story ? { story } : {}) }])
    },
    [readOnly, view, write],
  )

  // ---- what Start fixing sends (decision 1B) --------------------------------------------

  /** Open the card for a fingerprint, in whichever set it belongs to. */
  const jumpTo = useCallback(
    (fp: string) => {
      const a = agentCards.findIndex((x) => x.fp === fp)
      const y = yours.findIndex((x) => x.fp === fp)
      if (y >= 0) {
        setAgentMode(false)
        setIdx((s) => ({ ...s, yours: y }))
      } else if (a >= 0) {
        setAgentMode(true)
        setIdx((s) => ({ ...s, agent: a }))
      }
      setTab('report')
    },
    [agentCards, yours],
  )

  /** The founder's answer is on the page but not in the file yet: typed text, or a pick still being written. */
  const queuedLocally = useCallback(
    (i: IssueView) => {
      if (i.decision || isAgentWork(i)) return false
      const kind = choice[i.fp]
      if (isFree(kind)) return !!(drafts[i.fp] ?? '').trim()
      return kind !== undefined && kind !== PARK
    },
    [choice, drafts],
  )
  /** The button counts what will actually be sent: the server's count + what is only on the page. */
  const sendCount = (ok?.collectedCount ?? 0) + (view ? view.issues.filter(queuedLocally).length : 0)
  /** Unopened founder choices: not sent, listed as "still yours". */
  const yoursLeft = view ? stillYours(view).filter((i) => !queuedLocally(i)) : []

  // ---- Start fixing / copy (rule 3) -------------------------------------------------------

  const startRef = useRef<(mode: 'start' | 'copy') => Promise<void>>(async () => {})
  const startFixing = useCallback(
    async (mode: 'start' | 'copy') => {
      if (!runId || readOnly || busy || !view) return
      // A custom answer with no text is not an answer: send the founder back to it.
      const empty = view.issues.find((i) => freeEmpty(i))
      if (empty) {
        say('Write your answer or question first, or pick another answer')
        jumpTo(empty.fp)
        return
      }
      setBusy(true)
      try {
        await chain.current
        const fresh = await getRun(runId)
        if (fresh.kind !== 'ok' || !fresh.isLatest) {
          void checkNewer()
          throw new Error('a newer run is here')
        }
        const free = unsavedFree(fresh.view)
        const freeFps = new Set(Object.entries(choice).filter(([, v]) => isFree(v)).map(([fp]) => fp))
        const preselected = pendingPreselected(fresh.view).filter((d) => !freeFps.has(d.target))
        const batch = [...free, ...preselected]
        if (batch.length) await postDecisions(runId, batch)
        if (mode === 'copy') {
          await copyText((await getPrompt()).prompt)
          say('Prompt copied')
          return
        }
        setOpening(true)
        const r = await startRun(runId)
        // Never auto-copy here: by now focus may be in the terminal and the copy can fail silently.
        const copy = { label: 'Copy', run: () => void startRef.current('copy') }
        if (r.status === 200 && r.body.launched) {
          const n = r.body.count ?? 0
          say(
            r.body.followUp
              ? `Sent ${n} change${n === 1 ? '' : 's'} to a new terminal ${r.body.how === 'window' ? 'window' : 'tab'}`
              : r.body.how === 'window'
                ? 'Opened a new window in your terminal'
                : 'Opened a new tab in your terminal',
          )
        } else if (r.status === 429) say('A session is opening, or one started less than a minute ago.', copy)
        else if (r.status === 409 && r.body.reason === 'already-sent') say('Already sent to your terminal; nothing has changed since.', copy)
        else if (r.status === 502) say('Couldn’t start a session in the terminal.', copy)
        else {
          if (r.status === 409 && r.body.reason === 'not-latest') void checkNewer()
          say(`Couldn’t start: ${r.body.error ?? `request failed (${r.status})`}`)
        }
      } catch (e) {
        if (e instanceof HttpError && e.status === 409) void checkNewer()
        say(`${mode === 'copy' ? 'Couldn’t copy' : 'Couldn’t start'}: ${(e as Error).message}`)
      } finally {
        setOpening(false)
        setBusy(false)
        await reload(runId)
      }
    },
    [runId, readOnly, busy, view, freeEmpty, unsavedFree, choice, jumpTo, reload, say, checkNewer],
  )
  startRef.current = startFixing

  // ---- paging (never writes) -------------------------------------------------------------

  const toTop = () => {
    const sc = rootRef.current?.parentElement
    const top = rootRef.current?.querySelector('.d-main')
    if (sc && top && top.getBoundingClientRect().top < sc.getBoundingClientRect().top) sc.scrollTop = 0
  }
  const nav = useMemo(
    () =>
      tab === 'report' && issues.length
        ? { i: Math.min(issueIdx, issues.length - 1), n: issues.length, lab: mode === 'agent' ? 'agent card' : 'issue' }
        : tab === 'reflection' && statements.length
          ? { i: Math.min(reflIdx, statements.length - 1), n: statements.length, lab: 'statement' }
          : null,
    [tab, issues.length, issueIdx, reflIdx, statements.length, mode],
  )

  /** The current card is an unanswered founder choice whose recommendation is not Park: Accept is offered. */
  const accepting = useMemo(() => {
    const cur = tab === 'report' && !readOnly && mode !== 'agent' ? issues[nav?.i ?? -1] : undefined
    return !!cur && !cur.decision && !isAgentWork(cur) && choice[cur.fp] === undefined && cur.options[cur.recommended_index]?.id !== PARK
  }, [tab, readOnly, mode, issues, nav, choice])

  /** Pure paging: never writes, never accepts (rule 5). */
  const page = useCallback(
    (dir: -1 | 1) => {
      if (!nav) return
      const to = nav.i + dir
      if (to < 0 || to >= nav.n) return
      if (tab === 'report') setIssueIdx(to)
      else setReflIdx(to)
      toTop()
    },
    [nav, tab, setIssueIdx],
  )

  /**
   * "Accept & next" / "Accept" (P1432): writes the recommended answer at once, exactly like picking
   * it, then moves on. An answered card writes nothing; Accept never parks (only the founder parks,
   * by picking Park); a failed write keeps the card where it is, unanswered, with the error shown.
   */
  const acceptingNow = useRef(false)
  /** `clicks` is the browser's click count: the second click of a double click must not accept the card the first moved to, unseen */
  const accept = useCallback(async (clicks = 1) => {
    if (!accepting || !nav || acceptingNow.current || clicks > 1) return
    const at = nav.i
    const cur = issues[at]
    const rec = cur?.options[cur.recommended_index]?.id
    if (!cur || !rec || rec === PARK) return
    // a second click before the re-render must not write a second line
    acceptingNow.current = true
    try {
      setChoice((c) => ({ ...c, [cur.fp]: rec }))
      const r = await write([{ kind: 'option', target: cur.fp, option_id: rec }])
      // move on only if the founder is still on that card: paging during the save wins
      if (r.ok && runIdRef.current === runId && at + 1 < issues.length) {
        if (idxRef.current.yours === at && !agentModeRef.current) {
          setIdx((s) => ({ ...s, yours: at + 1 }))
          toTop()
        }
      }
    } finally {
      acceptingNow.current = false
    }
  }, [accepting, nav, issues, write, runId])

  const review = useCallback(() => {
    setAgentMode(true)
    toTop()
  }, [])
  const backToYours = useCallback(() => {
    setAgentMode(false)
    toTop()
  }, [])

  // ---- keyboard: ← → page, 1–9 choose, 1 2 3 rate ---------------------------------------

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e: KeyboardEvent) => {
    if (!ok || (tab !== 'report' && tab !== 'reflection')) return
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
    const onRadio = e.target instanceof HTMLInputElement && e.target.type === 'radio'
    // ↑ ↓ on a focused radio would silently change the answer (= a write). Answers change by
    // click or number key only.
    if (onRadio && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      return
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // On a focused radio the browser would also move the selection (= a write); stop that.
      if (onRadio || nav) e.preventDefault()
      page(e.key === 'ArrowLeft' ? -1 : 1)
      return
    }
    if (!/^[1-9]$/.test(e.key) || readOnly) return
    const n = Number(e.key)
    if (tab === 'report' && nav) {
      const issue = issues[nav.i]
      if (!issue) return
      // the custom answer is numbered after the listed options
      if (n === issue.options.length + 1) {
        e.preventDefault()
        choose(issue, OWN)
        return
      }
      const opt = issue.options[n - 1]
      if (!opt) return
      e.preventDefault()
      if (selected(issue) !== opt.id || !issue.decision) choose(issue, opt.id)
    } else if (tab === 'reflection' && nav && n <= 3) {
      const s = statements[nav.i]
      const side = (['disagree', 'unsure', 'agree'] as const)[n - 1]
      const cur = view?.reflection[s.id]?.position
      e.preventDefault()
      if (typeof cur === 'number' && sideOf(cur) === side) {
        if (side !== 'unsure') setPosition(s.id, cycle(cur))
      } else setPosition(s.id, DEFAULT_POS[side])
    }
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e)
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [])

  // ---- render --------------------------------------------------------------------------

  if (indexErr) return <Shell rootRef={rootRef} note={`The Day page couldn’t load: ${indexErr}`} />
  if (!index) return <Shell rootRef={rootRef} note="Loading…" info />
  if (!index.enabled) return <Shell rootRef={rootRef} note="The Day page is off." info />
  if (index.state === 'absent') return <Shell rootRef={rootRef} note="The day-data folder is missing." />
  if (index.state === 'error') return <Shell rootRef={rootRef} note="The day-data folder can’t be read." />
  if (!index.runs.length) return <Shell rootRef={rootRef} note="No runs recorded yet. Run /day to create one." info />

  const runs = index.runs
  const pos = Math.max(0, runs.findIndex((r) => r.id === runId))
  const summary = runs[pos]
  const latestId = index.latestId ?? runs[0].id
  const reviews = ok?.report.reviews ?? summary?.reviews ?? []
  const when = dayLabel(ok?.report.started_at ?? summary?.startedAt)
  // Resolved = answered in the file (or a pick being written); a card only paged past is not.
  const resolvedN = issues.filter((i) => {
    const kind = choice[i.fp]
    if (isFree(kind)) return !freeEmpty(i) && i.decision?.option_id === kind
    return !!i.decision || kind !== undefined
  }).length
  const firstYours = yoursLeft[0]
  const rated = statements.filter((s) => view?.reflection[s.id]).length

  return (
    <div className="day-root" ref={rootRef}>
      <header className="d-topbar">
        <div className="d-col">
          <div className="d-tabs" role="tablist" aria-label="Day">
            {TABS.map(([k, label]) => (
              <button type="button" role="tab" key={k} aria-selected={tab === k} aria-label={label} onClick={() => setTab(k)}>
                <span className="d-tl">{label}</span>
                <span className="d-ts" aria-hidden="true">
                  {SHORT_TAB[k]}
                </span>
              </button>
            ))}
          </div>
          <div className="d-subrow">
            <div className="d-days">
              <button type="button" aria-label="Previous run" disabled={pos >= runs.length - 1} onClick={() => setRunId(runs[pos + 1].id)}>
                ‹
              </button>
              <span data-run-date>{when}</span>
              <button type="button" aria-label="Next run" disabled={pos <= 0} onClick={() => setRunId(runs[pos - 1].id)}>
                ›
              </button>
            </div>
            {reviews.map((r) => (
              <span className="d-runbadge" key={r}>
                {r === 'weekly' ? 'Weekly review' : 'Monthly review'}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="d-main">
        <div className="d-col">
          {newerId && newerId !== runId && (
            <div className="d-note d-banner" role="status" data-newer>
              <span>A newer run is here.</span>
              <button
                type="button"
                className="d-link d-tap"
                onClick={() => {
                  setRunId(newerId)
                  setNewerId(null)
                }}
              >
                Open it
              </button>
            </div>
          )}
          {!(newerId && newerId !== runId) && run && !run.isLatest && runId !== latestId && (
            <div className="d-note info d-banner" role="status">
              <span>You’re looking at {when}. Decisions apply to the latest run only.</span>
              <button type="button" className="d-link d-tap" onClick={() => setRunId(latestId)}>
                Back to today
              </button>
            </div>
          )}
          {ok?.warnings.includes('stale') && <div className="d-note">No run since {when}. Run /day to refresh.</div>}
          {ok?.warnings.includes('unfinished') && (
            <div className="d-note">
              {ok.report.state === 'running' ? 'This run hasn’t finished. What’s below is partial.' : 'This run stopped early. What’s below is partial.'}
            </div>
          )}
          {ok && ok.droppedRows > 0 && (
            <div className="d-note info">
              {ok.droppedRows} row{ok.droppedRows === 1 ? '' : 's'} in this run couldn’t be read.
            </div>
          )}
          {runErr && <div className="d-note">This run couldn’t be loaded: {runErr}</div>}

          {!run && !runErr && <div className="d-note info">Loading…</div>}
          {run?.kind === 'unreadable' && (
            <div className="d-note d-banner" data-unreadable-box>
              <span>
                <span data-unreadable>{run.isLatest || run.id === latestId ? 'The latest run’s file can’t be read.' : 'This run’s file can’t be read.'}</span>{' '}
                Run /day again to rewrite it.
              </span>
              {pos < runs.length - 1 && (
                <button type="button" className="d-link d-tap" onClick={() => setRunId(runs[pos + 1].id)}>
                  Open the previous run
                </button>
              )}
            </div>
          )}
          {run?.kind === 'other-schema' && (
            <>
              <div className="d-note info">This run uses a newer report format. Showing it as text.</div>
              <pre className="d-card d-pre">{run.text}</pre>
            </>
          )}
          {ok && view && (
            <>
              {tab === 'report' && (
                <DailyReport
                  key={ok.id}
                  report={ok.report}
                  view={view}
                  readOnly={readOnly}
                  issues={issues}
                  index={issueIdx}
                  agent={{ count: agentCards.length, showing: mode === 'agent', canGoBack: yours.length > 0, onReview: review, onBack: backToYours }}
                  onJump={jumpTo}
                  selected={selected}
                  draftOf={draftOf}
                  onChoose={choose}
                  onDraft={(i, text) => setDrafts((d) => ({ ...d, [i.fp]: text }))}
                  onDraftBlur={draftBlur}
                  ownFocus={ownFocus}
                  onFix={fix}
                  onUndoFix={undoFix}
                  onBringBack={bringBack}
                  sent={ok.sentItems ?? {}}
                />
              )}
              {tab === 'stats' && <StatsTab stats={ok.report.stats} notes={ok.report.notes} />}
              {tab === 'monitoring' && (
                <MonitoringTab report={ok.report} view={view} readOnly={readOnly} quotaHistory={ok.quotaHistory} onRaise={raise} onUndoRaise={undoRaise} />
              )}
              {tab === 'reflection' && (
                <ReflectionTab
                  statements={statements}
                  view={view}
                  readOnly={readOnly}
                  index={reflIdx}
                  onPosition={setPosition}
                  onRemove={removePosition}
                  onStory={setStory}
                />
              )}
            </>
          )}
        </div>
      </main>

      {ok && (
        <div className="d-gbar" data-bottom-bar>
          {toast && (
            <div className="d-toast" role="status">
              {toast.text}
              {toast.action && (
                <button
                  type="button"
                  className="d-toastact"
                  onClick={() => {
                    const run = toast.action?.run
                    setToast(null)
                    run?.()
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          )}
          <div className="d-col">
            <div className="d-gin">
              {nav ? (
                <div className="d-bnav">
                  <button type="button" className="d-nbtn" aria-label={`Previous ${nav.lab}`} title="Previous (←)" disabled={nav.i === 0} onClick={() => page(-1)}>
                    ‹<span className="d-nl">Previous</span>
                  </button>
                  <span className="d-bpos">
                    {nav.i + 1} of {nav.n}
                  </span>
                  <button type="button" className="d-nbtn" aria-label={`Next ${nav.lab}`} title="Next (→)" disabled={nav.i >= nav.n - 1} onClick={() => page(1)}>
                    <span className="d-nl">Next</span>›
                  </button>
                  {accepting && (
                    <button type="button" className="d-nbtn d-accept" data-accept aria-label={nav.i < nav.n - 1 ? 'Accept and next' : 'Accept'} title="Save the recommended answer" disabled={busy} onClick={(e) => void accept(e.detail)}>
                      <span className="d-nl">{nav.i < nav.n - 1 ? 'Accept & next' : 'Accept'}</span>
                      <span className="d-ns">Accept</span>
                    </button>
                  )}
                </div>
              ) : (
                <div />
              )}
              <div className="d-bprog">
                {readOnly ? null : tab === 'reflection' ? (
                  statements.length > 0 && (
                    <>
                      <span data-progress data-short={`${rated}/${statements.length}`}>
                        {rated} of {statements.length} rated
                      </span>
                      <span className="d-bline">
                        <span style={{ width: `${(rated / statements.length) * 100}%` }} />
                      </span>
                    </>
                  )
                ) : issues.length > 0 ? (
                  <>
                    <span data-progress data-short={`${resolvedN}/${issues.length}`}>
                      {resolvedN} of {issues.length} resolved
                    </span>
                    <span className="d-bline">
                      <span style={{ width: `${(resolvedN / issues.length) * 100}%` }} />
                    </span>
                  </>
                ) : null}
                {!readOnly && tab === 'report' && mode === 'yours' && firstYours && (
                  <button type="button" className="d-still" data-still-yours data-short={`yours: ${yoursLeft.length}`} onClick={() => jumpTo(firstYours.fp)}>
                    {yoursLeft.length} still yours
                  </button>
                )}
                {tab === 'report' && mode === 'agent' && yours.length > 0 && (
                  <button type="button" className="d-still" data-back-yours data-short="yours" onClick={backToYours}>
                    Back to yours
                  </button>
                )}
                {!readOnly && nav && (
                  <span className="d-hint" aria-hidden="true">
                    ← → move
                  </span>
                )}
              </div>
              <div className="d-bact">
                {readOnly ? (
                  <span className="d-ro">Read only</span>
                ) : (
                  <>
                    {opening ? (
                      <span className="d-bstat" data-launch="opening">
                        <span className="d-spin" aria-hidden="true" />
                        Opening…
                      </span>
                    ) : ok.lastSentAt && sendCount === 0 ? (
                      <span className="d-bstat" data-launch="sent" title={`Sent to your terminal at ${clock(ok.lastSentAt)}`}>
                        <span className="d-tl">Sent to your terminal at {clock(ok.lastSentAt)}</span>
                        <span className="d-ts">Sent {clock(ok.lastSentAt)}</span>
                      </span>
                    ) : ok.lastSentAt ? (
                      <button type="button" className="d-btn primary sm" disabled={busy} onClick={() => void startFixing('start')}>
                        Send {sendCount} change{sendCount === 1 ? '' : 's'}
                      </button>
                    ) : (
                      <button type="button" className="d-btn primary sm" disabled={busy || sendCount === 0} onClick={() => void startFixing('start')}>
                        Start fixing ({sendCount})
                      </button>
                    )}
                    <button
                      type="button"
                      className="d-iconbtn"
                      aria-label="Copy prompt"
                      title="Copy prompt"
                      disabled={busy || (sendCount === 0 && !ok.lastSentAt)}
                      onClick={() => void startFixing('copy')}
                    >
                      <CopyIcon />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Shell({ note, info, rootRef }: { note: string; info?: boolean; rootRef: RefObject<HTMLDivElement> }) {
  return (
    <div className="day-root" ref={rootRef}>
      <main className="d-main">
        <div className="d-col">
          <div className={`d-note ${info ? 'info' : ''}`} data-day-message>
            {note}
          </div>
        </div>
      </main>
    </div>
  )
}
