import { useEffect, useState } from 'react'
import { DndContext, DragEndEvent, pointerWithin } from '@dnd-kit/core'
import { Column } from './components/Column'
import { Feature, ColumnId, Status } from './lib/types'

// Notion-style status columns (left-to-right workflow)
const COLUMNS: { id: ColumnId; title: string; color: string }[] = [
  { id: 'week', title: 'Week', color: '#3b82f6' },
  { id: 'today', title: 'Today', color: '#f97316' },
  { id: 'in-progress', title: 'In Progress', color: '#f59e0b' },
  { id: 'blocked', title: 'Blocked', color: '#ef4444' },
  { id: 'done', title: 'Done', color: '#22c55e' },
]

// Valid column IDs for drop target validation
const VALID_COLUMN_IDS = new Set(COLUMNS.map((c) => c.id))

const HIDE_DONE_KEY = 'kanban-hide-done'

export default function App() {
  const [features, setFeatures] = useState<Feature[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hideDone, setHideDone] = useState(() => {
    const stored = localStorage.getItem(HIDE_DONE_KEY)
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

    // Set up SSE for file changes
    const eventSource = new EventSource('/api/events')
    eventSource.onmessage = () => {
      fetchFeatures()
    }
    return () => eventSource.close()
  }, [])

  const toggleHideDone = () => {
    setHideDone((prev) => {
      const newValue = !prev
      localStorage.setItem(HIDE_DONE_KEY, String(newValue))
      return newValue
    })
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const featureId = active.id as string
    const targetId = over.id as string

    // Validate drop target is a column, not another card
    if (!VALID_COLUMN_IDS.has(targetId as ColumnId)) return

    const targetColumn = targetId as ColumnId

    // Find the feature
    const feature = features.find((f) => f.id === featureId)
    if (!feature) return

    // Column ID is the new status (simple mapping)
    const newStatus: Status = targetColumn

    // Skip if status unchanged
    if (feature.status === newStatus) return

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
    } catch {
      // Revert on error
      fetchFeatures()
    }
  }

  const getColumnFeatures = (columnId: ColumnId): Feature[] => {
    // Simple: status matches column ID
    return features.filter((f) => f.status === columnId)
  }

  // Filter visible columns based on hideDone toggle
  const visibleColumns = hideDone
    ? COLUMNS.filter((col) => col.id !== 'done')
    : COLUMNS

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
              key={col.id}
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
            checked={hideDone}
            onChange={toggleHideDone}
            style={{ cursor: 'pointer' }}
          />
          <span style={{ fontSize: 14, opacity: 0.8 }}>Hide Done</span>
        </label>
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
              key={col.id}
              id={col.id}
              title={col.title}
              color={col.color}
              features={getColumnFeatures(col.id)}
            />
          ))}
        </div>
      </DndContext>
    </div>
  )
}
