import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
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
import { GoalsPage } from './components/GoalsPage'
import { ContentPage } from './components/ContentPage'
import { PipelinePage } from './components/PipelinePage'
import { Feature, FeatureType, Status } from './lib/types'
import {
  STORAGE_KEYS,
  setStorageApiPort,
  readPref,
  writePref,
  migrateLegacyKeys,
} from './lib/kanbanStorage'

export interface DropIndicator {
  columnId: Status
  beforeId: string | null // Show indicator before this card (null = at end of column)
}

export interface FocusDropIndicator {
  beforeId: string | null // Show indicator before this row (null = at end of list)
}

interface Worktree {
  path: string
  branch: string
  name: string
  isCurrent: boolean
}

interface KanbanConfig {
  apiPort: number
  frontendPort: number
  featuresDir: string
  hidePages: string[]
  hideColumns: string[]
  disableWorktrees: boolean
  title?: string
  faviconEmoji?: string
  // Per-column WIP limits from KANBAN_WIP_LIMITS. Advisory only — rendered as
  // "N / limit" in the column header. Missing key = no limit shown.
  wipLimits?: Record<string, number>
}

interface ColumnConfig {
  id: Status
  title: string
  color: string
  defaultHidden?: boolean
  filter?: 'last-3-days' | 'older-than-3-days'
}

const COLUMNS: ColumnConfig[] = [
  { id: 'backlog', title: 'Backlog', color: '#6b7280', defaultHidden: true },
  { id: 'week', title: 'Week', color: '#6b7280' },
  { id: 'today', title: 'Today', color: '#22c55e' },
  { id: 'blocked', title: 'Blocked', color: '#ef4444' },
  { id: 'in-progress', title: 'In Progress', color: '#3b82f6' },
  { id: 'qa', title: 'QA', color: '#f59e0b' },
  { id: 'done', title: 'Done', color: '#22c55e', filter: 'last-3-days' },
  { id: 'rejected', title: 'Rejected', color: '#6b7280', defaultHidden: true },
]

const ALL_DONE_COLUMN: ColumnConfig = {
  id: 'done',
  title: 'All Done',
  color: '#22c55e',
  defaultHidden: true,
  filter: 'older-than-3-days',
}

const VALID_COLUMN_IDS = new Set<Status>(['backlog', 'week', 'today', 'in-progress', 'blocked', 'qa', 'done', 'all-done', 'rejected'])

const ALL_PAGES: { id: PageId; icon: string; label: string }[] = [
  { id: 'board', icon: '\u{1F4CB}', label: 'Board' },
  { id: 'focus', icon: '\u{1F3AF}', label: 'Focus' },
  { id: 'goals', icon: '\u{1F9ED}', label: 'Goals' },
  { id: 'content', icon: '✏️', label: 'Content' },
  { id: 'pipeline', icon: '🤝', label: 'Pipeline' },
]

type ViewMode = 'active' | 'backlog' | 'all-done'
type FocusViewMode = 'active' | 'backlog' | 'done'

const FOCUS_BACKLOG_STATUSES = new Set(['draft', 'backlog'])
const FOCUS_DONE_STATUSES = new Set(['done', 'all-done', 'rejected'])

type TypeFilter = FeatureType | 'all'

const TYPE_CHIPS: { id: TypeFilter; label: string; color: string }[] = [
  { id: 'all', label: 'All', color: 'var(--tag-gray-bg)' },
  { id: 'bug', label: 'Bug', color: 'var(--tag-red-bg)' },
  { id: 'task', label: 'Task', color: 'var(--tag-blue-bg)' },
  { id: 'story', label: 'Story', color: 'var(--tag-green-bg)' },
  { id: 'change-request', label: 'Change Request', color: 'var(--tag-purple-bg)' },
]

