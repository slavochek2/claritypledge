// P1399: the Day page shell — tabs, the day switcher, warnings, and the sticky bottom bar
// (pager · progress · Start fixing). Spec §3 and §7 are the contract.
//
// Writes (rule 5): picking an option, rating, a story (on blur, if changed), a budget raise or
// undo, a connection Fix, Ask/Other text (on blur), Bring back, and the preselected batch on
// Start fixing / copy. Paging NEVER writes; "resolved" from Next lives in React state only.
//
// PRIVACY: report content lives only in React state. Nothing is put in localStorage or
// sessionStorage, and nothing is logged.

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ASK, OTHER, pendingPreselected, type ConnectionView, type DayView, type DecisionInput, type IssueView } from '../../lib/day'
import { copyText, dayLabel, getIndex, getPrompt, getRun, HttpError, postDecisions, startRun, type DayIndex, type RunPayload } from './api'
import { DailyReport, type FreeKind } from './DailyReport'
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

const draftKey = (fp: string, kind: FreeKind) => `${fp}\u0000${kind}`
const isFree = (id: string | undefined): id is FreeKind => id === ASK || id === OTHER
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
  const [issueIdx, setIssueIdx] = useState(0)
  const [reflIdx, setReflIdx] = useState(0)
  const [resolved, setResolved] = useState<Set<string>>(new Set())
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<{ text: string; action?: { label: string; run: () => void } } | null>(null)
  const [busy, setBusy] = useState(false)
  /** Start fixing: idle → opening (request in flight) → running (until any decision changes) */
  const [launch, setLaunch] = useState<'idle' | 'opening' | 'running'>('idle')
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
    setIssueIdx(0)
    setReflIdx(0)
    setResolved(new Set())
    setChoice({})
    setDrafts({})
    setLaunch('idle')
    stories.current = {}
    void reload(runId)
  }, [runId, reload])

  const ok = run?.kind === 'ok' ? run : null
  const view: DayView | null = ok?.view ?? null
  const readOnly = !ok || !ok.isLatest
  const issues = useMemo(() => view?.issues ?? [], [view])
  const statements = ok?.report.reflection?.statements ?? []

  useEffect(() => {
    if (issueIdx > 0 && issueIdx >= issues.length) setIssueIdx(Math.max(0, issues.length - 1))
  }, [issues.length, issueIdx])

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
            setLaunch('idle') // a decision changed: what is running no longer matches the page
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

  /** Ask/Other picked but nothing written yet: not an answer. */
  const freeEmpty = useCallback(
    (i: IssueView): FreeKind | null => {
      const kind = choice[i.fp]
      if (!isFree(kind)) return null
      const text = (drafts[draftKey(i.fp, kind)] ?? (i.decision?.option_id === kind ? i.decision.text ?? '' : '')).trim()
      return text ? null : kind
    },
    [choice, drafts],
  )

  const draftOf = useCallback(
    (i: IssueView, kind: FreeKind) => drafts[draftKey(i.fp, kind)] ?? (i.decision?.option_id === kind ? i.decision.text ?? '' : ''),
    [drafts],
  )

  const choose = useCallback(
    (i: IssueView, optionId: string) => {
      if (readOnly) return
      setChoice((c) => ({ ...c, [i.fp]: optionId }))
      if (!isFree(optionId)) setResolved((s) => new Set(s).add(i.fp))
      if (!isFree(optionId)) void write([{ kind: 'option', target: i.fp, option_id: optionId }])
    },
    [readOnly, write],
  )

  /** Ask/Other text not yet in the file (never an Ask/Other without text). */
  const unsavedFree = useCallback(
    (v: DayView): DecisionInput[] =>
      v.issues.flatMap((i) => {
        const kind = choice[i.fp]
        if (!isFree(kind)) return []
        const text = (drafts[draftKey(i.fp, kind)] ?? '').trim()
        if (!text || (i.decision?.option_id === kind && i.decision.text === text)) return []
        return [{ kind: 'option' as const, target: i.fp, option_id: kind, text }]
      }),
    [choice, drafts],
  )

  const draftBlur = useCallback(
    (i: IssueView, kind: FreeKind) => {
      if (!view || readOnly) return
      const d = unsavedFree({ ...view, issues: [i] }).filter((x) => x.option_id === kind)
      void write(d)
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

  // ---- Start fixing / copy (rule 3) -------------------------------------------------------

  const startRef = useRef<(mode: 'start' | 'copy') => Promise<void>>(async () => {})
  const startFixing = useCallback(
    async (mode: 'start' | 'copy') => {
      if (!runId || readOnly || busy || !view) return
      // An Ask/Other with no text is not an answer: send the founder back to it.
      const emptyAt = view.issues.findIndex((i) => freeEmpty(i))
      if (emptyAt >= 0) {
        const kind = freeEmpty(view.issues[emptyAt])
        say(kind === ASK ? 'Write your question first, or pick another answer' : 'Write your answer first, or pick another answer')
        setTab('report')
        setIssueIdx(emptyAt)
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
        if (batch.length) {
          await postDecisions(runId, batch)
          setLaunch('idle')
        }
        if (mode === 'copy') {
          await copyText((await getPrompt()).prompt)
          say('Prompt copied')
          return
        }
        setLaunch('opening')
        const r = await startRun(runId)
        if (r.status === 200 && r.body.launched) {
          setLaunch('running')
          say(r.body.how === 'window' ? 'Opened a new window in your terminal' : 'Opened a new tab in your terminal')
          return
        }
        setLaunch('idle')
        if (r.status === 429) say('Started less than a minute ago. Wait a moment, or copy the prompt.')
        else if (r.status === 409 && r.body.reason === 'already-sent')
          say('This was already sent to a terminal. Copy it instead?', { label: 'Copy', run: () => void startRef.current('copy') })
        else if (r.status === 502) {
          await copyText((await getPrompt()).prompt)
          say('Couldn’t open the terminal — prompt copied instead.')
        } else {
          if (r.status === 409 && r.body.reason === 'not-latest') void checkNewer()
          say(`Couldn’t start: ${r.body.error ?? `request failed (${r.status})`}`)
        }
      } catch (e) {
        setLaunch('idle')
        if (e instanceof HttpError && e.status === 409) void checkNewer()
        say(`Couldn’t copy: ${(e as Error).message}`)
      } finally {
        setBusy(false)
        await reload(runId)
      }
    },
    [runId, readOnly, busy, view, freeEmpty, unsavedFree, choice, reload, say, checkNewer],
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
        ? { i: Math.min(issueIdx, issues.length - 1), n: issues.length, lab: 'issue' }
        : tab === 'reflection' && statements.length
          ? { i: Math.min(reflIdx, statements.length - 1), n: statements.length, lab: 'statement' }
          : null,
    [tab, issues.length, issueIdx, reflIdx, statements.length],
  )

  const page = useCallback(
    (dir: -1 | 1) => {
      if (!nav) return
      const to = nav.i + dir
      if (to < 0 || to >= nav.n) return
      if (tab === 'report') {
        if (dir === 1 && issues[nav.i]) setResolved((s) => new Set(s).add(issues[nav.i].fp))
        setIssueIdx(to)
      } else setReflIdx(to)
      toTop()
    },
    [nav, tab, issues],
  )

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
      const opt = issue?.options[n - 1]
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
  const resolvedN = issues.filter((i) => {
    const kind = choice[i.fp]
    if (isFree(kind)) return !freeEmpty(i) && i.decision?.option_id === kind
    return !!i.decision || resolved.has(i.fp)
  }).length
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
                  index={issueIdx}
                  onIndex={setIssueIdx}
                  selected={selected}
                  draftOf={draftOf}
                  onChoose={choose}
                  onDraft={(i, kind, text) => setDrafts((d) => ({ ...d, [draftKey(i.fp, kind)]: text }))}
                  onDraftBlur={draftBlur}
                  onFix={fix}
                  onUndoFix={undoFix}
                  onBringBack={bringBack}
                />
              )}
              {tab === 'stats' && <StatsTab stats={ok.report.stats} notes={ok.report.notes} />}
              {tab === 'monitoring' && <MonitoringTab report={ok.report} view={view} readOnly={readOnly} onRaise={raise} onUndoRaise={undoRaise} />}
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
                    {launch === 'opening' ? (
                      <span className="d-bstat opening" data-launch="opening">
                        <span className="d-spin" aria-hidden="true" />
                        Opening…
                      </span>
                    ) : launch === 'running' ? (
                      <span className="d-bstat" data-launch="running">
                        ✓ Running in terminal
                      </span>
                    ) : (
                      <button type="button" className="d-btn primary sm" disabled={busy || ok.collectedCount === 0} onClick={() => void startFixing('start')}>
                        Start fixing ({ok.collectedCount})
                      </button>
                    )}
                    <button
                      type="button"
                      className="d-iconbtn"
                      aria-label="Copy prompt"
                      title="Copy prompt"
                      disabled={busy || ok.collectedCount === 0}
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
