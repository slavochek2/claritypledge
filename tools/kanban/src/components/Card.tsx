import { useDraggable } from '@dnd-kit/core'
import { Feature, FeatureType, Priority } from '../lib/types'

interface CardProps {
  feature: Feature
}

// Badge color mappings
const TYPE_COLORS: Record<FeatureType, string> = {
  bug: '#ef4444',
  task: '#6b7280',
  story: '#3b82f6',
}

const PRIORITY_COLORS: Record<Priority, string> = {
  p0: '#ef4444',
  p1: '#3b82f6',
  p2: '#6b7280',
  p3: '#6b7280',
}

// Max visible tags before showing "+N more"
const MAX_VISIBLE_TAGS = 3
// Max title length before truncation
const MAX_TITLE_LENGTH = 50

export function Card({ feature }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: feature.id,
    })

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined

  const openInCursor = async () => {
    try {
      await fetch('/api/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: feature.path }),
      })
    } catch (error) {
      console.error('Failed to open in Cursor:', error)
    }
  }

  // Truncate title if over max length
  const displayTitle =
    feature.title.length > MAX_TITLE_LENGTH
      ? feature.title.slice(0, MAX_TITLE_LENGTH) + '...'
      : feature.title

  // Tags display: show first N, then "+X more" chip
  const visibleTags = feature.tags.slice(0, MAX_VISIBLE_TAGS)
  const hiddenTagCount = feature.tags.length - MAX_VISIBLE_TAGS

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: isDragging ? '#3a3a5a' : '#1e1e3f',
        borderRadius: 6,
        padding: 10,
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.8 : 1,
        border: '1px solid #2a2a4a',
        transition: isDragging ? 'none' : 'background 0.15s',
      }}
      {...listeners}
      {...attributes}
    >
      {/* Title with truncation and hover tooltip */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          marginBottom: 6,
          lineHeight: 1.3,
        }}
        title={feature.title.length > MAX_TITLE_LENGTH ? feature.title : undefined}
      >
        {displayTitle}
      </div>

      {/* First-class badges row: Type, Priority, Blocked_by, Open button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
          marginBottom: 4,
        }}
      >
        {/* Type badge */}
        {feature.type && (
          <span
            style={{
              fontSize: 10,
              background: TYPE_COLORS[feature.type],
              color: '#fff',
              padding: '1px 6px',
              borderRadius: 4,
              textTransform: 'capitalize',
            }}
          >
            {feature.type}
          </span>
        )}

        {/* Priority badge */}
        {feature.priority && (
          <span
            style={{
              fontSize: 10,
              background: PRIORITY_COLORS[feature.priority],
              color: '#fff',
              padding: '1px 6px',
              borderRadius: 4,
              textTransform: 'uppercase',
            }}
          >
            {feature.priority}
          </span>
        )}

        {/* Blocked_by chips - red outline with blocker IDs */}
        {feature.blocked_by?.map((blockerId) => (
          <span
            key={blockerId}
            style={{
              fontSize: 10,
              background: 'transparent',
              color: '#ef4444',
              padding: '1px 6px',
              borderRadius: 4,
              border: '1px solid #ef4444',
            }}
          >
            ⛔ {blockerId}
          </span>
        ))}

        {/* Open in Cursor button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            openInCursor()
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            opacity: 0.6,
            padding: '2px 4px',
          }}
          title="Open in Cursor (⌘⇧V for preview)"
        >
          📝
        </button>
      </div>

      {/* Display-if-present badges row: Size, Milestone, Hypothesis, Tags */}
      {(feature.size || feature.milestone || feature.hypothesis || feature.tags.length > 0) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          {/* Size badge - gray */}
          {feature.size && (
            <span
              style={{
                fontSize: 10,
                background: '#6b7280',
                color: '#fff',
                padding: '1px 6px',
                borderRadius: 4,
                textTransform: 'uppercase',
              }}
            >
              {feature.size}
            </span>
          )}

          {/* Milestone badge - gray */}
          {feature.milestone && (
            <span
              style={{
                fontSize: 10,
                background: '#6b7280',
                color: '#fff',
                padding: '1px 6px',
                borderRadius: 4,
              }}
            >
              {feature.milestone}
            </span>
          )}

          {/* Hypothesis badge - gray */}
          {feature.hypothesis && (
            <span
              style={{
                fontSize: 10,
                background: '#6b7280',
                color: '#fff',
                padding: '1px 6px',
                borderRadius: 4,
              }}
            >
              {feature.hypothesis}
            </span>
          )}

          {/* Tags - blue, capped at 3 visible */}
          {visibleTags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 10,
                background: '#3b82f6',
                color: '#fff',
                padding: '1px 6px',
                borderRadius: 4,
              }}
            >
              {tag}
            </span>
          ))}

          {/* "+N more" chip if there are hidden tags */}
          {hiddenTagCount > 0 && (
            <span
              style={{
                fontSize: 10,
                background: '#4b5563',
                color: '#fff',
                padding: '1px 6px',
                borderRadius: 4,
              }}
              title={feature.tags.slice(MAX_VISIBLE_TAGS).join(', ')}
            >
              +{hiddenTagCount} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}
