import { useMemo } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Card } from './Card'
import { Feature, Status } from '../lib/types'

interface FocusPageProps {
  features: Feature[]
}

// Status priority for sorting within groups
const STATUS_ORDER: Record<Status, number> = {
  'in-progress': 0,
  'today': 1,
  'blocked': 2,
  'week': 3,
  'backlog': 4,
  'done': 5,
}

const PRIORITY_ORDER: Record<string, number> = {
  'p0': 0,
  'p1': 1,
  'p2': 2,
  'p3': 3,
}

function sortFeatures(features: Feature[]): Feature[] {
  return [...features].sort((a, b) => {
    // Sort by status priority first
    const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    if (statusDiff !== 0) return statusDiff

    // Then by priority (p0 first, no priority last)
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
    if (count) {
      parts.push(`${count} ${status}`)
    }
  }
  return parts.join(', ')
}

interface HypothesisGroupProps {
  name: string
  icon: string
  features: Feature[]
}

function HypothesisGroup({ name, icon, features }: HypothesisGroupProps) {
  const sorted = useMemo(() => sortFeatures(features), [features])
  const summary = useMemo(() => getStatusSummary(features), [features])

  return (
    <div style={{ marginBottom: 'var(--spacing-16)' }}>
      {/* Group header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-8)',
          marginBottom: 'var(--spacing-8)',
          padding: '0 var(--spacing-4)',
        }}
      >
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span
          style={{
            fontSize: 'var(--font-size-14)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--text-primary)',
          }}
        >
          {name}
        </span>
        <span
          style={{
            fontSize: 'var(--font-size-12)',
            color: 'var(--text-tertiary)',
          }}
        >
          {features.length} feature{features.length !== 1 ? 's' : ''}
          {summary && ` (${summary})`}
        </span>
      </div>

      {/* Cards grid — wrap in columns */}
      <SortableContext items={sorted.map(f => f.id)} strategy={verticalListSortingStrategy}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 'var(--spacing-8)',
          }}
        >
          {sorted.map((feature) => (
            <Card key={feature.id} feature={feature} />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

export function FocusPage({ features }: FocusPageProps) {
  // Same 5px activation constraint as Board — allows clicks to work on cards
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  const groups = useMemo(() => {
    const hypothesisMap = new Map<string, Feature[]>()
    const unlinked: Feature[] = []

    for (const feature of features) {
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

    // Sort hypothesis groups by name
    const sortedGroups = Array.from(hypothesisMap.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    )

    return { sortedGroups, unlinked }
  }, [features])

  return (
    <DndContext sensors={sensors}>
      <div style={{ padding: 'var(--spacing-12) var(--spacing-16)' }}>
        {groups.sortedGroups.map(([hypothesis, features]) => (
          <HypothesisGroup
            key={hypothesis}
            name={hypothesis}
            icon={'\u{1F3AF}'}
            features={features}
          />
        ))}

        {groups.unlinked.length > 0 && (
          <HypothesisGroup
            name="Unlinked"
            icon={'\u{1F4E6}'}
            features={groups.unlinked}
          />
        )}

        {groups.sortedGroups.length === 0 && groups.unlinked.length === 0 && (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: 'var(--text-tertiary)',
            }}
          >
            No features found.
          </div>
        )}
      </div>
    </DndContext>
  )
}
