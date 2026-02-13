import { useMemo, useState, useEffect, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CardDialog } from './CardDialog'
import { Feature, FeatureType, Status, Milestone } from '../lib/types'
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
  currentWorktree?: string
}

// Status priority for sorting within groups
const STATUS_ORDER: Record<Status, number> = {
  'in-progress': 0,
  'today': 1,
  'blocked': 2,
  'week': 3,
  'backlog': 4,
  'draft': 5,
  'done': 6,
  'rejected': 7,
}

function sortFeatures(features: Feature[]): Feature[] {
  return [...features].sort((a, b) => {
    // Primary: rank (P141) - treat undefined as Infinity (sorts to end)
    const rankA = a.rank ?? Infinity
    const rankB = b.rank ?? Infinity
    if (rankA !== rankB) return rankA - rankB
    // Fallback: status → id
    const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    if (statusDiff !== 0) return statusDiff
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
  'draft': { bg: 'var(--status-gray-bg)', text: 'var(--status-gray-text)' },
  'rejected': { bg: 'var(--status-gray-bg)', text: 'var(--status-gray-text)' },
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
    data: { workstream: feature.workstream || '__unlinked__' },
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

// --- MilestoneGroup: droppable group with header + rows ---
interface MilestoneGroupProps {
  groupId: string
  name: string
  icon: string
  features: Feature[]
  milestone?: Milestone
  onFeatureUpdate?: () => void
  dropIndicator?: FocusDropIndicator | null
}

function MilestoneGroup({ groupId, name, icon, features, milestone, onFeatureUpdate, dropIndicator }: MilestoneGroupProps) {
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
        {milestone?.summary && (
          <span style={{ fontSize: 'var(--font-size-12)', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            {milestone.summary}
          </span>
        )}
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
export function FocusPage({ features, onFeatureUpdate, dropIndicator, currentWorktree }: FocusPageProps) {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [milestoneError, setMilestoneError] = useState<string | null>(null)

  const fetchMilestones = useCallback(async () => {
    setMilestoneError(null)
    try {
      // Use relative URL - Vite proxy routes /api/* to backend (see vite.config.ts)
      const url = currentWorktree
        ? `/api/milestones?worktree=${encodeURIComponent(currentWorktree)}`
        : '/api/milestones'
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const data = await response.json()
      setMilestones(data)
    } catch (error) {
      console.error('Failed to fetch milestones:', error)
      const message = error instanceof Error ? error.message : 'Failed to load milestones'
      setMilestoneError(message)
    }
  }, [currentWorktree])

  useEffect(() => {
    fetchMilestones()
  }, [fetchMilestones])

  const groups = useMemo(() => {
    const milestoneMap = new Map<string, Feature[]>()
    const unlinked: Feature[] = []

    for (const feature of features) {
      if (feature.status === 'done' || feature.status === 'rejected') continue
      if (feature.milestone) {
        const existing = milestoneMap.get(feature.milestone)
        if (existing) {
          existing.push(feature)
        } else {
          milestoneMap.set(feature.milestone, [feature])
        }
      } else {
        unlinked.push(feature)
      }
    }

    // Sort groups by milestone status (active → next → future, then by ID)
    const milestoneStatusOrder = { active: 0, next: 1, future: 2 }
    const sortedGroups = Array.from(milestoneMap.entries()).sort(([aId], [bId]) => {
      const aMilestone = milestones.find(m => m.id === aId)
      const bMilestone = milestones.find(m => m.id === bId)

      // Sort by status first
      if (aMilestone && bMilestone) {
        const statusDiff = milestoneStatusOrder[aMilestone.status] - milestoneStatusOrder[bMilestone.status]
        if (statusDiff !== 0) return statusDiff
      }

      // Fallback to ID
      return aId.localeCompare(bId)
    })

    return { sortedGroups, unlinked }
  }, [features, milestones])

  return (
    <div style={{ padding: 'var(--spacing-12) var(--spacing-16)' }}>
      {milestoneError && (
        <div
          style={{
            padding: 'var(--spacing-12)',
            marginBottom: 'var(--spacing-16)',
            background: 'var(--status-red-bg)',
            border: '1px solid var(--status-red-text)',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ color: 'var(--status-red-text)', fontSize: 'var(--font-size-14)' }}>
            {milestoneError}
          </span>
          <button
            onClick={fetchMilestones}
            style={{
              padding: '6px 12px',
              background: 'var(--status-red-text)',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              fontSize: 'var(--font-size-12)',
              fontWeight: 'var(--font-weight-medium)',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}
      {groups.sortedGroups.map(([milestoneId, feats]) => {
        const milestone = milestones.find(m => m.id === milestoneId)
        return (
          <MilestoneGroup
            key={milestoneId}
            groupId={milestoneId}
            name={milestone?.title || milestoneId}
            icon={'\u{1F3AF}'}
            features={feats}
            milestone={milestone}
            onFeatureUpdate={onFeatureUpdate}
            dropIndicator={dropIndicator}
          />
        )
      })}

      <MilestoneGroup
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
