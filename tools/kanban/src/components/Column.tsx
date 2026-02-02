import { useDroppable } from '@dnd-kit/core'
import { Card } from './Card'
import { Feature, ColumnId } from '../lib/types'

interface ColumnProps {
  id: ColumnId
  title: string
  color: string
  features: Feature[]
}

export function Column({ id, title, color, features }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{
        background: isOver ? '#2a2a4a' : '#16213e',
        borderRadius: 8,
        padding: 12,
        minHeight: 400,
        transition: 'background 0.2s',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: `2px solid ${color}`,
        }}
      >
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: color,
          }}
        />
        <h2 style={{ fontSize: 14, fontWeight: 600 }}>{title}</h2>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            opacity: 0.6,
            background: '#0f0f23',
            padding: '2px 8px',
            borderRadius: 10,
          }}
        >
          {features.length}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {features.length === 0 ? (
          <div
            style={{
              color: 'rgba(255, 255, 255, 0.4)',
              fontStyle: 'italic',
              textAlign: 'center',
              padding: '24px 12px',
              fontSize: 13,
            }}
          >
            No items
          </div>
        ) : (
          features.map((feature) => (
            <Card key={feature.id} feature={feature} />
          ))
        )}
      </div>
    </div>
  )
}
