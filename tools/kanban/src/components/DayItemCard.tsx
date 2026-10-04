// P1399: one item on the Day page — a card the founder can act on.
//
// PRIVACY: item text lives only in props and React state; nothing here is persisted.

import { useState, type ReactNode } from 'react'
import { addDays, formatDay, ghostButton, outlineButton } from './dayUi'
import { daysOpen, type DayDecision, type ShownItem } from '../lib/day'

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
  return <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-12)', whiteSpace: 'nowrap' }}>{children}</span>
}

interface Props {
  item: ShownItem
  runDate: string
  /** false on an earlier run: read-only */
  canDecide: boolean
  onDecide: (d: DecisionInput) => Promise<boolean>
}

type Mode = 'idle' | 'park' | 'snooze'

export function DayItemCard({ item, runDate, canDecide, onDecide }: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('idle')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const age = daysOpen(item, runDate)
  const accent = item.shown === 'answer' ? 'var(--tag-orange-text)' : item.shown === 'agent' ? 'var(--tag-blue-text)' : 'var(--text-tertiary)'

  const decide = async (d: DecisionInput) => {
    setBusy(true)
    const ok = await onDecide(d)
    setBusy(false)
    if (ok) {
      setMode('idle')
      setReason('')
    }
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
        borderLeft: `3px solid ${accent}`,
        padding: '10px 12px 6px 12px',
        opacity: busy ? 0.6 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <AreaTag area={item.area} />
        {item.synthetic && <Meta>{item.fp.startsWith('check:') ? 'from the check list, no write-up' : 'check did not finish'}</Meta>}
        <span style={{ flex: 1 }} />
        {item.deadline && (
          <span
            style={{ color: 'var(--tag-orange-text)', fontSize: 'var(--font-size-12)', fontWeight: 600, whiteSpace: 'nowrap' }}
            title={item.deadline_label}
          >
            by {formatDay(item.deadline)}
            {item.deadline_label ? ` · ${item.deadline_label}` : ''}
          </span>
        )}
        {age !== null && age > 0 && <Meta>open {age} {age === 1 ? 'day' : 'days'}</Meta>}
      </div>

      <div style={{ fontWeight: 600, lineHeight: 1.4, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{item.title}</div>
      {item.why && (
        <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 2, overflowWrap: 'anywhere' }}>{item.why}</div>
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
              <div style={{ color: 'var(--text-tertiary)' }}>What the check returned</div>
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'SFMono-Regular, Menlo, monospace', color: 'var(--text-primary)', marginBottom: 6 }}>
                {item.evidence}
              </div>
            </>
          )}
          {item.prompt && (
            <>
              <div style={{ color: 'var(--text-tertiary)' }}>What the agent will be asked</div>
              <div style={{ overflowWrap: 'anywhere', color: 'var(--text-primary)' }}>{item.prompt}</div>
            </>
          )}
        </div>
      )}

      {mode === 'park' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <input
            autoFocus
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') decide({ fp: item.fp, action: 'park', note: reason || undefined })
              if (e.key === 'Escape') setMode('idle')
            }}
            placeholder="Why wait? (optional, shown on the card)"
            aria-label="Reason for putting this on hold"
            style={{
              flex: '1 1 220px',
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
      )}

      {mode === 'snooze' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Meta>Ask me again</Meta>
          <button style={outlineButton} disabled={busy} onClick={() => decide({ fp: item.fp, action: 'snooze', until: addDays(runDate, 1), note: 'Snoozed until tomorrow' })}>
            tomorrow
          </button>
          <button style={outlineButton} disabled={busy} onClick={() => decide({ fp: item.fp, action: 'snooze', until: addDays(runDate, 7), note: 'Snoozed for a week' })}>
            in a week
          </button>
          <button style={ghostButton} onClick={() => setMode('idle')}>Cancel</button>
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
            <button style={ghostButton} disabled={busy} onClick={() => decide({ fp: item.fp, action: 'done' })} title="It has been fixed">
              Fixed
            </button>
            <button style={ghostButton} disabled={busy} onClick={() => decide({ fp: item.fp, action: 'dismiss' })} title="It was a false alarm">
              Not a problem
            </button>
          </>
        )}
        {canDecide && mode === 'idle' && item.shown !== 'hold' && (
          <>
            <button style={ghostButton} onClick={() => setMode('snooze')}>Snooze</button>
            <button style={ghostButton} onClick={() => setMode('park')}>Hold</button>
          </>
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
