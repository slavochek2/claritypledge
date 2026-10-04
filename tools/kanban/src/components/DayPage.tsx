// P1399: the Day page — the latest /day run, sorted by who has to act.
//
// Reading order is the contract (spec §1–2): header with a one-line summary → the three action
// groups → readings → done ✓ → everything one step away. Actions come first because the founder
// could not see what mattered under the rest. A check that did not run is never "clean".
//
// PRIVACY: report content lives only in React state. Nothing is written to localStorage, and
// the only write is a decision POST carrying a fingerprint and an action.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { buildAgentPrompt, type DayReport, type DayView, type ShownItem } from '../lib/day'
import { AreaTag, DayItemCard, type DecisionInput } from './DayItemCard'
import { ghostButton, outlineButton } from './dayUi'

interface RunSummary {
  id: string
  startedAt: string | null
  state: string
  valid: boolean
  answer: number
  agent: number
  checksClean: number
  checksTotal: number
}

type ListResponse = { enabled: false } | { enabled: true; state: 'present' | 'absent' | 'error'; runs: RunSummary[] }

type RunResponse =
  | { id: string; valid: false; problems: string[] }
  | { id: string; valid: true; isLatest: boolean; report: DayReport; view: DayView; decisionsState: string; decisionsBadLines: number }

const DONE_VISIBLE = 8

const GROUPS: { key: 'answer' | 'agent' | 'hold'; title: string; definition: string; empty: string }[] = [
  {
    key: 'answer',
    title: 'Needs your answer',
    definition: 'Choices only you can make. Nothing moves until you answer.',
    empty: 'Nothing is waiting on you.',
  },
  {
    key: 'agent',
    title: 'Give to an agent',
    definition: 'Problems an agent can investigate and fix. Includes checks that did not finish, because then nobody knows if that thing is fine.',
    empty: 'Nothing for an agent to fix.',
  },
  {
    key: 'hold',
    title: 'On hold',
    definition: 'Still open, but you decided to wait. Only you put things here.',
    empty: 'Nothing on hold.',
  },
]

function staleHours(iso: string): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : (Date.now() - t) / 3_600_000
}

function formatRunTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function SectionHeader({ title, count, definition, action }: { title: string; count?: number; definition?: string; action?: ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 'var(--font-size-16)', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h2>
        {count !== undefined && (
          <span style={{ background: 'var(--status-gray-bg)', color: 'var(--status-gray-text)', fontSize: 'var(--font-size-12)', padding: '0 6px', borderRadius: 3, lineHeight: '18px' }}>
            {count}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {action}
      </div>
      {definition && <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-12)', lineHeight: 1.5, marginTop: 2 }}>{definition}</div>}
    </div>
  )
}

function Disclosure({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div data-testid={testId}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ ...ghostButton, padding: '0 4px', color: 'var(--text-secondary)', fontWeight: 500 }}
      >
        <span style={{ display: 'inline-block', width: 14, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.1s' }}>›</span>
        {label}
      </button>
      {open && <div style={{ padding: '4px 0 8px 18px' }}>{children}</div>}
    </div>
  )
}

const CHECK_ICON: Record<string, { icon: string; color: string; label: string }> = {
  ok: { icon: '✓', color: 'var(--tag-green-text)', label: 'clean' },
  problem: { icon: '!', color: 'var(--tag-orange-text)', label: 'found a problem' },
  'not-run': { icon: '?', color: 'var(--tag-red-text)', label: 'did not run' },
  unproven: { icon: '?', color: 'var(--tag-red-text)', label: 'result not proven' },
  skipped: { icon: '–', color: 'var(--text-tertiary)', label: 'not needed this run' },
}

function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 4,
        background: tone === 'warn' ? 'var(--status-red-bg)' : 'var(--bg-group-header)',
        color: tone === 'warn' ? 'var(--status-red-text)' : 'var(--text-secondary)',
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  )
}

