// P1399: one item on the Day page — a card the founder can act on.
//
// Actions are deliberately few, and each label says one thing (visual QA of the first build:
// "Snooze", "Hold" and "Park it" side by side all read as "not now"):
//   answer cards: the options · Later…
//   agent cards:  Copy prompt · It's fixed · False alarm · Later…
//   held cards:   Bring back
// "Later…" opens one chooser: tomorrow, in a week, or until I say (with a reason).
//
// PRIVACY: item text lives only in props and React state; nothing here is persisted.

import { useState, type ReactNode } from 'react'
import { buildAgentPrompt, daysOpen, type DayDecision, type DayReport, type ShownItem } from '../lib/day'
import { GROUP_ACCENT, addDays, formatDay, ghostButton, outlineButton } from './dayUi'

export type DecisionInput = Omit<DayDecision, 'at'>

const AREA_TAG: Record<string, { bg: string; fg: string }> = {
  product: { bg: 'var(--tag-blue-bg)', fg: 'var(--tag-blue-text)' },
  security: { bg: 'var(--tag-red-bg)', fg: 'var(--tag-red-text)' },
  cost: { bg: 'var(--tag-yellow-bg)', fg: 'var(--tag-yellow-text)' },
  outreach: { bg: 'var(--tag-purple-bg)', fg: 'var(--tag-purple-text)' },
  life: { bg: 'var(--tag-green-bg)', fg: 'var(--tag-green-text)' },
  checks: { bg: 'var(--tag-orange-bg)', fg: 'var(--tag-orange-text)' },
}
const DEFAULT_TAG = { bg: 'var(--tag-gray-bg)', fg: 'var(--tag-gray-text)' }

export function AreaTag({ area }: { area: string }) {
  const c = AREA_TAG[area] ?? DEFAULT_TAG
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        fontSize: 'var(--font-size-12)',
        lineHeight: '18px',
        padding: '0 6px',
        borderRadius: 3,
        whiteSpace: 'nowrap',
      }}
    >
      {area}
    </span>
  )
}

function Meta({ children }: { children: ReactNode }) {
  return <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-12)', whiteSpace: 'nowrap' }}>{children}</span>
}

interface Props {
  item: ShownItem
  report: DayReport
  /** false on an earlier run: read-only, no actions at all */
  canDecide: boolean
  onDecide: (d: DecisionInput) => Promise<boolean>
}

type Mode = 'idle' | 'later'

