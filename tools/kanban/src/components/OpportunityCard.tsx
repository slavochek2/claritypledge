import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Opportunity, OpportunityType } from '../lib/types'
import { OpportunityDialog } from './OpportunityDialog'

interface OpportunityCardProps {
  opp: Opportunity
  worktreePath?: string
}

// One subtle badge per opportunity type — distinct, categorical.
const TYPE_BADGE: Record<OpportunityType, { bg: string; text: string }> = {
  founder: { bg: 'var(--tag-blue-bg)', text: 'var(--tag-blue-text)' },
  coach: { bg: 'var(--tag-green-bg)', text: 'var(--tag-green-text)' },
  'distribution-partner': { bg: 'var(--tag-purple-bg)', text: 'var(--tag-purple-text)' },
  investor: { bg: 'var(--tag-orange-bg)', text: 'var(--tag-orange-text)' },
}

export function OpportunityCard({ opp, worktreePath }: OpportunityCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: opp.id,
    data: { status: opp.stage },
  })
  // dnd-kit's attributes already include role/tabIndex; drop them so our explicit
  // role/tabIndex (below) don't collide (TS2783 duplicate-prop).
  const { role: _dndRole, tabIndex: _dndTabIndex, ...dndAttributes } = attributes

  const badge = opp.type ? TYPE_BADGE[opp.type] : null

  return (
    <>
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        background: isDragging
          ? 'var(--bg-card-dragging)'
          : isHovered
            ? 'var(--bg-card-hover)'
            : 'var(--bg-card)',
        borderRadius: 'var(--radius-card)',
        padding: '10px 10px 12px',
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.9 : 1,
        boxShadow: isDragging ? 'var(--shadow-card-dragging)' : 'var(--shadow-card)',
        zIndex: isDragging ? 100 : 1,
        userSelect: 'none',
        position: 'relative',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="button"
      tabIndex={0}
      onClick={() => { if (!isDragging) setDialogOpen(true) }}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !isDragging) setDialogOpen(true) }}
      {...listeners}
      {...dndAttributes}
    >
      {/* Name */}
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--text-primary)',
          lineHeight: 1.4,
          wordBreak: 'break-word',
          marginBottom: opp.type || opp.next_step || opp.next_date ? 6 : 0,
        }}
      >
        {opp.name}
      </div>

      {/* Type badge */}
      {opp.type && badge && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 20,
            fontSize: 12,
            padding: '0 6px',
            borderRadius: 3,
            fontWeight: 400,
            lineHeight: 1,
            background: badge.bg,
            color: badge.text,
            marginBottom: opp.next_step || opp.next_date ? 6 : 0,
          }}
        >
          {opp.type}
        </span>
      )}

      {/* Next step — plain text */}
      {opp.next_step && (
        <div
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.4,
            wordBreak: 'break-word',
          }}
        >
          → {opp.next_step}
        </div>
      )}

      {/* Next date — muted */}
      {opp.next_date && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
          {opp.next_date}
        </div>
      )}
    </div>
    {dialogOpen && (
      <OpportunityDialog opp={opp} worktreePath={worktreePath} onClose={() => setDialogOpen(false)} />
    )}
    </>
  )
}