export default function App() {
  const [config, setConfig] = useState<KanbanConfig | null>(null)
  // Set true at the end of the hydration effect so fetchFeatures waits for
  // localStorage-derived `selectedWorktree` to be populated. Without this gate,
  // fetchFeatures fires once with a stale buildUrl closure (selectedWorktree=null)
  // before hydration commits — wasted request + possible wrong-tree flicker.
  const [hydrated, setHydrated] = useState(false)
  const [features, setFeatures] = useState<Feature[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null)
  const [focusDropIndicator, setFocusDropIndicator] = useState<FocusDropIndicator | null>(null)
  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const [selectedWorktree, setSelectedWorktree] = useState<string | null>(null)
  // Mirrors selectedWorktree so fetchWorktrees can read the live selection without
  // taking it as a dep (a changing fetchWorktrees identity would re-fire effect 3).
  const selectedWorktreeRef = useRef<string | null>(null)
  useEffect(() => { selectedWorktreeRef.current = selectedWorktree }, [selectedWorktree])

  // Require 5px movement before drag starts - allows clicks to work
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  )
  const [viewMode, setViewMode] = useState<ViewMode>('active')
  const [focusViewMode, setFocusViewMode] = useState<FocusViewMode>('active')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [currentPage, setCurrentPage] = useState<PageId>('board')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Visible page set — derived from config. Used for hydration validation
  // (stale `kanban-page` values pointing at a now-hidden page fall back to 'board').
  const visiblePages = useMemo(() => {
    if (!config) return new Set<PageId>(ALL_PAGES.map(p => p.id))
    return new Set<PageId>(ALL_PAGES.filter(p => !config.hidePages.includes(p.id)).map(p => p.id))
  }, [config])

  const filteredPages = useMemo(() => {
    if (!config) return ALL_PAGES
    return ALL_PAGES.filter(p => !config.hidePages.includes(p.id))
  }, [config])

  // Build API URL with worktree param. Skip the param entirely when worktrees
  // are disabled — otherwise a stale localStorage value would poison every
  // request and pp's API would silently scan cp's tree.
  const buildUrl = useCallback((path: string) => {
    if (config?.disableWorktrees) return path
    if (selectedWorktree) {
      const separator = path.includes('?') ? '&' : '?'
      return `${path}${separator}worktree=${encodeURIComponent(selectedWorktree)}`
    }
    return path
  }, [selectedWorktree, config?.disableWorktrees])

  const fetchFeatures = useCallback(async (refresh = false) => {
    try {
      const url = buildUrl('/api/features')
      const separator = url.includes('?') ? '&' : '?'
      const finalUrl = refresh ? `${url}${separator}refresh=true` : url
      const res = await fetch(finalUrl)
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

  // `mode: 'mount'` always snaps to the current worktree (localStorage may hold a
  // stale path from a session started in a different dir). `mode: 'refresh'` keeps
  // the user's selection — unless that worktree is gone (e.g. /ship removed the
  // slot), in which case it falls back to the current one. Without the refresh
  // path, shipped worktrees stayed in the dropdown until the server was restarted.
  const fetchWorktrees = useCallback(async (mode: 'mount' | 'refresh' = 'mount') => {
    try {
      const res = await fetch('/api/worktrees')
      if (!res.ok) throw new Error('Failed to fetch worktrees')
      const data: Worktree[] = await res.json()
      setWorktrees(data)
      const selected = selectedWorktreeRef.current
      const stillExists =
        mode === 'refresh' && !!selected && data.some((wt) => wt.path === selected)
      if (stillExists) return
      const current = data.find((wt) => wt.isCurrent)
      if (current) {
        setSelectedWorktree(current.path)
        writePref(STORAGE_KEYS.worktree, current.path)
      }
    } catch {
      // Ignore - worktree selection will just be disabled
    }
  }, [])

  // 1. Fetch /api/config on mount. This gates all other effects.
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('config fetch failed')))
      .then((cfg: KanbanConfig) => setConfig(cfg))
      .catch((e: Error) => setError(e.message))
  }, [])

  // 2. Once config arrives: bind the storage namespace, migrate legacy keys,
  // hydrate prefs from localStorage. Validate `currentPage` against the
  // runtime-visible PAGES set (not the type union) — pp's `'goals'` is in
  // PageId but not in visiblePages.
  useEffect(() => {
    if (!config) return
    setStorageApiPort(config.apiPort)
    migrateLegacyKeys(config.apiPort)

    const storedView = readPref(STORAGE_KEYS.viewMode)
    if (storedView === 'backlog' || storedView === 'all-done') setViewMode(storedView)

    const storedFocus = readPref(STORAGE_KEYS.focusViewMode)
    if (storedFocus === 'backlog' || storedFocus === 'done') setFocusViewMode(storedFocus)

    const storedFilter = readPref(STORAGE_KEYS.typeFilter)
    if (
      storedFilter === 'bug' ||
      storedFilter === 'task' ||
      storedFilter === 'story' ||
      storedFilter === 'change-request'
    ) {
      setTypeFilter(storedFilter)
    }

    const storedPage = readPref(STORAGE_KEYS.page)
    if (storedPage && (visiblePages as Set<string>).has(storedPage)) {
      setCurrentPage(storedPage as PageId)
    } else {
      setCurrentPage('board')
    }

    const storedCollapsed = readPref(STORAGE_KEYS.sidebarCollapsed)
    if (storedCollapsed === 'true') setSidebarCollapsed(true)

    if (config.disableWorktrees) {
      // Force-clear: even a stale value would be appended to every fetch via buildUrl.
      setSelectedWorktree(null)
    } else {
      const storedWt = readPref(STORAGE_KEYS.worktree)
      if (storedWt) setSelectedWorktree(storedWt)
    }

    setHydrated(true)
  }, [config, visiblePages])

  // 2b. Apply branding from config (title + favicon emoji). Defensive — older
  // server builds without these fields fall through to the index.html defaults.
  useEffect(() => {
    if (!config) return
    if (config.title) document.title = config.title
    if (config.faviconEmoji) {
      const link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null
      if (link) {
        link.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${config.faviconEmoji}</text></svg>`
      }
    }
  }, [config])

  // 3. Fetch worktrees after config arrives (skip when disabled).
  useEffect(() => {
    if (!config || config.disableWorktrees) return
    fetchWorktrees('mount')
  }, [config, fetchWorktrees])

  // 4. Fetch features once config is loaded AND hydration committed. Gating on
  // `hydrated` prevents a stale-closure double-fetch: the captured buildUrl would
  // see `selectedWorktree=null` if this effect fired in the same commit as the
  // hydration effect that sets it.
  useEffect(() => {
    if (!config || !hydrated) return
    fetchFeatures()
  }, [config, hydrated, fetchFeatures])

  const changeWorktree = (path: string) => {
    setSelectedWorktree(path)
    writePref(STORAGE_KEYS.worktree, path)
    setLoading(true)
  }

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    writePref(STORAGE_KEYS.viewMode, mode)
  }

  const changeFocusViewMode = (mode: FocusViewMode) => {
    setFocusViewMode(mode)
    writePref(STORAGE_KEYS.focusViewMode, mode)
  }

  const changeTypeFilter = (filter: TypeFilter) => {
    setTypeFilter(filter)
    writePref(STORAGE_KEYS.typeFilter, filter)
  }

  const changePage = (page: PageId) => {
    setCurrentPage(page)
    writePref(STORAGE_KEYS.page, page)
  }

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      writePref(STORAGE_KEYS.sidebarCollapsed, String(next))
      return next
    })
  }

  const getEffectiveOrder = (item: Feature | undefined): number => {
    if (!item) return Number.MAX_SAFE_INTEGER
    // P141: Use rank for ordering
    return item.rank ?? Number.MAX_SAFE_INTEGER
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

    // Focus page: show drop indicator between rows (flat list)
    if (currentPage === 'focus') {
      const overFeature = features.find((f) => f.id === overId)
      if (overFeature) {
        setFocusDropIndicator({ beforeId: overId })
      } else {
        setFocusDropIndicator({ beforeId: null })
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

    // Focus page: flat list reorder
    if (currentPage === 'focus') {
      setFocusDropIndicator(null)

      const allSorted = [...features]
        .sort((a, b) => getEffectiveOrder(a) - getEffectiveOrder(b))

      const oldIndex = allSorted.findIndex((f) => f.id === featureId)
      const newIndex = allSorted.findIndex((f) => f.id === overId)

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

      const reordered = arrayMove(allSorted, oldIndex, newIndex)
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

      setFeatures((prev) => prev.map((f) => (f.id === featureId ? { ...f, rank: finalSortOrder } : f)))

      try {
        const res = await fetch(buildUrl(`/api/features/${encodeURIComponent(featureId)}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rank: finalSortOrder }),
        })
        if (!res.ok) throw new Error('Failed to update')
      } catch {
        fetchFeatures()
      }
      return
    }

    if (VALID_COLUMN_IDS.has(overId as Status)) {
      const newStatus = overId as Status
      if (feature.status === newStatus) return

      const targetColumnFeatures = features
        .filter((f) => f.status === newStatus)
        .sort((a, b) => getEffectiveOrder(a) - getEffectiveOrder(b))
      const newSortOrder = calculateSortOrder(targetColumnFeatures, targetColumnFeatures.length)

      const today = new Date().toISOString().split('T')[0]
      const completed_at = newStatus === 'done' ? today : undefined

      setFeatures((prev) =>
        prev.map((f) =>
          f.id === featureId
            ? { ...f, status: newStatus, rank: newSortOrder, ...(newStatus === 'done' ? { completed_at: today } : { completed_at: undefined }) }
            : f
        )
      )

      try {
        const res = await fetch(buildUrl(`/api/features/${encodeURIComponent(featureId)}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus, rank: newSortOrder, completed_at }),
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
      .sort((a, b) => getEffectiveOrder(a) - getEffectiveOrder(b))

    const targetIndex = columnFeatures.findIndex((f) => f.id === overId)
    const newSortOrder = calculateSortOrder(columnFeatures, targetIndex)

    if (feature.status !== targetStatus) {
      const todayStr = new Date().toISOString().split('T')[0]
      const cardCompleted = targetStatus === 'done' ? todayStr : undefined

      setFeatures((prev) =>
        prev.map((f) =>
          f.id === featureId
            ? { ...f, status: targetStatus, rank: newSortOrder, ...(targetStatus === 'done' ? { completed_at: todayStr } : { completed_at: undefined }) }
            : f
        )
      )

      try {
        const res = await fetch(buildUrl(`/api/features/${encodeURIComponent(featureId)}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: targetStatus, rank: newSortOrder, completed_at: cardCompleted }),
        })
        if (!res.ok) throw new Error('Failed to update')
      } catch {
        fetchFeatures()
      }
      return
    }

    const currentColumnFeatures = features
      .filter((f) => f.status === feature.status)
      .sort((a, b) => getEffectiveOrder(a) - getEffectiveOrder(b))

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

    setFeatures((prev) => prev.map((f) => (f.id === featureId ? { ...f, rank: finalSortOrder } : f)))

    try {
      const res = await fetch(buildUrl(`/api/features/${encodeURIComponent(featureId)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rank: finalSortOrder }),
      })
      if (!res.ok) throw new Error('Failed to update')
    } catch {
      fetchFeatures()
    }
  }

  const getColumnFeatures = (column: ColumnConfig): Feature[] => {
    const today = new Date().toISOString().split('T')[0]
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    return features
      .filter((f) => {
        // All Done column shows: 'done' items older than 3 days + explicit 'all-done' items always
        const matchesColumn = column.filter === 'older-than-3-days'
          ? f.status === 'done' || f.status === 'all-done'
          : f.status === column.id
        if (!matchesColumn) return false
        // Search filter
        if (searchQuery && !f.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
        // Type filter applies to all columns including Done
        if (typeFilter !== 'all' && f.type !== typeFilter) return false
        if (column.filter === 'last-3-days') return !!f.completed_at && f.completed_at >= threeDaysAgo && f.completed_at <= today
        if (column.filter === 'older-than-3-days') return f.status === 'all-done' || !f.completed_at || f.completed_at < threeDaysAgo
        return true
      })
      .sort((a, b) => {
        const orderA = getEffectiveOrder(a)
        const orderB = getEffectiveOrder(b)
        if (orderA !== orderB) return orderA - orderB
        return a.id.localeCompare(b.id)
      })
  }

  const visibleColumns = useMemo(() => {
    let cols = [...COLUMNS]
    if (config) cols = cols.filter((c) => !config.hideColumns.includes(c.id))
    if (viewMode !== 'backlog') cols = cols.filter((c) => c.id !== 'backlog')
    if (viewMode !== 'all-done') cols = cols.filter((c) => c.id !== 'rejected')
    if (viewMode === 'all-done') cols.push(ALL_DONE_COLUMN)
    return cols
  }, [viewMode, config])

  // Filtered features for Focus page (search + type filter + view mode)
  const filteredFeatures = useMemo(() => {
    return features.filter((f) => {
      if (searchQuery && !f.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
      if (typeFilter !== 'all' && f.type !== typeFilter) return false
      if (focusViewMode === 'backlog') return FOCUS_BACKLOG_STATUSES.has(f.status)
      if (focusViewMode === 'done') return FOCUS_DONE_STATUSES.has(f.status)
      // active: week/today/blocked/in-progress/done only
      return !FOCUS_BACKLOG_STATUSES.has(f.status) && f.status !== 'all-done' && f.status !== 'rejected'
    })
  }, [features, searchQuery, typeFilter, focusViewMode])

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

  if (!config || loading) {
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
          onClick={() => fetchFeatures()}
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
          <span style={{ fontSize: 24 }}>{config?.faviconEmoji ?? '🛹'}</span>
          <h1
            style={{
              fontSize: 'var(--font-size-16)',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            {config?.title ?? 'Clarity Kanban'}
          </h1>

          {/* Search */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--spacing-6)' }}>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: 180,
                padding: '4px 8px',
                fontSize: 'var(--font-size-14)',
                color: 'var(--text-primary)',
                background: 'var(--bg-hover)',
                border: '1px solid rgba(55, 53, 47, 0.16)',
                borderRadius: '4px',
                outline: 'none',
                fontFamily: 'var(--font-family)',
              }}
            />

            {/* Refresh button */}
            <button
              onClick={() => {
                setLoading(true)
                fetchFeatures(true)
                if (!config.disableWorktrees) fetchWorktrees('refresh')
              }}
              title="Refresh"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                background: 'none',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: 16,
                color: 'var(--text-secondary)',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              ↻
            </button>
          </div>

          {/* Worktree selector — hidden when worktrees are disabled by config */}
          {!config.disableWorktrees && worktrees.length > 1 && (
            <select
              value={selectedWorktree || ''}
              onChange={(e) => changeWorktree(e.target.value)}
              style={{
                padding: '4px 8px',
                fontSize: 'var(--font-size-14)',
                color: 'var(--text-primary)',
                background: 'var(--bg-hover)',
                border: '1px solid rgba(55, 53, 47, 0.16)',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {worktrees.map((wt) => {
                const label = wt.name === 'main'
                  ? '(main) summary'
                  : `(${wt.name}) ${wt.branch.replace('feature/', '')}`
                return (
                  <option key={wt.path} value={wt.path}>
                    {label}{wt.isCurrent ? ' ✦' : ''}
                  </option>
                )
              })}
            </select>
          )}
        </div>
      </div>

      {/* Sidebar + Content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          currentPage={currentPage}
          onPageChange={changePage}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          pages={filteredPages}
        />

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
                      limit={config?.wipLimits?.[col.id]}
                      features={getColumnFeatures(col)}
                      dropIndicator={dropIndicator?.columnId === col.id ? dropIndicator : null}
                      isDragging={activeId !== null}
                      onFeatureUpdate={fetchFeatures}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {currentPage === 'focus' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '0 var(--spacing-16)', flexShrink: 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)',
                  paddingBottom: 'var(--spacing-12)',
                  borderBottom: '1px solid rgba(55, 53, 47, 0.09)',
                }}>
                  {(['backlog', 'active', 'done'] as FocusViewMode[]).map((mode) => (
                    <button
                      key={mode}
                      style={viewTabStyle(focusViewMode === mode)}
                      onClick={() => changeFocusViewMode(mode)}
                    >
                      {mode === 'active' ? 'Main Board' : mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ overflow: 'auto', flex: 1 }}>
                <FocusPage
                  features={filteredFeatures}
                  onFeatureUpdate={fetchFeatures}
                  dropIndicator={focusDropIndicator}
                  currentWorktree={selectedWorktree || undefined}
                />
              </div>
            </div>
          )}

          {currentPage === 'goals' && (
            <div style={{ overflow: 'auto', flex: 1 }}>
              <GoalsPage />
            </div>
          )}

          {currentPage === 'content' && (
            <ContentPage currentWorktree={selectedWorktree || undefined} />
          )}

          {currentPage === 'pipeline' && (
            <PipelinePage currentWorktree={selectedWorktree || undefined} />
          )}
        </div>
        </DndContext>
      </div>
    </div>
  )
}
