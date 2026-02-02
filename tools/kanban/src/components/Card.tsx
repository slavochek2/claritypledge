import { useDraggable } from '@dnd-kit/core'
import { Feature } from '../lib/types'

interface CardProps {
  feature: Feature
}

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
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          marginBottom: 6,
          lineHeight: 1.3,
        }}
      >
        {feature.title}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontSize: 11,
            opacity: 0.5,
            fontFamily: 'monospace',
          }}
        >
          {feature.id}
        </span>

        {feature.hypothesis && (
          <span
            style={{
              fontSize: 10,
              background: '#8b5cf6',
              color: '#fff',
              padding: '1px 6px',
              borderRadius: 4,
            }}
          >
            {feature.hypothesis}
          </span>
        )}

        {feature.tags.map((tag) => (
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
    </div>
  )
}
