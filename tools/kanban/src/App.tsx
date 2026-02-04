import { useEffect, useState, useMemo } from 'react'
import { DndContext, DragEndEvent, pointerWithin } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { Column } from './components/Column'
import { Feature, Status } from './lib/types'

// Column configuration with visibility and filter options
interface ColumnConfig {
  id: Status
  title: string
  color: string
  defaultHidden?: boolean
  filter?: 'today' | 'before-today'
}

// Notion-style status columns (left-to-right workflow)
// Order: Backlog -> Week -> Today -> Blocked -> In Progress -> Done
const COLUMNS: ColumnConfig[] = [
  { id: 'backlog', title: 'Backlog', color: '#6b7280', defaultHidden: true },
  { id: 'week', title: 'Week', color: '#3b82f6' },
  { id: 'today', title: 'Today', color: '#3b82f6' },
  { id: 'blocked', title: 'Blocked', color: '#ef4444' },
  { id: 'in-progress', title: 'In Progress', color: '#3b82f6' },
  { id: 'done', title: 'Done', color: '#22c55e', filter: 'today' },
]

// Virtual column for "All Done" (older completions)
const ALL_DONE_COLUMN: ColumnConfig = {
  id: 'done',
  title: 'All Done',
  color: '#22c55e',
  defaultHidden: true,
  filter: 'before-today',
}

// Valid column IDs for drop target validation
const VALID_COLUMN_IDS = new Set<Status>(['backlog', 'week', 'today', 'in-progress', 'blocked', 'done'])

const SHOW_BACKLOG_KEY = 'kanban-show-backlog'
const SHOW_ALL_DONE_KEY = 'kanban-show-all-done'

