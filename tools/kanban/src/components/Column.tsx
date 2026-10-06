import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Card } from './Card'
import { Feature, ColumnId } from '../lib/types'
import type { DropIndicator } from '../App'
import { statusStyleFor, wipCountColour } from '../lib/columnColours'

interface ColumnProps {
  id: ColumnId
  title: string
  color: string
  features: Feature[]
  // Advisory WIP limit for this column (from KANBAN_WIP_LIMITS). When set, the
  // header reads "N / limit" and the count is tinted at or over the limit.
  // Nothing is blocked — the limit exists to make the trade-off visible at the
  // moment of the drag, not to refuse it.
  limit?: number
  dropIndicator: DropIndicator | null
  isDragging: boolean
  onFeatureUpdate?: () => void
  // Optional custom card renderer. When provided, used instead of the default
  // feature <Card> — lets the Pipeline board render opportunity cards while
  // reusing this column's droppable + sortable wiring. Feature board omits it.
  renderCard?: (feature: Feature) => ReactNode
}

// Drop indicator line component
function DropLine() {
  return (
    <div
      style={{
        height: 2,
        background: 'var(--cp-blue)',
        borderRadius: 1,
        margin: '3px 0',
      }}
    />
  )
}

export function Column({ id, title, color, features, limit, dropIndicator, isDragging: _isDragging, onFeatureUpdate, renderCard }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const featureIds = features.map((f) => f.id)
  const statusStyle = statusStyleFor(color)

  // Should show indicator at the end of the column (when dropping on empty area or at bottom)
  const showIndicatorAtEnd = dropIndicator && dropIndicator.beforeId === null

  return (
    <div
      ref={setNodeRef}
      style={{
        background: isOver ? 'var(--bg-column-hover)' : 'var(--bg-column)',
        borderRadius: 'var(--cp-r)',
        padding: '0 var(--spacing-6)',
        minHeight: 100,
        width: 260,
        flexShrink: 0,
        transition: 'background 0.1s ease',
      }}
    >
      {/* Column Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-6)',
          height: 32,
          marginBottom: 'var(--spacing-4)',
        }}
      >
        {/* Status pill */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: 'var(--font-size-14)',
            fontWeight: 'var(--font-weight-semibold)',
            color: statusStyle.text,
            background: statusStyle.bg,
            padding: '0 var(--spacing-8)',
            height: 22,
            borderRadius: 99,
            lineHeight: 1,
          }}
        >
          {title}
        </span>

        {/* Count - plain text, with the WIP limit when one is configured */}
        <span
          style={{
            fontSize: 'var(--font-size-14)',
            color: wipCountColour(features.length, limit),
            fontWeight:
              limit !== undefined && features.length >= limit
                ? 'var(--font-weight-semibold)'
                : 'var(--font-weight-regular)',
          }}
          title={
            limit === undefined
              ? undefined
              : features.length > limit
                ? `Over the WIP limit (${features.length} of ${limit}) — something here needs a decision`
                : features.length === limit
                  ? `At the WIP limit (${limit}) — adding one means moving one out`
                  : `${features.length} of ${limit}`
          }
        >
          {limit === undefined ? features.length : `${features.length} / ${limit}`}
        </span>
      </div>

      {/* Cards */}
      <SortableContext items={featureIds} strategy={verticalListSortingStrategy}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
          {features.map((feature) => (
            <div key={feature.id}>
              {/* Show drop indicator before this card */}
              {dropIndicator?.beforeId === feature.id && <DropLine />}
              {renderCard ? renderCard(feature) : <Card feature={feature} onFeatureUpdate={onFeatureUpdate} />}
            </div>
          ))}
          {/* Show drop indicator at end of column */}
          {showIndicatorAtEnd && <DropLine />}
        </div>
      </SortableContext>
    </div>
  )
}
