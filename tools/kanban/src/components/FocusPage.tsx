import { useMemo, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CardDialog } from './CardDialog'
import { Feature, FeatureType, Status } from '../lib/types'
import type { FocusDropIndicator } from '../App'

const TYPE_PREFIX: Record<FeatureType, string> = {
  story: '[US]',
  task: '[T]',
  bug: '[B]',
  comment: '[C]',
}

interface FocusPageProps {
  features: Feature[]
  onFeatureUpdate?: () => void
  dropIndicator?: FocusDropIndicator | null
}

// Status priority for sorting within groups
const STATUS_ORDER: Record<Status, number> = {
  'in-progress': 0,
  'today': 1,
  'blocked': 2,
  'week': 3,
  'backlog': 4,
  'done': 5,
  'rejected': 6,
}

const PRIORITY_ORDER: Record<string, number> = {
  'p0': 0,
  'p1': 1,
  'p2': 2,
  'p3': 3,
}

function sortFeatures(features: Feature[]): Feature[] {
  return [...features].sort((a, b) => {
    // Primary: manual sort_order (drag to reorder)
    const orderA = a.sort_order ?? 1000000
    const orderB = b.sort_order ?? 1000000
    if (orderA !== orderB) return orderA - orderB
    // Fallback: status → priority → id
    const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    if (statusDiff !== 0) return statusDiff
    const aPri = a.priority ? PRIORITY_ORDER[a.priority] : 99
    const bPri = b.priority ? PRIORITY_ORDER[b.priority] : 99
    if (aPri !== bPri) return aPri - bPri
    return a.id.localeCompare(b.id)
  })
}

function getStatusSummary(features: Feature[]): string {
  const counts: Partial<Record<Status, number>> = {}
  for (const f of features) {
    counts[f.status] = (counts[f.status] || 0) + 1
  }
  const parts: string[] = []
  const displayOrder: Status[] = ['in-progress', 'today', 'blocked', 'week', 'backlog', 'done']
  for (const status of displayOrder) {
    const count = counts[status]
    if (count) parts.push(`${count} ${status}`)
  }
  return parts.join(', ')
}

// Status badge colors matching the board Column styles
const STATUS_COLORS: Record<Status, { bg: string; text: string }> = {
  'backlog': { bg: 'var(--status-gray-bg)', text: 'var(--status-gray-text)' },
  'week': { bg: 'var(--status-gray-bg)', text: 'var(--status-gray-text)' },
  'today': { bg: 'var(--status-green-bg)', text: 'var(--status-green-text)' },
  'blocked': { bg: 'var(--status-red-bg)', text: 'var(--status-red-text)' },
  'in-progress': { bg: 'var(--status-blue-bg)', text: 'var(--status-blue-text)' },
  'done': { bg: 'var(--status-green-bg)', text: 'var(--status-green-text)' },
  'rejected': { bg: 'var(--status-gray-bg)', text: 'var(--status-gray-text)' },
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  p0: { bg: 'var(--tag-red-bg)', text: 'var(--tag-red-text)' },
  p1: { bg: 'var(--tag-orange-bg)', text: 'var(--tag-orange-text)' },
  p2: { bg: 'var(--tag-gray-bg)', text: 'var(--tag-gray-text)' },
  p3: { bg: 'var(--tag-gray-bg)', text: 'var(--tag-gray-text)' },
}

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 20,
  fontSize: 12,
  padding: '0 6px',
  borderRadius: 3,
  fontWeight: 400,
  whiteSpace: 'nowrap',
  lineHeight: 1,
}

