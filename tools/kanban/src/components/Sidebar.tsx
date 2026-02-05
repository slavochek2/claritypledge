import { useState } from 'react'

export type PageId = 'board' | 'focus'

interface SidebarProps {
  currentPage: PageId
  onPageChange: (page: PageId) => void
}

const PAGES: { id: PageId; icon: string; label: string }[] = [
  { id: 'board', icon: '\u{1F4CB}', label: 'Board' },
  { id: 'focus', icon: '\u{1F3AF}', label: 'Focus' },
]

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  const [hoveredPage, setHoveredPage] = useState<PageId | null>(null)

  return (
    <div
      style={{
        width: 'var(--sidebar-width)',
        flexShrink: 0,
        paddingTop: 'var(--spacing-4)',
      }}
    >
      <div
        style={{
          fontSize: 'var(--font-size-11)',
          fontWeight: 'var(--font-weight-medium)',
          color: 'var(--text-tertiary)',
          padding: '0 var(--spacing-12)',
          marginBottom: 'var(--spacing-4)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Pages
      </div>

      {PAGES.map((page) => {
        const isActive = currentPage === page.id
        const isHovered = hoveredPage === page.id

        return (
          <button
            key={page.id}
            onClick={() => onPageChange(page.id)}
            onMouseEnter={() => setHoveredPage(page.id)}
            onMouseLeave={() => setHoveredPage(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-8)',
              width: '100%',
              padding: 'var(--spacing-6) var(--spacing-12)',
              fontSize: 'var(--font-size-14)',
              fontWeight: isActive ? 'var(--font-weight-medium)' : 'var(--font-weight-regular)',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: isActive
                ? 'var(--bg-sidebar-item-active)'
                : isHovered
                  ? 'var(--bg-sidebar-item-hover)'
                  : 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.1s',
              margin: '0 var(--spacing-4)',
              boxSizing: 'border-box',
            }}
          >
            <span style={{ fontSize: 16 }}>{page.icon}</span>
            {page.label}
          </button>
        )
      })}
    </div>
  )
}
