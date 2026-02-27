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
import { arrayMove } from '@dnd-kit/sortable'
import { Column } from './Column'
import type { DropIndicator } from '../App'
import type { Article, ArticleStatus, Feature, Status } from '../lib/types'

// Content pipeline columns (ordered left → right)
interface ContentColumn {
  id: ArticleStatus
  title: string
  color: string
}

const CONTENT_COLUMNS: ContentColumn[] = [
  { id: 'idea',      title: 'Idea',      color: '#6b7280' },
  { id: 'draft',     title: 'Draft',     color: '#3b82f6' },
  { id: 'editing',   title: 'Editing',   color: '#f59e0b' },
  { id: 'ready',     title: 'Ready',     color: '#8b5cf6' },
  { id: 'published', title: 'Published', color: '#22c55e' },
  { id: 'promoted',  title: 'Promoted',  color: '#22c55e' },
]

const VALID_CONTENT_IDS = new Set<ArticleStatus>(CONTENT_COLUMNS.map((c) => c.id))

// Articles are rendered by the existing Column + Card components.
// We cast Article → Feature since Card only uses id, path, title, status, rank, tags
// and renders feature-specific fields (type, delivery_stage, etc.) conditionally — they
// simply don't appear when absent.
function articleToFeature(article: Article): Feature {
  return {
    id: article.id,
    path: article.path,
    title: article.title,
    status: article.status as unknown as Status,
    rank: article.rank,
    tags: article.tags,
  }
}

interface ContentPageProps {
  currentWorktree?: string
}

