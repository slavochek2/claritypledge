import { useEffect, useState, useMemo, useCallback } from 'react'
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
import { arrayMove } from '@dnd-kit/sortable'
import { Column } from './components/Column'
import { Sidebar, PageId } from './components/Sidebar'
import { FocusPage } from './components/FocusPage'
import { Feature, FeatureType, Status } from './lib/types'

export interface DropIndicator {
  columnId: Status
  beforeId: string | null // Show indicator before this card (null = at end of column)
}

export interface FocusDropIndicator {
  groupId: string
  beforeId: string | null // Show indicator before this row (null = at end of group)
}

interface Worktree {
  path: string
  branch: string
  isCurrent: boolean
}

interface ColumnConfig {
  id: Status
  title: string
  color: string
  defaultHidden?: boolean
  filter?: 'today' | 'before-today'
}

const COLUMNS: ColumnConfig[] = [
  { id: 'backlog', title: 'Backlog', color: '#6b7280', defaultHidden: true },
  { id: 'week', title: 'Week', color: '#6b7280' },
  { id: 'today', title: 'Today', color: '#22c55e' },
  { id: 'blocked', title: 'Blocked', color: '#ef4444' },
  { id: 'in-progress', title: 'In Progress', color: '#3b82f6' },
  { id: 'done', title: 'Done', color: '#22c55e', filter: 'today' },
]

const ALL_DONE_COLUMN: ColumnConfig = {
  id: 'done',
  title: 'All Done',
  color: '#22c55e',
  defaultHidden: true,
  filter: 'before-today',
}

const VALID_COLUMN_IDS = new Set<Status>(['backlog', 'week', 'today', 'in-progress', 'blocked', 'done'])

type ViewMode = 'active' | 'backlog' | 'all-done'
const VIEW_MODE_KEY = 'kanban-view-mode'
const TYPE_FILTER_KEY = 'kanban-type-filter'
const WORKTREE_KEY = 'kanban-worktree'
const PAGE_KEY = 'kanban-page'
const SIDEBAR_COLLAPSED_KEY = 'kanban-sidebar-collapsed'

type TypeFilter = FeatureType | 'all'

const TYPE_CHIPS: { id: TypeFilter; label: string; color: string }[] = [
  { id: 'all', label: 'All', color: 'var(--tag-gray-bg)' },
  { id: 'bug', label: 'Bug', color: 'var(--tag-red-bg)' },
  { id: 'task', label: 'Task', color: 'var(--tag-blue-bg)' },
  { id: 'story', label: 'Story', color: 'var(--tag-green-bg)' },
]