export default function App() {
  const [features, setFeatures] = useState<Feature[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showBacklog, setShowBacklog] = useState(() => {
    const stored = localStorage.getItem(SHOW_BACKLOG_KEY)
    return stored === 'true'
  })
  const [showAllDone, setShowAllDone] = useState(() => {
    const stored = localStorage.getItem(SHOW_ALL_DONE_KEY)
    return stored === 'true'
  })

  const fetchFeatures = async () => {
    try {
      const res = await fetch('/api/features')
      if (!res.ok) throw new Error('Failed to fetch features')
      const data = await res.json()
      setFeatures(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFeatures()
  }, [])

  const toggleShowBacklog = () => {
    setShowBacklog((prev) => {
      const newValue = !prev
      localStorage.setItem(SHOW_BACKLOG_KEY, String(newValue))
      return newValue
    })
  }

  const toggleShowAllDone = () => {
    setShowAllDone((prev) => {
      const newValue = !prev
      localStorage.setItem(SHOW_ALL_DONE_KEY, String(newValue))
      return newValue
    })
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const featureId = active.id as string
    const overId = over.id as string

    const feature = features.find((f) => f.id === featureId)
    if (!feature) return

    // Case 1: Dropped on a column (status change)
    if (VALID_COLUMN_IDS.has(overId as Status)) {
      const newStatus = overId as Status
      if (feature.status === newStatus) return // Same column, no change

      // Optimistic update
      setFeatures((prev) =>
        prev.map((f) => (f.id === featureId ? { ...f, status: newStatus } : f))
      )

      // Update file
      try {
        const res = await fetch(`/api/features/${encodeURIComponent(featureId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        })
        if (!res.ok) throw new Error('Failed to update')
        await fetchFeatures()
      } catch {
        fetchFeatures()
      }
      return
    }

    // Case 2: Dropped on another card (within-column reorder)
    const targetFeature = features.find((f) => f.id === overId)
    if (!targetFeature) return

    // Only allow reordering within same column
    if (feature.status !== targetFeature.status) return

    // Get features in this column sorted by sort_order
    const columnFeatures = features
      .filter((f) => f.status === feature.status)
      .sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity))

    const oldIndex = columnFeatures.findIndex((f) => f.id === featureId)
    const newIndex = columnFeatures.findIndex((f) => f.id === overId)

    if (oldIndex === newIndex) return

    // Calculate new sort_order using fractional ordering
    const reorderedFeatures = arrayMove(columnFeatures, oldIndex, newIndex)
    const newPosition = reorderedFeatures.findIndex((f) => f.id === featureId)

    let newSortOrder: number
    if (newPosition === 0) {
      // First position: use half of the next item's order (or 1.0 if none)
      const nextOrder = reorderedFeatures[1]?.sort_order ?? 2.0
      newSortOrder = nextOrder / 2
    } else if (newPosition === reorderedFeatures.length - 1) {
      // Last position: use prev + 1
      const prevOrder = reorderedFeatures[newPosition - 1]?.sort_order ?? 0
      newSortOrder = prevOrder + 1
    } else {
      // Middle: average of neighbors
      const prevOrder = reorderedFeatures[newPosition - 1]?.sort_order ?? 0
      const nextOrder = reorderedFeatures[newPosition + 1]?.sort_order ?? prevOrder + 2
      newSortOrder = (prevOrder + nextOrder) / 2
    }

    // Optimistic update
    setFeatures((prev) =>
      prev.map((f) => (f.id === featureId ? { ...f, sort_order: newSortOrder } : f))
    )

    // API call
    try {
      const res = await fetch(`/api/features/${encodeURIComponent(featureId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: newSortOrder }),
      })
      if (!res.ok) throw new Error('Failed to update')
    } catch {
      fetchFeatures() // Revert on error
    }
  }

  const getColumnFeatures = (column: ColumnConfig): Feature[] => {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0]

    return features
      .filter((f) => {
        // Must match the column's status
        if (f.status !== column.id) return false

        // Apply filter for Done columns
        if (column.filter === 'today') {
          // Done column: only items completed TODAY
          return f.completed_at === today
        } else if (column.filter === 'before-today') {
          // All Done column: items completed before today (or no completed_at = legacy)
          return !f.completed_at || f.completed_at < today
        }

        return true
      })
      .sort((a, b) => {
        // Sort by sort_order first, then by ID as tiebreaker
        const orderA = a.sort_order ?? Infinity
        const orderB = b.sort_order ?? Infinity
        if (orderA !== orderB) return orderA - orderB
        return a.id.localeCompare(b.id)
      })
  }

  // Build visible columns based on toggles
  const visibleColumns = useMemo(() => {
    let cols = [...COLUMNS]

    // Filter out backlog if not shown
    if (!showBacklog) {
      cols = cols.filter((c) => c.id !== 'backlog')
    }

    // Add "All Done" column if toggled on
    if (showAllDone) {
      cols.push(ALL_DONE_COLUMN)
    }

    return cols
  }, [showBacklog, showAllDone])

  if (loading) {
    // Skeleton loading state
    return (
      <div style={{ padding: 20 }}>
        <div
          style={{
            marginBottom: 20,
            height: 32,
            width: 200,
            background: '#2a2a4a',
            borderRadius: 4,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${visibleColumns.length}, 1fr)`,
            gap: 16,
          }}
        >
          {visibleColumns.map((col) => (
            <div
              key={`${col.id}-${col.filter ?? 'default'}`}
              style={{
                background: '#1a1a2e',
                borderRadius: 8,
                padding: 16,
                minHeight: 300,
              }}
            >
              <div
                style={{
                  height: 24,
                  width: 80,
                  background: '#2a2a4a',
                  borderRadius: 4,
                  marginBottom: 12,
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
              {[1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    height: 80,
                    background: '#2a2a4a',
                    borderRadius: 8,
                    marginBottom: 8,
                    animation: 'pulse 1.5s ease-in-out infinite',
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 0.7; }
          }
        `}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>
        Error: {error}
        <br />
        <button onClick={fetchFeatures} style={{ marginTop: 16 }}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: 20 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <h1 style={{ fontSize: 24, margin: 0 }}>
          Clarity Kanban
          <span style={{ fontSize: 14, marginLeft: 12, opacity: 0.6 }}>
            {features.length} features
          </span>
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={fetchFeatures}
            style={{
              padding: '4px 12px',
              fontSize: 14,
              background: '#2a2a4a',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              opacity: 0.8,
            }}
            title="Refresh (R)"
          >
            ↻
          </button>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={showBacklog}
              onChange={toggleShowBacklog}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: 14, opacity: 0.8 }}>Backlog</span>
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={showAllDone}
              onChange={toggleShowAllDone}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: 14, opacity: 0.8 }}>All Done</span>
          </label>
        </div>
      </div>

      <DndContext collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${visibleColumns.length}, 1fr)`,
            gap: 16,
            alignItems: 'start',
          }}
        >
          {visibleColumns.map((col) => (
            <Column
              key={`${col.id}-${col.filter ?? 'default'}`}
              id={col.id}
              title={col.title}
              color={col.color}
              features={getColumnFeatures(col)}
            />
          ))}
        </div>
      </DndContext>
    </div>
  )
}