export function ContentPage({ currentWorktree }: ContentPageProps) {
  const [articles, setArticles] = useState<Article[]>([])
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

  const fetchArticles = useCallback(async (refresh = false) => {
    try {
      const url = buildUrl('/api/articles')
      const finalUrl = refresh ? `${url}${url.includes('?') ? '&' : '?'}refresh=true` : url
      const res = await fetch(finalUrl)
      if (!res.ok) throw new Error('Failed to fetch articles')
      setArticles(await res.json())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [buildUrl])

  useEffect(() => { fetchArticles() }, [fetchArticles])

  const getEffectiveOrder = (a: Article | undefined): number => {
    if (!a) return Number.MAX_SAFE_INTEGER
    return a.rank ?? Number.MAX_SAFE_INTEGER
  }

  const getColumnArticles = (status: ArticleStatus): Article[] =>
    articles
      .filter((a) => a.status === status)
      .sort((a, b) => getEffectiveOrder(a) - getEffectiveOrder(b))

  const calculateSortOrder = (columnArticles: Article[], newIndex: number): number => {
    if (columnArticles.length === 0) return 1.0
    if (newIndex === 0) return getEffectiveOrder(columnArticles[0]) / 2
    if (newIndex >= columnArticles.length) return getEffectiveOrder(columnArticles[columnArticles.length - 1]) + 1
    return (getEffectiveOrder(columnArticles[newIndex - 1]) + getEffectiveOrder(columnArticles[newIndex])) / 2
  }

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string)

  const handleDragOver = (event: DragOverEvent) => {
    const { active: _active, over } = event
    if (!over) { setDropIndicator(null); return }

    const overId = over.id as string

    if (VALID_CONTENT_IDS.has(overId as ArticleStatus)) {
      setDropIndicator({ columnId: overId as unknown as Status, beforeId: null })
      return
    }

    const overArticle = articles.find((a) => a.id === overId)
    if (overArticle) {
      setDropIndicator({ columnId: overArticle.status as unknown as Status, beforeId: overId })
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

    const articleId = active.id as string
    const overId = over.id as string
    const article = articles.find((a) => a.id === articleId)
    if (!article) return

    // Drop on column → move to that status
    if (VALID_CONTENT_IDS.has(overId as ArticleStatus)) {
      const newStatus = overId as ArticleStatus
      if (article.status === newStatus) return

      const targetColArticles = getColumnArticles(newStatus)
      const newRank = calculateSortOrder(targetColArticles, targetColArticles.length)

      setArticles((prev) => prev.map((a) =>
        a.id === articleId ? { ...a, status: newStatus, rank: newRank } : a
      ))

      try {
        const res = await fetch(buildUrl(`/api/articles/${encodeURIComponent(articleId)}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus, rank: newRank }),
        })
        if (!res.ok) throw new Error('Failed to update')
      } catch { fetchArticles() }
      return
    }

    // Drop on another article card
    const targetArticle = articles.find((a) => a.id === overId)
    if (!targetArticle) return

    const targetStatus = targetArticle.status

    if (article.status !== targetStatus) {
      // Cross-column move
      const targetColArticles = articles
        .filter((a) => a.status === targetStatus && a.id !== articleId)
        .sort((a, b) => getEffectiveOrder(a) - getEffectiveOrder(b))
      const targetIndex = targetColArticles.findIndex((a) => a.id === overId)
      const newRank = calculateSortOrder(targetColArticles, targetIndex)

      setArticles((prev) => prev.map((a) =>
        a.id === articleId ? { ...a, status: targetStatus, rank: newRank } : a
      ))

      try {
        const res = await fetch(buildUrl(`/api/articles/${encodeURIComponent(articleId)}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: targetStatus, rank: newRank }),
        })
        if (!res.ok) throw new Error('Failed to update')
      } catch { fetchArticles() }
      return
    }

    // Same-column reorder
    const currentColArticles = articles
      .filter((a) => a.status === article.status)
      .sort((a, b) => getEffectiveOrder(a) - getEffectiveOrder(b))

    const oldIndex = currentColArticles.findIndex((a) => a.id === articleId)
    const newIndex = currentColArticles.findIndex((a) => a.id === overId)
    if (oldIndex === newIndex) return

    const reordered = arrayMove(currentColArticles, oldIndex, newIndex)
    const newPosition = reordered.findIndex((a) => a.id === articleId)

    let finalRank: number
    if (newPosition === 0) {
      finalRank = getEffectiveOrder(reordered[1]) / 2
    } else if (newPosition === reordered.length - 1) {
      finalRank = getEffectiveOrder(reordered[newPosition - 1]) + 1
    } else {
      finalRank = (getEffectiveOrder(reordered[newPosition - 1]) + getEffectiveOrder(reordered[newPosition + 1])) / 2
    }

    setArticles((prev) => prev.map((a) => a.id === articleId ? { ...a, rank: finalRank } : a))

    try {
      const res = await fetch(buildUrl(`/api/articles/${encodeURIComponent(articleId)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rank: finalRank }),
      })
      if (!res.ok) throw new Error('Failed to update')
    } catch { fetchArticles() }
  }

  if (loading) return <div style={{ padding: 'var(--spacing-16)', color: 'var(--text-tertiary)' }}>Loading...</div>

  if (error) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--tag-red-text)' }}>
      Error: {error}
      <br />
      <button
        onClick={() => { setLoading(true); fetchArticles(true) }}
        style={{ marginTop: 16, padding: '6px 12px', background: 'var(--bg-hover)', border: 'none', borderRadius: '3px', cursor: 'pointer', color: 'var(--text-primary)' }}
      >
        Retry
      </button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Content board header */}
      <div style={{ padding: '0 var(--spacing-16)', flexShrink: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 'var(--spacing-12)',
          borderBottom: '1px solid rgba(55, 53, 47, 0.09)',
        }}>
          <span style={{ fontSize: 'var(--font-size-14)', color: 'var(--text-secondary)' }}>
            Article Pipeline
          </span>
          <button
            onClick={() => { setLoading(true); fetchArticles(true) }}
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

      {/* Content kanban columns */}
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
            {CONTENT_COLUMNS.map((col) => {
              const colArticles = getColumnArticles(col.id)
              const colFeatures = colArticles.map(articleToFeature)
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
                  onFeatureUpdate={() => fetchArticles()}
                />
              )
            })}
          </div>
        </div>
      </DndContext>
    </div>
  )
}