const cellStyle: React.CSSProperties = {
  padding: '0 var(--spacing-8)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

// Drop indicator line - Notion style (matches Board's DropLine)
function DropLine() {
  return (
    <div
      style={{
        height: 2,
        background: 'rgba(35, 131, 226, 0.57)',
        borderRadius: 1,
        margin: '1px 0',
      }}
    />
  )
}

// --- FocusRow: draggable table row ---
interface FocusRowProps {
  feature: Feature
  onFeatureUpdate?: () => void
}

function FocusRow({ feature, onFeatureUpdate }: FocusRowProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: feature.id,
    data: { hypothesis: feature.hypothesis || '__unlinked__' },
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    display: 'flex',
    alignItems: 'center',
    height: 34,
    borderBottom: '1px solid var(--border-table)',
    background: isDragging
      ? 'var(--bg-card-dragging)'
      : isHovered
        ? 'var(--bg-table-row-hover)'
        : 'transparent',
    cursor: isDragging ? 'grabbing' : 'pointer',
    opacity: isDragging ? 0.9 : 1,
    zIndex: isDragging ? 100 : 1,
    userSelect: 'none',
    fontSize: 'var(--font-size-14)',
  }

  const statusColors = STATUS_COLORS[feature.status]
  const priorityColors = feature.priority ? PRIORITY_COLORS[feature.priority] : null

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => {
          if (!isDragging) setDialogOpen(true)
        }}
        {...listeners}
        {...attributes}
      >
        {/* Name */}
        <div style={{ ...cellStyle, flex: 1, minWidth: 0, fontWeight: 'var(--font-weight-regular)' as never }}>
          {feature.type ? `${TYPE_PREFIX[feature.type]} ` : ''}{feature.title}
        </div>

        {/* Priority */}
        <div style={{ ...cellStyle, width: 50, flexShrink: 0, textAlign: 'center' }}>
          {priorityColors && (
            <span style={{ ...pillStyle, background: priorityColors.bg, color: priorityColors.text }}>
              {feature.priority}
            </span>
          )}
        </div>

        {/* Status */}
        <div style={{ ...cellStyle, width: 100, flexShrink: 0, textAlign: 'center' }}>
          <span style={{ ...pillStyle, background: statusColors.bg, color: statusColors.text }}>
            {feature.status}
          </span>
        </div>

        {/* Spec readiness — own column, only for planning statuses */}
        <div style={{ ...cellStyle, width: 70, flexShrink: 0, textAlign: 'center' }}>
          {['backlog', 'week', 'today'].includes(feature.status) && (
            <span
              style={{
                ...pillStyle,
                background: feature.prepped ? 'var(--tag-green-bg)' : 'var(--tag-gray-bg)',
                color: feature.prepped ? 'var(--tag-green-text)' : 'var(--text-secondary)',
              }}
            >
              {feature.prepped ? 'prepped' : 'draft'}
            </span>
          )}
        </div>

        {/* Tags */}
        <div style={{ ...cellStyle, width: 150, flexShrink: 0, display: 'flex', gap: 4, alignItems: 'center' }}>
          {feature.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              style={{
                ...pillStyle,
                background: 'var(--tag-default-bg)',
                color: 'var(--tag-default-text)',
                maxWidth: 70,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {tag}
            </span>
          ))}
          {feature.tags.length > 2 && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              +{feature.tags.length - 2}
            </span>
          )}
        </div>
      </div>

      {dialogOpen && (
        <CardDialog
          feature={feature}
          onClose={() => setDialogOpen(false)}
          onUpdate={onFeatureUpdate}
        />
      )}
    </>
  )
}

// --- HypothesisGroup: droppable group with header + rows ---
interface HypothesisGroupProps {
  groupId: string
  name: string
  icon: string
  features: Feature[]
  onFeatureUpdate?: () => void
  dropIndicator?: FocusDropIndicator | null
}

