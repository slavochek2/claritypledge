import { useState } from 'react'

export type PageId = 'day' | 'board' | 'focus' | 'content' | 'pipeline'

interface SidebarProps {
  currentPage: PageId
  onPageChange: (page: PageId) => void
  collapsed: boolean
  onToggleCollapse: () => void
  // App owns the visible page list (filtered by KANBAN_HIDE_PAGES). Sidebar
  // renders whatever is passed; no local hardcoded array.
  pages: { id: PageId; icon: string; label: string }[]
}

export function Sidebar({ currentPage, onPageChange, collapsed, onToggleCollapse, pages }: SidebarProps) {
  const [hoveredPage, setHoveredPage] = useState<PageId | null>(null)

  return (
    <div
      style={{
        width: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
        flexShrink: 0,
        paddingTop: 'var(--spacing-4)',
        transition: 'width 0.15s ease',
        overflow: 'hidden',
      }}
    >
      {/* Collapse toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '0' : '0 var(--spacing-12)',
          marginBottom: 'var(--spacing-4)',
          height: 40,
        }}
      >
        {!collapsed && (
          <span
            style={{
              fontSize: 'var(--font-size-11)',
              fontWeight: 'var(--font-weight-medium)',
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              whiteSpace: 'nowrap',
            }}
          >
            Pages
          </span>
        )}
        <button
          onClick={onToggleCollapse}
          className="kb-icon"
          style={{ fontSize: 14, color: 'var(--text-tertiary)' }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '\u{00BB}' : '\u{00AB}'}
        </button>
      </div>

      {pages.map((page) => {
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
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: collapsed ? 0 : 'var(--spacing-8)',
              width: collapsed ? 40 : 'calc(100% - 8px)',
              minHeight: 40,
              padding: collapsed ? 'var(--spacing-6)' : 'var(--spacing-6) var(--spacing-12)',
              fontSize: 'var(--font-size-14)',
              fontWeight: 'var(--font-weight-semibold)',
              color: isActive ? 'var(--cp-fg)' : 'var(--cp-fg3)',
              boxShadow: isActive ? '0 0 0 1px var(--cp-line), var(--cp-sh)' : 'none',
              background: isActive
                ? 'var(--bg-sidebar-item-active)'
                : isHovered
                  ? 'var(--bg-sidebar-item-hover)'
                  : 'transparent',
              border: 'none',
              borderRadius: 'var(--cp-r)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.1s, width 0.15s ease',
              margin: collapsed ? '0 auto var(--spacing-2)' : '0 var(--spacing-4) var(--spacing-2)',
              boxSizing: 'border-box',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
            title={collapsed ? page.label : undefined}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{page.icon}</span>
            {!collapsed && page.label}
          </button>
        )
      })}
    </div>
  )
}
