import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Feature, FeatureType } from '../lib/types'
import { CardDialog } from './CardDialog'

interface CardProps {
  feature: Feature
  onFeatureUpdate?: () => void
}

const TYPE_PREFIX: Record<FeatureType, string> = {
  story: '[US]',
  task: '[T]',
  bug: '[B]',
  comment: '[C]',
}

const TAG_COLORS = [
  { bg: 'var(--tag-blue-bg)', text: 'var(--tag-blue-text)' },
  { bg: 'var(--tag-purple-bg)', text: 'var(--tag-purple-text)' },
  { bg: 'var(--tag-pink-bg)', text: 'var(--tag-pink-text)' },
  { bg: 'var(--tag-green-bg)', text: 'var(--tag-green-text)' },
  { bg: 'var(--tag-yellow-bg)', text: 'var(--tag-yellow-text)' },
  { bg: 'var(--tag-orange-bg)', text: 'var(--tag-orange-text)' },
]

const getTagColor = (tag: string) => {
  const hash = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return TAG_COLORS[hash % TAG_COLORS.length]
}

const MAX_VISIBLE_TAGS = 3

export function Card({ feature, onFeatureUpdate }: CardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: feature.id,
    data: { status: feature.status },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

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

  const visibleTags = feature.tags.slice(0, MAX_VISIBLE_TAGS)
  const hiddenTagCount = feature.tags.length - MAX_VISIBLE_TAGS

  // Notion's exact tag style - 20px height, 12px font
  const tagStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    height: 20,
    fontSize: 12,
    padding: '0 6px',
    borderRadius: 3,
    fontWeight: 400,
    whiteSpace: 'nowrap',
    lineHeight: 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: isDragging
          ? 'var(--bg-card-dragging)'
          : isHovered
            ? 'var(--bg-card-hover)'
            : 'var(--bg-card)',
        borderRadius: 'var(--radius-card)',
        padding: '10px 10px 12px',
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.9 : 1,
        boxShadow: isDragging ? 'var(--shadow-card-dragging)' : 'var(--shadow-card)',
        zIndex: isDragging ? 100 : 1,
        userSelect: 'none',
        position: 'relative',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        // Sensor has 5px activation constraint, so clicks work normally
        if (!isDragging) {
          setDialogOpen(true)
        }
      }}
      {...listeners}
      {...attributes}
    >
      {/* Title */}
      <div
        style={{
          fontSize: 14,
          fontWeight: 400,
          color: 'var(--text-primary)',
          lineHeight: 1.5,
          wordBreak: 'break-word',
          marginBottom: 6,
        }}
      >
        {feature.type ? `${TYPE_PREFIX[feature.type]} ` : ''}{feature.title}
      </div>

      {/* Open button - only visible on hover, solid bg to cover text */}
      {isHovered && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            openInCursor()
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f7f6f3',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            borderRadius: 4,
            boxShadow: 'rgba(55, 53, 47, 0.1) 0px 0px 0px 1px',
          }}
          title="Open in Cursor"
        >
          <img
            src="https://cursor.com/favicon.ico"
            alt="Cursor"
            width="14"
            height="14"
            style={{ opacity: 0.8 }}
          />
        </button>
      )}

      {/* Properties — each property type on its own row like Notion */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Rank + Size */}
        {(feature.rank !== undefined || feature.size) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ ...tagStyle, background: 'var(--tag-blue-bg)', color: 'var(--tag-blue-text)' }}>
              #{Math.floor(feature.rank)}
            </span>
            {feature.size && (
              <span style={{ ...tagStyle, background: 'var(--tag-pink-bg)', color: 'var(--tag-pink-text)' }}>
                {feature.size}
              </span>
            )}
          </div>
        )}

        {/* Blocked_by */}
        {feature.blocked_by?.length ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {feature.blocked_by.map((blockerId) => (
              <span key={blockerId} style={{ ...tagStyle, background: 'var(--tag-red-bg)', color: 'var(--tag-red-text)' }}>
                ⛔ {blockerId}
              </span>
            ))}
          </div>
        ) : null}

        {/* Spec readiness */}
        {feature.prepped && (
          <span style={{ ...tagStyle, background: 'var(--tag-green-bg)', color: 'var(--tag-green-text)' }}>
            prepped
          </span>
        )}

        {/* Delivery stage */}
        {feature.delivery_stage && (
          <span style={{ ...tagStyle, background: 'var(--tag-blue-bg)', color: 'var(--tag-blue-text)' }}>
            {feature.delivery_stage}
          </span>
        )}

        {/* Tags */}
        {(visibleTags.length > 0 || hiddenTagCount > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {visibleTags.map((tag) => {
              const colors = getTagColor(tag)
              return (
                <span key={tag} style={{ ...tagStyle, background: colors.bg, color: colors.text }}>
                  {tag}
                </span>
              )
            })}
            {hiddenTagCount > 0 && (
              <span style={{ ...tagStyle, background: 'var(--tag-default-bg)', color: 'var(--text-secondary)' }} title={feature.tags.slice(MAX_VISIBLE_TAGS).join(', ')}>
                +{hiddenTagCount}
              </span>
            )}
          </div>
        )}

        {/* Workstream */}
        {feature.workstream && (
          <span
            style={{ ...tagStyle, background: 'var(--tag-purple-bg)', color: 'var(--tag-purple-text)' }}
            title={`Workstream: ${feature.workstream}`}
          >
            {feature.workstream}
          </span>
        )}

        {/* Hypothesis */}
        {feature.hypothesis && (
          <span style={{ ...tagStyle, background: 'var(--tag-yellow-bg)', color: 'var(--tag-yellow-text)' }}>
            {feature.hypothesis}
          </span>
        )}
      </div>

      {/* Card detail dialog */}
      {dialogOpen && <CardDialog feature={feature} onClose={() => setDialogOpen(false)} onUpdate={onFeatureUpdate ? () => onFeatureUpdate() : undefined} />}
    </div>
  )
}