function HypothesisGroup({ groupId, name, icon, features, onFeatureUpdate, dropIndicator }: HypothesisGroupProps) {
  const sorted = useMemo(() => sortFeatures(features), [features])
  const summary = useMemo(() => getStatusSummary(features), [features])
  const { setNodeRef, isOver } = useDroppable({ id: `group:${groupId}` })

  return (
    <div
      ref={setNodeRef}
      style={{
        marginBottom: 'var(--spacing-16)',
        borderRadius: 4,
        border: isOver ? '1px solid rgba(35, 131, 226, 0.4)' : '1px solid transparent',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Group header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-8)',
          padding: 'var(--spacing-6) var(--spacing-8)',
          background: 'var(--bg-group-header)',
          borderRadius: '4px 4px 0 0',
          borderBottom: '1px solid var(--border-table)',
        }}
      >
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span
          style={{
            fontSize: 'var(--font-size-14)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--text-primary)',
          }}
        >
          {name}
        </span>
        <span style={{ fontSize: 'var(--font-size-12)', color: 'var(--text-tertiary)' }}>
          {features.length} feature{features.length !== 1 ? 's' : ''}
          {summary && ` (${summary})`}
        </span>
      </div>

      {/* Column headers */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 28,
          borderBottom: '1px solid var(--border-table)',
          fontSize: 'var(--font-size-12)',
          fontWeight: 'var(--font-weight-medium)',
          color: 'var(--text-tertiary)',
        }}
      >
        <div style={{ ...cellStyle, flex: 1 }}>Name</div>
        <div style={{ ...cellStyle, width: 50, flexShrink: 0, textAlign: 'center' }}>Prio</div>
        <div style={{ ...cellStyle, width: 100, flexShrink: 0, textAlign: 'center' }}>Status</div>
        <div style={{ ...cellStyle, width: 70, flexShrink: 0, textAlign: 'center' }}>Spec</div>
        <div style={{ ...cellStyle, width: 150, flexShrink: 0 }}>Tags</div>
      </div>

      {/* Rows */}
      <SortableContext items={sorted.map((f) => f.id)} strategy={verticalListSortingStrategy}>
        {sorted.map((feature) => (
          <div key={feature.id}>
            {dropIndicator?.groupId === groupId && dropIndicator?.beforeId === feature.id && <DropLine />}
            <FocusRow feature={feature} onFeatureUpdate={onFeatureUpdate} />
          </div>
        ))}
        {dropIndicator?.groupId === groupId && dropIndicator?.beforeId === null && <DropLine />}
      </SortableContext>

      {features.length === 0 && (
        <div
          style={{
            padding: 'var(--spacing-12)',
            textAlign: 'center',
            color: 'var(--text-placeholder)',
            fontSize: 'var(--font-size-12)',
          }}
        >
          Drop features here
        </div>
      )}
    </div>
  )
}

// --- FocusPage ---
export function FocusPage({ features, onFeatureUpdate, dropIndicator }: FocusPageProps) {
  const groups = useMemo(() => {
    const hypothesisMap = new Map<string, Feature[]>()
    const unlinked: Feature[] = []

    for (const feature of features) {
      if (feature.status === 'done' || feature.status === 'rejected') continue
      if (feature.hypothesis) {
        const existing = hypothesisMap.get(feature.hypothesis)
        if (existing) {
          existing.push(feature)
        } else {
          hypothesisMap.set(feature.hypothesis, [feature])
        }
      } else {
        unlinked.push(feature)
      }
    }

    const sortedGroups = Array.from(hypothesisMap.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    )

    return { sortedGroups, unlinked }
  }, [features])

  return (
    <div style={{ padding: 'var(--spacing-12) var(--spacing-16)' }}>
      {groups.sortedGroups.map(([hypothesis, feats]) => (
        <HypothesisGroup
          key={hypothesis}
          groupId={hypothesis}
          name={hypothesis}
          icon={'\u{1F3AF}'}
          features={feats}
          onFeatureUpdate={onFeatureUpdate}
          dropIndicator={dropIndicator}
        />
      ))}

      <HypothesisGroup
        groupId="__unlinked__"
        name="Unlinked"
        icon={'\u{1F4E6}'}
        features={groups.unlinked}
        onFeatureUpdate={onFeatureUpdate}
        dropIndicator={dropIndicator}
      />

      {groups.sortedGroups.length === 0 && groups.unlinked.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
          No features found.
        </div>
      )}
    </div>
  )
}