export default function App() {
  const [features, setFeatures] = useState<Feature[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null)
  const [focusDropIndicator, setFocusDropIndicator] = useState<FocusDropIndicator | null>(null)
  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const [selectedWorktree, setSelectedWorktree] = useState<string | null>(() => {
    return localStorage.getItem(WORKTREE_KEY)
  })

  // Require 5px movement before drag starts - allows clicks to work
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  )
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem(VIEW_MODE_KEY)
    if (stored === 'backlog' || stored === 'all-done') return stored
    return 'active'
  })
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(() => {
    const stored = localStorage.getItem(TYPE_FILTER_KEY)
    if (stored === 'bug' || stored === 'task' || stored === 'story') return stored
    return 'all'
  })
  const [currentPage, setCurrentPage] = useState<PageId>(() => {
    const stored = localStorage.getItem(PAGE_KEY)
    if (stored === 'focus') return 'focus'
    return 'board'
  })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  })

  // Build API URL with worktree param
  const buildUrl = useCallback((path: string) => {
    if (selectedWorktree) {
      const separator = path.includes('?') ? '&' : '?'
      return `${path}${separator}worktree=${encodeURIComponent(selectedWorktree)}`
    }
    return path
  }, [selectedWorktree])

  const fetchFeatures = useCallback(async () => {
    try {
      const res = await fetch(buildUrl('/api/features'))
      if (!res.ok) throw new Error('Failed to fetch features')
      const data = await res.json()
      setFeatures(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [buildUrl])

  const fetchWorktrees = async () => {
    try {
      const res = await fetch('/api/worktrees')
      if (!res.ok) throw new Error('Failed to fetch worktrees')
      const data: Worktree[] = await res.json()
      setWorktrees(data)
      // If no worktree selected yet, select the current one
      if (!selectedWorktree) {
        const current = data.find((wt) => wt.isCurrent)
        if (current) {
          setSelectedWorktree(current.path)
          localStorage.setItem(WORKTREE_KEY, current.path)
        }
      }
    } catch {
      // Ignore - worktree selection will just be disabled
    }
  }

  useEffect(() => {
    fetchWorktrees()
  }, [])

  useEffect(() => {
    fetchFeatures()
  }, [fetchFeatures])

  const changeWorktree = (path: string) => {
    setSelectedWorktree(path)
    localStorage.setItem(WORKTREE_KEY, path)
    setLoading(true)
  }

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem(VIEW_MODE_KEY, mode)
  }

  const changeTypeFilter = (filter: TypeFilter) => {
    setTypeFilter(filter)
    localStorage.setItem(TYPE_FILTER_KEY, filter)
  }

  const changePage = (page: PageId) => {
    setCurrentPage(page)
    localStorage.setItem(PAGE_KEY, page)
  }

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      return next
    })
  }

  const getEffectiveOrder = (item: Feature | undefined): number => {
    if (!item) return 1000000
    return item.sort_order ?? 1000000
  }

  const calculateSortOrder = (columnFeatures: Feature[], newIndex: number): number => {
    if (columnFeatures.length === 0) return 1.0
    if (newIndex === 0) {
      return getEffectiveOrder(columnFeatures[0]) / 2
    } else if (newIndex >= columnFeatures.length) {
      return getEffectiveOrder(columnFeatures[columnFeatures.length - 1]) + 1
    } else {
      return (getEffectiveOrder(columnFeatures[newIndex - 1]) + getEffectiveOrder(columnFeatures[newIndex])) / 2
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) {
      setDropIndicator(null)
      return
    }

    const activeFeature = features.find((f) => f.id === active.id)
    if (!activeFeature) {
      setDropIndicator(null)
      return
    }

    const overId = over.id as string

    // Focus page: show drop indicator between rows
    if (currentPage === 'focus') {
      if (overId.startsWith('group:')) {
        const groupId = overId.slice('group:'.length)
        setFocusDropIndicator({ groupId, beforeId: null })
      } else {
        const overFeature = features.find((f) => f.id === overId)
        if (overFeature) {
          const groupId = overFeature.hypothesis || '__unlinked__'
          setFocusDropIndicator({ groupId, beforeId: overId })
        } else {
          setFocusDropIndicator(null)
        }
      }
      return
    }

    // Dropping on a column directly (empty area)
    if (VALID_COLUMN_IDS.has(overId as Status)) {
      setDropIndicator({ columnId: overId as Status, beforeId: null })
      return
    }

    // Dropping on a card
    const overFeature = features.find((f) => f.id === overId)
    if (overFeature) {
      setDropIndicator({ columnId: overFeature.status, beforeId: overId })
    } else {
      setDropIndicator(null)
    }
  }

  const handleDragCancel = () => {
    setActiveId(null)
    setDropIndicator(null)
    setFocusDropIndicator(null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null)
    setDropIndicator(null)
    const { active, over } = event
    if (!over) return

    const featureId = active.id as string
    const overId = over.id as string
    const feature = features.find((f) => f.id === featureId)
    if (!feature) return

    // Focus page: drag between hypothesis groups or reorder within group
    if (currentPage === 'focus') {
      setFocusDropIndicator(null)

      let targetHypothesis: string | null = null
      if (overId.startsWith('group:')) {
        targetHypothesis = overId.slice('group:'.length)
      } else {
        const targetRow = features.find((f) => f.id === overId)
        if (targetRow) {
          targetHypothesis = targetRow.hypothesis || '__unlinked__'
        }
      }
      if (!targetHypothesis) return
      const currentHypothesis = feature.hypothesis || '__unlinked__'

      // Cross-group: change hypothesis
      if (targetHypothesis !== currentHypothesis) {
        const newHypothesis = targetHypothesis === '__unlinked__' ? null : targetHypothesis

        setFeatures((prev) =>
          prev.map((f) => (f.id === featureId ? { ...f, hypothesis: newHypothesis ?? undefined } : f))
        )

        try {
          const res = await fetch(buildUrl(`/api/features/${encodeURIComponent(featureId)}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hypothesis: newHypothesis }),
          })
          if (!res.ok) throw new Error('Failed to update')
        } catch {
          fetchFeatures()
        }
        return
      }

      // Same group: reorder within hypothesis
      if (!overId.startsWith('group:')) {
        const groupFeatures = features
          .filter((f) => (f.hypothesis || '__unlinked__') === currentHypothesis)
          .sort((a, b) => (a.sort_order ?? 1000000) - (b.sort_order ?? 1000000))

        const oldIndex = groupFeatures.findIndex((f) => f.id === featureId)
        const newIndex = groupFeatures.findIndex((f) => f.id === overId)

        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

        const reordered = arrayMove(groupFeatures, oldIndex, newIndex)
        const newPosition = reordered.findIndex((f) => f.id === featureId)

        let finalSortOrder: number
        if (newPosition === 0) {
          finalSortOrder = getEffectiveOrder(reordered[1]) / 2
        } else if (newPosition === reordered.length - 1) {
          finalSortOrder = getEffectiveOrder(reordered[newPosition - 1]) + 1
        } else {
          finalSortOrder =
            (getEffectiveOrder(reordered[newPosition - 1]) + getEffectiveOrder(reordered[newPosition + 1])) / 2
        }

        setFeatures((prev) => prev.map((f) => (f.id === featureId ? { ...f, sort_order: finalSortOrder } : f)))

        try {
          const res = await fetch(buildUrl(`/api/features/${encodeURIComponent(featureId)}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sort_order: finalSortOrder }),
          })
          if (!res.ok) throw new Error('Failed to update')
        } catch {
          fetchFeatures()
        }
      }
      return
    }

    if (VALID_COLUMN_IDS.has(overId as Status)) {
      const newStatus = overId as Status
      if (feature.status === newStatus) return

      const targetColumnFeatures = features
        .filter((f) => f.status === newStatus)
        .sort((a, b) => (a.sort_order ?? 1000000) - (b.sort_order ?? 1000000))
      const newSortOrder = calculateSortOrder(targetColumnFeatures, targetColumnFeatures.length)

      setFeatures((prev) =>
        prev.map((f) => (f.id === featureId ? { ...f, status: newStatus, sort_order: newSortOrder } : f))
      )

      try {
        const res = await fetch(buildUrl(`/api/features/${encodeURIComponent(featureId)}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus, sort_order: newSortOrder }),
        })
        if (!res.ok) throw new Error('Failed to update')
      } catch {
        fetchFeatures()
      }
      return
    }

    const targetFeature = features.find((f) => f.id === overId)
    if (!targetFeature) return

    const targetStatus = targetFeature.status
    const columnFeatures = features
      .filter((f) => f.status === targetStatus && f.id !== featureId)
      .sort((a, b) => (a.sort_order ?? 1000000) - (b.sort_order ?? 1000000))

    const targetIndex = columnFeatures.findIndex((f) => f.id === overId)
    const newSortOrder = calculateSortOrder(columnFeatures, targetIndex)

    if (feature.status !== targetStatus) {
      setFeatures((prev) =>
        prev.map((f) => (f.id === featureId ? { ...f, status: targetStatus, sort_order: newSortOrder } : f))
      )

      try {
        const res = await fetch(buildUrl(`/api/features/${encodeURIComponent(featureId)}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: targetStatus, sort_order: newSortOrder }),
        })
        if (!res.ok) throw new Error('Failed to update')
      } catch {
        fetchFeatures()
      }
      return
    }

    const currentColumnFeatures = features
      .filter((f) => f.status === feature.status)
      .sort((a, b) => (a.sort_order ?? 1000000) - (b.sort_order ?? 1000000))

    const oldIndex = currentColumnFeatures.findIndex((f) => f.id === featureId)
    const newIndex = currentColumnFeatures.findIndex((f) => f.id === overId)

    if (oldIndex === newIndex) return

    const reorderedFeatures = arrayMove(currentColumnFeatures, oldIndex, newIndex)
    const newPosition = reorderedFeatures.findIndex((f) => f.id === featureId)

    let finalSortOrder: number
    if (newPosition === 0) {
      finalSortOrder = getEffectiveOrder(reorderedFeatures[1]) / 2
    } else if (newPosition === reorderedFeatures.length - 1) {
      finalSortOrder = getEffectiveOrder(reorderedFeatures[newPosition - 1]) + 1
    } else {
      finalSortOrder =
        (getEffectiveOrder(reorderedFeatures[newPosition - 1]) + getEffectiveOrder(reorderedFeatures[newPosition + 1])) /
        2
    }

    setFeatures((prev) => prev.map((f) => (f.id === featureId ? { ...f, sort_order: finalSortOrder } : f)))

    try {
      const res = await fetch(buildUrl(`/api/features/${encodeURIComponent(featureId)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: finalSortOrder }),
      })
      if (!res.ok) throw new Error('Failed to update')
    } catch {
      fetchFeatures()
    }
  }

  const getColumnFeatures = (column: ColumnConfig): Feature[] => {
    const today = new Date().toISOString().split('T')[0]
    return features
      .filter((f) => {
        if (f.status !== column.id) return false
        if (column.filter === 'today') return f.completed_at === today
        if (column.filter === 'before-today') return !f.completed_at || f.completed_at < today
        // Type filter
        if (typeFilter !== 'all' && f.type !== typeFilter) return false
        return true
      })
      .sort((a, b) => {
        const orderA = a.sort_order ?? 1000000
        const orderB = b.sort_order ?? 1000000
        if (orderA !== orderB) return orderA - orderB
        return a.id.localeCompare(b.id)
      })
  }

  const visibleColumns = useMemo(() => {
    let cols = [...COLUMNS]
    if (viewMode !== 'backlog') cols = cols.filter((c) => c.id !== 'backlog')
    if (viewMode === 'all-done') cols.push(ALL_DONE_COLUMN)
    return cols
  }, [viewMode])

  // Notion-style view tab
  const viewTabStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 8px',
    fontSize: 'var(--font-size-14)',
    fontWeight: 'var(--font-weight-regular)',
    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
    background: isActive ? 'var(--bg-hover)' : 'transparent',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    transition: 'background 0.1s',
  })

  if (loading) {
    return (
      <div style={{ padding: 'var(--spacing-16)', color: 'var(--text-tertiary)' }}>
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--tag-red-text)' }}>
        Error: {error}
        <br />
        <button
          onClick={fetchFeatures}
          style={{
            marginTop: 16,
            padding: '6px 12px',
            background: 'var(--bg-hover)',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer',
            color: 'var(--text-primary)',
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Title row */}
      <div style={{ padding: 'var(--spacing-12) var(--spacing-16) 0', flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-8)',
            marginBottom: 'var(--spacing-8)',
          }}
        >
          <span style={{ fontSize: 24 }}>🛹</span>
          <h1
            style={{
              fontSize: 'var(--font-size-16)',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Clarity Kanban
          </h1>

          {/* Worktree selector */}
          {worktrees.length > 1 && (
            <select
              value={selectedWorktree || ''}
              onChange={(e) => changeWorktree(e.target.value)}
              style={{
                marginLeft: 'auto',
                padding: '4px 8px',
                fontSize: 'var(--font-size-14)',
                color: 'var(--text-primary)',
                background: 'var(--bg-hover)',
                border: '1px solid rgba(55, 53, 47, 0.16)',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {worktrees.map((wt) => (
                <option key={wt.path} value={wt.path}>
                  {wt.branch}{wt.isCurrent ? ' (current)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Sidebar + Content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar currentPage={currentPage} onPageChange={changePage} collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />

        {/* Content area */}
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {currentPage === 'board' && (
            <>
              {/* Board header */}
              <div style={{ padding: '0 var(--spacing-16)', flexShrink: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingBottom: 'var(--spacing-12)',
                    borderBottom: '1px solid rgba(55, 53, 47, 0.09)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)' }}>
                    <button style={viewTabStyle(viewMode === 'backlog')} onClick={() => changeViewMode('backlog')}>
                      Backlog
                    </button>
                    <button style={viewTabStyle(viewMode === 'active')} onClick={() => changeViewMode('active')}>
                      Main Board
                    </button>
                    <button style={viewTabStyle(viewMode === 'all-done')} onClick={() => changeViewMode('all-done')}>
                      Done
                    </button>
                  </div>

                  {/* Type filter chips */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)' }}>
                    {TYPE_CHIPS.map((chip) => (
                      <button
                        key={chip.id}
                        onClick={() => changeTypeFilter(chip.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          fontSize: 'var(--font-size-12)',
                          fontWeight: 'var(--font-weight-regular)',
                          color: typeFilter === chip.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                          background: typeFilter === chip.id ? chip.color : 'transparent',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          transition: 'all 0.1s',
                        }}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Board */}
              <div style={{ padding: 'var(--spacing-12) var(--spacing-16)', overflowX: 'auto', flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--spacing-8)',
                    alignItems: 'flex-start',
                  }}
                >
                  {visibleColumns.map((col) => (
                    <Column
                      key={`${col.id}-${col.filter ?? 'default'}`}
                      id={col.id}
                      title={col.title}
                      color={col.color}
                      features={getColumnFeatures(col)}
                      dropIndicator={dropIndicator?.columnId === col.id ? dropIndicator : null}
                      isDragging={activeId !== null}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {currentPage === 'focus' && (
            <div style={{ overflow: 'auto', flex: 1 }}>
              <FocusPage features={features} onFeatureUpdate={fetchFeatures} dropIndicator={focusDropIndicator} />
            </div>
          )}
        </div>
        </DndContext>
      </div>
    </div>
  )
}
