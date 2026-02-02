import { useEffect, useState } from 'react'
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core'
import { Column } from './components/Column'
import { Feature, ColumnId } from './lib/types'

// Only show actionable columns - done items disappear from view
const COLUMNS: { id: ColumnId; title: string; color: string }[] = [
  { id: 'urgent-important', title: 'Urgent + Important', color: '#ef4444' },
  { id: 'important', title: 'Important', color: '#3b82f6' },
  { id: 'in-progress', title: 'In Progress', color: '#f59e0b' },
]

export default function App() {
  const [features, setFeatures] = useState<Feature[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const featureId = active.id as string
    const targetColumn = over.id as ColumnId

    // Find the feature
    const feature = features.find((f) => f.id === featureId)
    if (!feature) return

    // Determine new status and priority based on column
    let newStatus = feature.status
    let newPriority = feature.priority

    if (targetColumn === 'done') {
      newStatus = 'done'
    } else if (targetColumn === 'in-progress') {
      newStatus = 'in-progress'
    } else {
      newStatus = 'backlog'
      newPriority = targetColumn as 'urgent-important' | 'important'
    }

    // Optimistic update
    setFeatures((prev) =>
      prev.map((f) =>
        f.id === featureId ? { ...f, status: newStatus, priority: newPriority } : f
      )
    )

    // Update file
    try {
      const res = await fetch(`/api/features/${encodeURIComponent(featureId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, priority: newPriority }),
      })
      if (!res.ok) throw new Error('Failed to update')
    } catch {
      // Revert on error
      fetchFeatures()
    }
  }

  const getColumnFeatures = (columnId: ColumnId): Feature[] => {
    return features.filter((f) => {
      if (columnId === 'done') return f.status === 'done'
      if (columnId === 'in-progress') return f.status === 'in-progress'
      // Backlog columns: filter by priority
      return f.status === 'backlog' && f.priority === columnId
    })
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        Loading features...
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
      <h1 style={{ marginBottom: 20, fontSize: 24 }}>
        Clarity Kanban
        <span style={{ fontSize: 14, marginLeft: 12, opacity: 0.6 }}>
          {features.length} features
        </span>
      </h1>

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {COLUMNS.map((col) => (
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