export function DayPage() {
  const [list, setList] = useState<ListResponse | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [run, setRun] = useState<RunResponse | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null)
  const [showAllDone, setShowAllDone] = useState(false)

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch('/api/day')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as ListResponse
      setList(data)
      setListError(null)
      if (data.enabled) {
        setSelected((cur) => cur ?? data.runs.find((r) => r.valid)?.id ?? data.runs[0]?.id ?? null)
      }
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'unknown error')
    }
  }, [])

  const fetchRun = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/day/runs/${encodeURIComponent(id)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setRun((await res.json()) as RunResponse)
      setRunError(null)
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'unknown error')
    }
  }, [])

  useEffect(() => { fetchList() }, [fetchList])
  useEffect(() => { if (selected) fetchRun(selected) }, [selected, fetchRun])

  const decide = useCallback(async (d: DecisionInput): Promise<boolean> => {
    setActionError(null)
    try {
      const res = await fetch('/api/day/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setActionError(`Not saved: ${body.error ?? `HTTP ${res.status}`}`)
        return false
      }
      if (selected) await fetchRun(selected)
      await fetchList()
      return true
    } catch {
      setActionError('Not saved: the board server did not answer.')
      return false
    }
  }, [selected, fetchRun, fetchList])

  if (listError) return <Page><Notice tone="warn">Could not load /day runs ({listError}). Is the board server running?</Notice></Page>
  if (!list) return <Page><div style={{ color: 'var(--text-tertiary)' }}>Loading…</div></Page>
  if (!list.enabled) return <Page><Notice>The Day page is not enabled on this board.</Notice></Page>
  if (list.state === 'absent') {
    return <Page><Notice tone="warn">The folder this board reads /day runs from does not exist yet, so no run has ever been recorded. This is not an empty day.</Notice></Page>
  }
  if (list.state === 'error') return <Page><Notice tone="warn">The /day runs folder could not be read. See the board server log.</Notice></Page>
  if (list.runs.length === 0) return <Page><Notice>No /day runs recorded yet. The next /day run will appear here.</Notice></Page>

  const history = (
    <section data-testid="day-history">
      <SectionHeader title="Earlier runs" count={list.runs.length} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {list.runs.map((r) => {
          const active = r.id === selected
          return (
            <button
              key={r.id}
              onClick={() => setSelected(r.id)}
              aria-current={active ? 'true' : undefined}
              style={{
                ...ghostButton,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                textAlign: 'left',
                width: '100%',
                background: active ? 'var(--bg-sidebar-item-active)' : 'transparent',
                color: 'var(--text-primary)',
                padding: '0 8px',
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, padding: '6px 0', lineHeight: 1.35 }}>
                <span>{r.startedAt ? formatRunTime(r.startedAt) : r.id}</span>
                {!r.valid ? (
                  <span style={{ color: 'var(--tag-red-text)', fontSize: 'var(--font-size-12)' }}>file unreadable</span>
                ) : (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-12)' }}>
                    {r.state !== 'complete' ? `${r.state} · ` : ''}
                    {r.answer} for you · {r.agent} for an agent
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )

  let body: ReactNode
  if (runError) body = <Notice tone="warn">Could not load this run ({runError}).</Notice>
  else if (!run) body = <div style={{ color: 'var(--text-tertiary)' }}>Loading…</div>
  else if (!run.valid) {
    body = (
      <Notice tone="warn">
        This run's file is not in the expected shape, so nothing from it is shown (rather than showing part of it as if it were complete). Problems: {run.problems.join(', ')}.
      </Notice>
    )
  } else {
    body = <RunView run={run} decide={decide} copied={copied} setCopied={setCopied} showAllDone={showAllDone} setShowAllDone={setShowAllDone} actionError={actionError} onBackToLatest={() => setSelected(list.runs.find((r) => r.valid)?.id ?? null)} />
  }

  return (
    <Page>
      <div className="day-layout">
        <div className="day-main">{body}</div>
        <aside className="day-aside">{history}</aside>
      </div>
    </Page>
  )
}

function Page({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '24px 16px 48px', maxWidth: 1120, margin: '0 auto', width: '100%' }}>
      <style>{`
        .day-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 32px; }
        @media (min-width: 1100px) { .day-layout { grid-template-columns: minmax(0, 1fr) 280px; } .day-aside { position: sticky; top: 0; align-self: start; } }
        .day-readings { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px 24px; }
        .day-reading { display: flex; gap: 10px; padding: 4px 0; min-width: 0; }
        .day-reading-label { width: 64px; flex-shrink: 0; color: var(--text-tertiary); font-size: var(--font-size-12); padding-top: 2px; }
        @media (max-width: 480px) { .day-reading { flex-direction: column; gap: 0; } .day-reading-label { width: auto; padding-top: 0; } }
        @media (min-width: 720px) { .day-readings { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      `}</style>
      {children}
    </div>
  )
}

interface RunViewProps {
  run: Extract<RunResponse, { valid: true }>
  decide: (d: DecisionInput) => Promise<boolean>
  copied: 'ok' | 'failed' | null
  setCopied: (v: 'ok' | 'failed' | null) => void
  showAllDone: boolean
  setShowAllDone: (v: boolean) => void
  actionError: string | null
  onBackToLatest: () => void
}

function RunView({ run, decide, copied, setCopied, showAllDone, setShowAllDone, actionError, onBackToLatest }: RunViewProps) {
  const { report, view, isLatest } = run
  const runDate = report.started_at
  const doneShown = showAllDone ? report.done : report.done.slice(0, DONE_VISIBLE)
  const notRun = view.checks.notRun

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildAgentPrompt(report, view.agent))
      setCopied('ok')
    } catch {
      setCopied('failed')
    }
    window.setTimeout(() => setCopied(null), 2500)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Header */}
      <header>
        {!isLatest && (
          <div style={{ marginBottom: 12 }}>
            <Notice>
              You are looking at an earlier run. It shows what that morning reported; decisions are made on the latest run.{' '}
              <button style={{ ...ghostButton, minHeight: 0, padding: 0, color: 'var(--status-blue-text)', textDecoration: 'underline' }} onClick={onBackToLatest}>
                Back to latest
              </button>
            </Notice>
          </div>
        )}
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.25 }}>Day · {formatRunTime(report.started_at)}</h1>
        <div style={{ color: 'var(--text-secondary)', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {report.since && <span>Covers since {formatRunTime(report.since)}</span>}
          <span
            data-testid="day-run-state"
            style={{
              fontSize: 'var(--font-size-12)',
              padding: '0 6px',
              borderRadius: 3,
              lineHeight: '18px',
              background: report.state === 'complete' ? 'var(--status-green-bg)' : 'var(--status-red-bg)',
              color: report.state === 'complete' ? 'var(--status-green-text)' : 'var(--status-red-text)',
            }}
          >
            {report.state === 'complete' ? 'Complete ✓' : report.state === 'incomplete' ? 'Incomplete: some steps did not run' : 'Abandoned'}
          </span>
          {report.model && <span style={{ fontSize: 'var(--font-size-12)', color: 'var(--text-tertiary)' }}>ran on {report.model}</span>}
        </div>
        <div data-testid="day-summary" style={{ marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 'var(--font-size-14)' }}>
          <span><strong>{view.answer.length}</strong> need your answer</span>
          <span><strong>{view.agent.length}</strong> for an agent</span>
          {view.hold.length > 0 && <span><strong>{view.hold.length}</strong> on hold</span>}
          <span style={{ color: 'var(--tag-green-text)' }}>✓ {report.done.length} done</span>
          <span style={{ color: 'var(--text-secondary)' }}>{view.checks.clean} of {view.checks.total} checks clean</span>
        </div>
      </header>

      {isLatest && staleHours(report.started_at) >= 24 && (
        <Notice tone="warn">
          This is the newest run recorded, and it is {Math.floor(staleHours(report.started_at) / 24)} day(s) old. Either /day has not run since,
          or a later run stopped before it could save its report.
        </Notice>
      )}

      {actionError && <Notice tone="warn">{actionError}</Notice>}

      {/* The three groups */}
      {GROUPS.map((g) => {
        const items: ShownItem[] = view[g.key]
        if (g.key === 'hold' && items.length === 0) return null
        return (
          <section key={g.key} data-testid={`day-group-${g.key}`}>
            <SectionHeader
              title={g.title}
              count={items.length}
              definition={g.definition}
              action={
                g.key === 'agent' && items.length > 0 ? (
                  <button style={outlineButton} onClick={copyPrompt} data-testid="day-copy-prompt">
                    {copied === 'ok' ? 'Copied ✓' : copied === 'failed' ? 'Copy failed' : `Copy prompt for all ${items.length}`}
                  </button>
                ) : undefined
              }
            />
            {items.length === 0 ? (
              <div style={{ color: 'var(--text-tertiary)' }}>{g.empty}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((it) => (
                  <DayItemCard key={it.fp} item={it} runDate={runDate} canDecide={isLatest} onDecide={decide} />
                ))}
              </div>
            )}
          </section>
        )
      })}

      {/* Readings */}
      <section data-testid="day-readings">
        <SectionHeader title="Readings" definition="Numbers to glance at. They never ask for anything; when one goes wrong, it shows up as an item below." />
        <div className="day-readings">
          {report.readings.map((r) => (
            <div key={r.name} className="day-reading">
              <span className="day-reading-label">{r.name}</span>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.5 }}>
                {r.text}
                {r.note && <span style={{ color: 'var(--text-tertiary)' }}> · {r.note}</span>}
              </span>
            </div>
          ))}
          <div className="day-reading" data-testid="day-checks-reading">
            <span className="day-reading-label">Checks</span>
            <span>
              {view.checks.clean} of {view.checks.total} clean
              {notRun > 0 && <span style={{ color: 'var(--tag-red-text)' }}> · {notRun} did not finish (listed under Give to an agent)</span>}
              {view.checks.problems > 0 && <span style={{ color: 'var(--text-tertiary)' }}> · {view.checks.problems} found something</span>}
            </span>
          </div>
        </div>
      </section>

      {/* Done */}
      <section data-testid="day-done">
        <SectionHeader title="Done" count={report.done.length} definition="What this run did and what worked." />
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {doneShown.map((d, i) => (
            <li key={i} style={{ display: 'flex', gap: 8, lineHeight: 1.5 }}>
              <span style={{ color: d.ok ? 'var(--tag-green-text)' : 'var(--tag-orange-text)', width: 14, flexShrink: 0 }}>{d.ok ? '✓' : '!'}</span>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                {d.label}
                {d.result && <span style={{ color: 'var(--text-secondary)' }}>: {d.result}</span>}
              </span>
            </li>
          ))}
        </ul>
        {report.done.length > DONE_VISIBLE && (
          <button style={{ ...ghostButton, padding: '0 4px' }} onClick={() => setShowAllDone(!showAllDone)}>
            {showAllDone ? 'Show fewer' : `+${report.done.length - DONE_VISIBLE} more ✓`}
          </button>
        )}
      </section>

      {/* Decided this run */}
      {view.resolved.length > 0 && (
        <section data-testid="day-resolved">
          <Disclosure label={`Decided this run (${view.resolved.length})`}>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {view.resolved.map((r) => (
                <li key={r.fp} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <AreaTag area={r.area} />
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{r.title}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {r.resolution.action === 'answer'
                      ? `→ you answered “${r.resolution.answer}”`
                      : r.resolution.action === 'dismiss'
                        ? '→ not a problem'
                        : '→ fixed'}
                  </span>
                  {isLatest && (
                    <button style={ghostButton} onClick={() => decide({ fp: r.fp, action: 'unhold' })}>Undo</button>
                  )}
                </li>
              ))}
            </ul>
          </Disclosure>
        </section>
      )}

      {/* One step away */}
      <section data-testid="day-more" style={{ borderTop: '1px solid var(--border-table)', paddingTop: 12 }}>
        <Disclosure label={`All checks (${view.checks.total})`} testId="day-all-checks">
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {report.checks.map((c) => {
              const s = CHECK_ICON[c.status]
              return (
                <li key={c.id} style={{ display: 'flex', gap: 8, lineHeight: 1.5 }}>
                  <span style={{ color: s.color, width: 14, flexShrink: 0, fontWeight: 600 }} title={s.label}>{s.icon}</span>
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    {c.label}
                    <span style={{ color: 'var(--text-tertiary)' }}> · {s.label}</span>
                    {c.detail && <span style={{ color: 'var(--text-secondary)' }}>: {c.detail}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        </Disclosure>
        {(report.detail ?? []).map((d) => (
          <Disclosure key={d.title} label={d.title}>
            <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 'var(--font-size-12)', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{d.body}</div>
          </Disclosure>
        ))}
      </section>
    </div>
  )
}
