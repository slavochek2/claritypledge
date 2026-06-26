import { useEffect, useState } from 'react'
import { Opportunity } from '../lib/types'

interface OpportunityDialogProps {
  opp: Opportunity
  worktreePath?: string
  onClose: () => void
}

const STAGE_LABELS: Record<string, string> = {
  contacted: 'Contacted',
  'in-conversation': 'In Conversation',
  qualified: 'Qualified',
  committed: 'Committed',
  active: 'Active',
  closed: 'Closed',
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
      <span style={{ width: 90, flexShrink: 0, fontSize: 13, color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ fontSize: 14, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}

export function OpportunityDialog({ opp, worktreePath, onClose }: OpportunityDialogProps) {
  const [notes, setNotes] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const url = worktreePath
      ? `/api/opportunities/${encodeURIComponent(opp.id)}/content?worktree=${encodeURIComponent(worktreePath)}`
      : `/api/opportunities/${encodeURIComponent(opp.id)}/content`
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setNotes(typeof d.content === 'string' ? d.content.trim() : ''))
      .catch(() => setNotes(''))
      .finally(() => setLoading(false))
  }, [opp.id, worktreePath])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const openInEditor = async () => {
    try {
      await fetch('/api/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: opp.path }),
      })
    } catch (e) {
      console.error('Failed to open in editor:', e)
    }
  }

  return (
    <>
      {/* Backdrop — sibling, not parent, so the panel's clicks don't need stopPropagation */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Close dialog"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') onClose() }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(15, 15, 15, 0.4)', zIndex: 1000 }}
      />
      <div
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          background: 'var(--bg-card)', borderRadius: 8, width: 'min(560px, 92vw)',
          maxHeight: '85vh', overflowY: 'auto', padding: 24,
          boxShadow: '0 8px 32px rgba(15,15,15,0.2)', zIndex: 1001,
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16, border: 'none', background: 'transparent',
            fontSize: 18, lineHeight: 1, cursor: 'pointer', color: 'var(--text-tertiary)',
          }}
          aria-label="Close"
        >×</button>

        {/* Name */}
        <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' }}>
          {opp.name}
        </h2>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          <Field label="Type" value={opp.type} />
          <Field label="Stage" value={STAGE_LABELS[opp.stage] ?? opp.stage} />
          <Field label="Next step" value={opp.next_step} />
          <Field label="Next date" value={opp.next_date} />
          <Field label="Contact" value={opp.contact_ref} />
        </div>

        {/* Notes (markdown body) */}
        <div style={{ borderTop: '1px solid var(--border-subtle, #eee)', paddingTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Notes</span>
            <button
              onClick={openInEditor}
              style={{
                border: 'none', background: 'var(--tag-default-bg, #f0f0f0)', color: 'var(--text-secondary)',
                fontSize: 12, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
              }}
              title="Open the .md file in your editor to edit notes"
            >Open in editor</button>
          </div>
          {loading ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading…</p>
          ) : notes ? (
            <pre style={{
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit',
              fontSize: 14, color: 'var(--text-primary)', margin: 0, lineHeight: 1.5,
            }}>{notes}</pre>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
              No notes yet — click “Open in editor” to add some.
            </p>
          )}
        </div>
      </div>
    </>
  )
}
