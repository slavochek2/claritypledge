import { useEffect, useState, useCallback } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  pointerWithin,
  useSensor,
  useSensors,
  PointerSensor,
} from '@dnd-kit/core'
import { Column } from './Column'
import { OpportunityCard } from './OpportunityCard'
import type { DropIndicator } from '../App'
import type { Feature, Status, Opportunity, OpportunityStage } from '../lib/types'

// Pipeline CRM columns (ordered left → right)
interface PipelineColumn {
  id: OpportunityStage
  title: string
  color: string
}

const PIPELINE_COLUMNS: PipelineColumn[] = [
  { id: 'contacted',       title: 'Contacted',       color: '#6b7280' },
  { id: 'in-conversation', title: 'In Conversation',  color: '#3b82f6' },
  { id: 'qualified',       title: 'Qualified',        color: '#f59e0b' },
  { id: 'committed',       title: 'Committed',        color: '#8b5cf6' },
  { id: 'active',          title: 'Active',           color: '#22c55e' },
  { id: 'closed',          title: 'Closed',           color: '#6b7280' },
]

const VALID_PIPELINE_IDS = new Set<OpportunityStage>(PIPELINE_COLUMNS.map((c) => c.id))

// Opportunities reuse Column's droppable + sortable wiring, but render via a
// dedicated OpportunityCard (passed as renderCard) — NOT the feature <Card>,
// which would show feature chrome (rank badge, tag-styled fields). This minimal
// cast carries only what the column's SortableContext + drop logic need
// (id, status, title); display fields come from the real Opportunity.
function opportunityToFeature(opp: Opportunity, index: number): Feature {
  return {
    id: opp.id,
    path: opp.path,
    title: opp.name,
    status: opp.stage as unknown as Status,
    rank: index,
    tags: [],
  }
}

interface PipelinePageProps {
  currentWorktree?: string
}

export function PipelinePage({ currentWorktree }: PipelinePageProps) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const buildUrl = useCallback((path: string) => {
    if (currentWorktree) {
      const sep = path.includes('?') ? '&' : '?'
      return `${path}${sep}worktree=${encodeURIComponent(currentWorktree)}`
    }
    return path
  }, [currentWorktree])

  const fetchOpportunities = useCallback(async (refresh = false) => {
    try {
      const url = buildUrl('/api/opportunities')
      const finalUrl = refresh ? `${url}${url.includes('?') ? '&' : '?'}refresh=true` : url
      const res = await fetch(finalUrl)
      if (!res.ok) throw new Error('Failed to fetch opportunities')
      setOpportunities(await res.json())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [buildUrl])

  useEffect(() => { fetchOpportunities() }, [fetchOpportunities])

  const getColumnOpportunities = (stage: OpportunityStage): Opportunity[] =>
    opportunities.filter((o) => o.stage === stage)

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string)

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event
    if (!over) { setDropIndicator(null); return }

    const overId = over.id as string

    if (VALID_PIPELINE_IDS.has(overId as OpportunityStage)) {
      setDropIndicator({ columnId: overId as unknown as Status, beforeId: null })
      return
    }

    const overOpp = opportunities.find((o) => o.id === overId)
    if (overOpp) {
      setDropIndicator({ columnId: overOpp.stage as unknown as Status, beforeId: overId })
    } else {
      setDropIndicator(null)
    }
  }

  const handleDragCancel = () => { setActiveId(null); setDropIndicator(null) }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null)
    setDropIndicator(null)
    const { active, over } = event
    if (!over) return

    const oppId = active.id as string
    const overId = over.id as string
    const opp = opportunities.find((o) => o.id === oppId)
    if (!opp) return

    // Determine target stage
    let newStage: OpportunityStage | null = null
    if (VALID_PIPELINE_IDS.has(overId as OpportunityStage)) {
      newStage = overId as OpportunityStage
    } else {
      const overOpp = opportunities.find((o) => o.id === overId)
      if (overOpp) newStage = overOpp.stage
    }

    if (!newStage || opp.stage === newStage) return
    const targetStage: OpportunityStage = newStage

    setOpportunities((prev) => prev.map((o) => o.id === oppId ? { ...o, stage: targetStage } : o))

    try {
      const res = await fetch(buildUrl(`/api/opportunities/${encodeURIComponent(oppId)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      })
      if (!res.ok) throw new Error('Failed to update')
    } catch { fetchOpportunities() }
  }

  if (loading) return <div style={{ padding: 'var(--spacing-16)', color: 'var(--text-tertiary)' }}>Loading...</div>

  if (error) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--tag-red-text)' }}>
      Error: {error}
      <br />
      <button
        onClick={() => { setLoading(true); fetchOpportunities(true) }}
        style={{ marginTop: 16, padding: '6px 12px', background: 'var(--bg-hover)', border: 'none', borderRadius: '3px', cursor: 'pointer', color: 'var(--text-primary)' }}
      >
        Retry
      </button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Pipeline board header */}
      <div style={{ padding: '0 var(--spacing-16)', flexShrink: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 'var(--spacing-12)',
          borderBottom: '1px solid rgba(55, 53, 47, 0.09)',
        }}>
          <span style={{ fontSize: 'var(--font-size-14)', color: 'var(--text-secondary)' }}>
            CRM Pipeline
          </span>
          <button
            onClick={() => { setLoading(true); fetchOpportunities(true) }}
            title="Refresh"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, background: 'none', border: 'none',
              borderRadius: '4px', cursor: 'pointer', fontSize: 16,
              color: 'var(--text-secondary)', transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            ↻
          </button>
        </div>
      </div>

      {/* Pipeline kanban columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div style={{ padding: 'var(--spacing-12) var(--spacing-16)', overflowX: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', gap: 'var(--spacing-8)', alignItems: 'flex-start' }}>
            {PIPELINE_COLUMNS.map((col) => {
              const colOpps = getColumnOpportunities(col.id)
              const colFeatures = colOpps.map((o, i) => opportunityToFeature(o, i))
              const oppById = new Map(colOpps.map((o) => [o.id, o]))
              const colDropIndicator = dropIndicator?.columnId === (col.id as unknown as Status)
                ? dropIndicator
                : null

              return (
                <Column
                  key={col.id}
                  id={col.id as unknown as Status}
                  title={col.title}
                  color={col.color}
                  features={colFeatures}
                  dropIndicator={colDropIndicator}
                  isDragging={activeId !== null}
                  onFeatureUpdate={() => fetchOpportunities()}
                  renderCard={(f) => {
                    const opp = oppById.get(f.id)
                    return opp ? <OpportunityCard opp={opp} /> : null
                  }}
                />
              )
            })}
          </div>
        </div>
      </DndContext>
    </div>
  )
}