export function DayItemCard({ item, report, canDecide, onDecide }: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('idle')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null)

  const runDate = report.started_at
  const age = daysOpen(item, runDate)

  const decide = async (d: DecisionInput) => {
    setBusy(true)
    const ok = await onDecide(d)
    setBusy(false)
    if (ok) {
      setMode('idle')
      setReason('')
    }
  }

  const copyOne = async () => {
    try {
      await navigator.clipboard.writeText(buildAgentPrompt(report, [item]))
      setCopied('ok')
    } catch {
      setCopied('failed')
    }
    window.setTimeout(() => setCopied(null), 2500)
  }

  const hasDetail = !!(item.evidence || item.prompt || item.confidence)

  return (
    <article
      data-testid="day-item"
      data-group={item.shown}
      style={{
        background: 'var(--bg-card)',
        boxShadow: 'var(--shadow-card)',
        borderRadius: 'var(--radius-card)',
        borderLeft: `4px solid ${GROUP_ACCENT[item.shown]}`,
        padding: '10px 12px 6px 12px',
        opacity: busy ? 0.6 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <AreaTag area={item.area} />
        {item.synthetic && <Meta>{item.fp.startsWith('check:') ? 'from the check list, no write-up' : 'check did not finish'}</Meta>}
        <span style={{ flex: 1 }} />
        {item.deadline && (
          <span style={{ color: 'var(--tag-red-text)', fontSize: 'var(--font-size-12)', fontWeight: 600, whiteSpace: 'nowrap' }}>
            by {formatDay(item.deadline)}
            {item.deadline_label ? ` · ${item.deadline_label}` : ''}
          </span>
        )}
        {age !== null && age > 0 && <Meta>open {age} {age === 1 ? 'day' : 'days'}</Meta>}
      </div>

      <div style={{ fontWeight: 600, lineHeight: 1.4, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{item.title}</div>
      {item.why && (
        <div style={{ color: 'rgba(55, 53, 47, 0.8)', lineHeight: 1.5, marginTop: 2, overflowWrap: 'anywhere' }}>{item.why}</div>
      )}

      {item.hold && (
        <div style={{ marginTop: 6, fontSize: 'var(--font-size-12)', color: 'var(--text-secondary)' }}>
          On hold since {formatDay(item.hold.at)}
          {item.hold.until ? `, until ${formatDay(item.hold.until)}` : ''}: “{item.hold.reason}”
        </div>
      )}

      {open && hasDetail && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 10px',
            background: 'var(--bg-group-header)',
            borderRadius: 4,
            fontSize: 'var(--font-size-12)',
            lineHeight: 1.55,
          }}
        >
          {item.confidence && (
            <div style={{ color: item.confidence === 'verified' ? 'var(--tag-green-text)' : 'var(--tag-orange-text)', marginBottom: 4 }}>
              {item.confidence === 'verified' ? 'Verified by the check' : 'Not verified: treat as a lead, not a fact'}
            </div>
          )}
          {item.evidence && (
            <>
              <div style={{ color: 'var(--text-secondary)' }}>What the check returned</div>
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'SFMono-Regular, Menlo, monospace', color: 'var(--text-primary)', marginBottom: 6 }}>
                {item.evidence}
              </div>
            </>
          )}
          {item.prompt && (
            <>
              <div style={{ color: 'var(--text-secondary)' }}>What the agent will be asked</div>
              <div style={{ overflowWrap: 'anywhere', color: 'var(--text-primary)' }}>{item.prompt}</div>
            </>
          )}
        </div>
      )}

      {canDecide && mode === 'later' && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--bg-group-header)', borderRadius: 4 }}>
          <div style={{ fontSize: 'var(--font-size-12)', color: 'var(--text-secondary)', marginBottom: 4 }}>Ask me again…</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button style={outlineButton} disabled={busy} onClick={() => decide({ fp: item.fp, action: 'snooze', until: addDays(runDate, 1), note: 'Asked again tomorrow' })}>
              tomorrow
            </button>
            <button style={outlineButton} disabled={busy} onClick={() => decide({ fp: item.fp, action: 'snooze', until: addDays(runDate, 7), note: 'Asked again in a week' })}>
              in a week
            </button>
          </div>
          <div style={{ fontSize: 'var(--font-size-12)', color: 'var(--text-secondary)', margin: '8px 0 4px' }}>…or only when I bring it back</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') decide({ fp: item.fp, action: 'park', note: reason || undefined })
                if (e.key === 'Escape') setMode('idle')
              }}
              placeholder="Reason, shown on the card (optional)"
              aria-label="Reason for putting this on hold"
              style={{
                flex: '1 1 200px',
                minHeight: 40,
                padding: '0 10px',
                border: '1px solid var(--border-table)',
                borderRadius: 4,
                fontFamily: 'inherit',
                fontSize: 'var(--font-size-14)',
                color: 'var(--text-primary)',
                background: 'var(--bg-card)',
              }}
            />
            <button style={outlineButton} disabled={busy} onClick={() => decide({ fp: item.fp, action: 'park', note: reason || undefined })}>
              Put on hold
            </button>
            <button style={ghostButton} onClick={() => setMode('idle')}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {canDecide && mode === 'idle' && item.shown === 'answer' &&
          (item.options ?? []).map((opt) => (
            <button key={opt} style={outlineButton} disabled={busy} onClick={() => decide({ fp: item.fp, action: 'answer', answer: opt })}>
              {opt}
            </button>
          ))}
        {canDecide && mode === 'idle' && item.shown === 'agent' && (
          <>
            <button style={outlineButton} onClick={copyOne} title="Copy a prompt for this one item">
              {copied === 'ok' ? 'Copied ✓' : copied === 'failed' ? 'Copy failed' : 'Copy prompt'}
            </button>
            <button style={ghostButton} disabled={busy} onClick={() => decide({ fp: item.fp, action: 'done' })}>
              It's fixed
            </button>
            <button style={ghostButton} disabled={busy} onClick={() => decide({ fp: item.fp, action: 'dismiss' })}>
              False alarm
            </button>
          </>
        )}
        {canDecide && mode === 'idle' && item.shown !== 'hold' && (
          <button style={ghostButton} onClick={() => setMode('later')}>Later…</button>
        )}
        {canDecide && item.shown === 'hold' && (
          <button style={ghostButton} disabled={busy} onClick={() => decide({ fp: item.fp, action: 'unhold' })}>
            Bring back
          </button>
        )}
        <span style={{ flex: 1 }} />
        {hasDetail && (
          <button style={ghostButton} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide details' : 'Details'}
          </button>
        )}
      </div>
    </article>
  )
}
