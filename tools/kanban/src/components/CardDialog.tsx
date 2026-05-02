import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Feature, Status, FeatureType, Size, DeliveryStage } from '../lib/types'
import { readPref, STORAGE_KEYS } from '../lib/kanbanStorage'

interface CardDialogProps {
  feature: Feature
  onClose: () => void
  onUpdate?: (feature: Feature) => void
  worktreePath?: string
}

// Options for single-select fields
const STATUS_OPTIONS: Status[] = ['draft', 'backlog', 'week', 'today', 'in-progress', 'blocked', 'qa', 'done', 'all-done', 'rejected']
const ARTICLE_STATUS_OPTIONS: string[] = ['idea', 'draft', 'editing', 'ready', 'published', 'promoted', 'rejected']
const TYPE_OPTIONS: (FeatureType | null)[] = [null, 'bug', 'task', 'story', 'change-request']
const SIZE_OPTIONS: (Size | null)[] = [null, 'xs', 's', 'm', 'l', 'xl']
const DELIVERY_STAGE_OPTIONS: (DeliveryStage | null)[] = [
  null,
  'create-spec', 'create-bug', 'change-request', 'challenge-prd',
  'ux', 'research-arch', 'architect', 'ui', 'generate-tests',
  'spec-review', 'decompose', 'dev', 'fix', 'verify', 'ship',
]

// Color mapping for known property values
const VALUE_COLORS: Record<string, { bg: string; text: string }> = {
  // Status
  backlog: { bg: 'var(--tag-gray-bg)', text: 'var(--tag-gray-text)' },
  week: { bg: 'var(--tag-gray-bg)', text: 'var(--tag-gray-text)' },
  today: { bg: 'var(--tag-green-bg)', text: 'var(--tag-green-text)' },
  'in-progress': { bg: 'var(--tag-blue-bg)', text: 'var(--tag-blue-text)' },
  blocked: { bg: 'var(--tag-red-bg)', text: 'var(--tag-red-text)' },
  done: { bg: 'var(--tag-green-bg)', text: 'var(--tag-green-text)' },
  'all-done': { bg: 'var(--tag-green-bg)', text: 'var(--tag-green-text)' },
  draft: { bg: 'var(--tag-gray-bg)', text: 'var(--tag-gray-text)' },
  rejected: { bg: 'var(--tag-red-bg)', text: 'var(--tag-red-text)' },
  // Type
  bug: { bg: 'var(--tag-red-bg)', text: 'var(--tag-red-text)' },
  task: { bg: 'var(--tag-gray-bg)', text: 'var(--tag-gray-text)' },
  story: { bg: 'var(--tag-blue-bg)', text: 'var(--tag-blue-text)' },
  'change-request': { bg: 'var(--tag-purple-bg)', text: 'var(--tag-purple-text)' },
  // Size
  xs: { bg: 'var(--tag-green-bg)', text: 'var(--tag-green-text)' },
  s: { bg: 'var(--tag-green-bg)', text: 'var(--tag-green-text)' },
  m: { bg: 'var(--tag-yellow-bg)', text: 'var(--tag-yellow-text)' },
  l: { bg: 'var(--tag-orange-bg)', text: 'var(--tag-orange-text)' },
  xl: { bg: 'var(--tag-red-bg)', text: 'var(--tag-red-text)' },
  // Status
  qa: { bg: 'var(--tag-orange-bg)', text: 'var(--tag-orange-text)' },
  // Delivery Stage
  '1-prd-review': { bg: 'var(--tag-yellow-bg)', text: 'var(--tag-yellow-text)' },
  '2-ux-review': { bg: 'var(--tag-yellow-bg)', text: 'var(--tag-yellow-text)' },
  '3-arch-review': { bg: 'var(--tag-yellow-bg)', text: 'var(--tag-yellow-text)' },
  '4-tests-ready': { bg: 'var(--tag-blue-bg)', text: 'var(--tag-blue-text)' },
}

// Default tag color for unknown values
const DEFAULT_TAG = { bg: 'var(--tag-blue-bg)', text: 'var(--tag-blue-text)' }

type EditingField =
  | 'status'
  | 'type'
  | 'size'
  | 'rank'
  | 'tags'
  | 'blocked_by'
  | 'delivery_stage'
  | null

export function CardDialog({
  feature: initialFeature,
  onClose,
  onUpdate,
  worktreePath,
}: CardDialogProps) {
  const [feature, setFeature] = useState(initialFeature)
  const [content, setContent] = useState<string | null>(null)
  const [loadingContent, setLoadingContent] = useState(true)
  const [editingField, setEditingField] = useState<EditingField>(null)
  const [textInputValue, setTextInputValue] = useState('')
  const [tagInputValue, setTagInputValue] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Get worktreePath from localStorage if not provided. Routes through the
  // shared helper so it respects the API-port namespace App sets at config
  // arrival — without this, multiple kanban instances in the same browser
  // (e.g., cp + pp) would read each other's stale worktree.
  const effectiveWorktreePath = worktreePath || readPref(STORAGE_KEYS.worktree) || undefined

  // Fetch markdown content
  useEffect(() => {
    const fetchContent = async () => {
      try {
        const isArticle = /^a\d/.test(feature.id)
        const apiBase = isArticle ? '/api/articles' : '/api/features'
        const url = effectiveWorktreePath
          ? `${apiBase}/${encodeURIComponent(feature.id)}/content?worktree=${encodeURIComponent(effectiveWorktreePath)}`
          : `${apiBase}/${encodeURIComponent(feature.id)}/content`
        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          setContent(data.content)
        }
      } catch (e) {
        console.error('Failed to fetch content:', e)
      } finally {
        setLoadingContent(false)
      }
    }
    fetchContent()
  }, [feature.id, effectiveWorktreePath])

  // Handle escape key and click outside
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingField) {
          setEditingField(null)
        } else {
          onClose()
        }
      }
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setEditingField(null)
      }
    }
    window.addEventListener('keydown', handleEscape)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      window.removeEventListener('keydown', handleEscape)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose, editingField])

  // Focus input when editing text fields
  useEffect(() => {
    if (editingField && ['rank'].includes(editingField)) {
      inputRef.current?.focus()
    }
  }, [editingField])

  // Update feature on server
  const updateFeature = async (updates: Partial<Feature>) => {
    try {
      const isArticle = /^a\d/.test(feature.id)
      const apiBase = isArticle ? '/api/articles' : '/api/features'
      const url = effectiveWorktreePath
        ? `${apiBase}/${encodeURIComponent(feature.id)}?worktree=${encodeURIComponent(effectiveWorktreePath)}`
        : `${apiBase}/${encodeURIComponent(feature.id)}`
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        const data = await res.json()
        const updatedFeature = { ...feature, ...updates }
        setFeature(updatedFeature)
        if (onUpdate && data.feature) {
          onUpdate(data.feature)
        }
      }
    } catch (e) {
      console.error('Failed to update feature:', e)
    }
  }

  const tagStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    height: 20,
    fontSize: 'var(--font-size-12)',
    padding: '0 6px',
    borderRadius: '3px',
    fontWeight: 'var(--font-weight-regular)',
  }

  const propertyRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    minHeight: 28,
    padding: '4px 0',
    cursor: 'pointer',
    borderRadius: '4px',
    marginLeft: -4,
    marginRight: -4,
    paddingLeft: 4,
    paddingRight: 4,
  }

  const propertyLabelStyle: React.CSSProperties = {
    width: 120,
    flexShrink: 0,
    fontSize: 'var(--font-size-12)',
    color: 'var(--text-secondary)',
    paddingTop: 2,
  }

  const formatPropertyName = (key: string): string => {
    return key
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .replace(/^\w/, (c) => c.toUpperCase())
  }

  const getTagColors = (value: string) => {
    return VALUE_COLORS[value] || DEFAULT_TAG
  }

  const emptyStyle: React.CSSProperties = {
    fontSize: 'var(--font-size-14)',
    color: 'var(--text-tertiary)',
  }

  // Render single-select dropdown
  const renderSelectDropdown = (
    field: 'status' | 'type' | 'size' | 'delivery_stage',
    options: (string | null)[],
    currentValue: string | null | undefined
  ) => {
    return (
      <div
        ref={dropdownRef}
        style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 4,
          background: 'white',
          borderRadius: '6px',
          boxShadow:
            'rgba(15, 15, 15, 0.05) 0px 0px 0px 1px, rgba(15, 15, 15, 0.1) 0px 3px 6px, rgba(15, 15, 15, 0.2) 0px 9px 24px',
          padding: '6px 0',
          minWidth: 180,
          zIndex: 1002,
        }}
      >
        {options.map((option) => {
          const isSelected = option === currentValue || (option === null && !currentValue)
          const colors = option ? getTagColors(option) : null
          return (
            <div
              key={option ?? 'empty'}
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                updateFeature({ [field]: option })
                setEditingField(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation()
                  updateFeature({ [field]: option })
                  setEditingField(null)
                }
              }}
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: isSelected ? 'var(--bg-hover)' : 'transparent',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = isSelected ? 'var(--bg-hover)' : 'transparent')
              }
            >
              {option ? (
                <span style={{ ...tagStyle, background: colors?.bg, color: colors?.text }}>
                  {option}
                </span>
              ) : (
                <span style={emptyStyle}>Empty</span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const renderNumberInput = () => {
    return (
      <div ref={dropdownRef} style={{ flex: 1 }}>
        <input
          ref={inputRef}
          type="number"
          step="0.001"
          min="0"
          value={textInputValue}
          onChange={(e) => setTextInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const num = parseFloat(textInputValue)
              updateFeature({ rank: !isNaN(num) && num >= 0 ? num : undefined })
              setEditingField(null)
            }
            if (e.key === 'Escape') {
              setEditingField(null)
            }
          }}
          onBlur={() => {
            const num = parseFloat(textInputValue)
            updateFeature({ rank: !isNaN(num) && num >= 0 ? num : undefined })
            setEditingField(null)
          }}
          placeholder="Enter rank (e.g., 1.5)..."
          style={{
            width: '100%',
            padding: '4px 8px',
            fontSize: 'var(--font-size-14)',
            border: '1px solid rgba(55, 53, 47, 0.16)',
            borderRadius: '4px',
            outline: 'none',
            fontFamily: 'var(--font-family)',
          }}
        />
      </div>
    )
  }

  // Render multi-select tag input
  const renderTagInput = (field: 'tags' | 'blocked_by', currentTags: string[]) => {
    return (
      <div ref={dropdownRef} style={{ flex: 1 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          {currentTags.map((tag, i) => {
            const colors = getTagColors(tag)
            return (
              <span
                key={i}
                role="button"
                tabIndex={0}
                style={{
                  ...tagStyle,
                  background: colors.bg,
                  color: colors.text,
                  cursor: 'pointer',
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  const newTags = currentTags.filter((_, idx) => idx !== i)
                  updateFeature({ [field]: newTags })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation()
                    const newTags = currentTags.filter((_, idx) => idx !== i)
                    updateFeature({ [field]: newTags })
                  }
                }}
                title="Click to remove"
              >
                {tag}
                <span style={{ marginLeft: 4, opacity: 0.7 }}>x</span>
              </span>
            )
          })}
          <input
            type="text"
            value={tagInputValue}
            onChange={(e) => setTagInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && tagInputValue.trim()) {
                const newTags = [...currentTags, tagInputValue.trim()]
                updateFeature({ [field]: newTags })
                setTagInputValue('')
              }
              if (e.key === 'Escape') {
                setEditingField(null)
                setTagInputValue('')
              }
              if (e.key === 'Backspace' && !tagInputValue && currentTags.length > 0) {
                const newTags = currentTags.slice(0, -1)
                updateFeature({ [field]: newTags })
              }
            }}
            placeholder={currentTags.length === 0 ? `Add ${field === 'tags' ? 'tag' : 'blocker'}...` : ''}
            style={{
              flex: 1,
              minWidth: 80,
              padding: '4px 0',
              fontSize: 'var(--font-size-14)',
              border: 'none',
              outline: 'none',
              fontFamily: 'var(--font-family)',
              background: 'transparent',
            }}
            autoFocus
          />
        </div>
      </div>
    )
  }

  // Render property value (display mode)
  const renderValue = (value: unknown) => {
    // Empty state
    if (value === null || value === undefined) {
      return <span style={emptyStyle}>Empty</span>
    }

    // Arrays (tags, blocked_by)
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span style={emptyStyle}>Empty</span>
      }
      return (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {value.map((item, i) => {
            const strValue = String(item)
            const colors = getTagColors(strValue)
            return (
              <span key={i} style={{ ...tagStyle, background: colors.bg, color: colors.text }}>
                {strValue}
              </span>
            )
          })}
        </div>
      )
    }

    // Booleans
    if (typeof value === 'boolean') {
      return (
        <span
          style={{
            ...tagStyle,
            background: value ? 'var(--tag-green-bg)' : 'var(--tag-gray-bg)',
            color: value ? 'var(--tag-green-text)' : 'var(--tag-gray-text)',
          }}
        >
          {value ? 'Yes' : 'No'}
        </span>
      )
    }

    // Strings
    const strValue = String(value)
    const colors = getTagColors(strValue)

    // Long text renders as plain text
    if (strValue.length > 50) {
      return (
        <span style={{ fontSize: 'var(--font-size-14)', color: 'var(--text-primary)', flex: 1 }}>
          {strValue}
        </span>
      )
    }

    return (
      <span style={{ ...tagStyle, background: colors.bg, color: colors.text }}>
        {strValue}
      </span>
    )
  }

  const isArticle = /^a\d/.test(feature.id)

  // Editable property definitions
  const editableProperties: { key: EditingField; options?: (string | null)[] }[] = [
    { key: 'type', options: TYPE_OPTIONS as (string | null)[] },
    { key: 'status', options: isArticle ? ARTICLE_STATUS_OPTIONS : STATUS_OPTIONS as string[] },
    { key: 'rank' }, // P141: number input (not select)
    { key: 'size', options: SIZE_OPTIONS as (string | null)[] },
    { key: 'delivery_stage', options: DELIVERY_STAGE_OPTIONS as (string | null)[] },
    { key: 'tags' },
    { key: 'blocked_by' },
  ]

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Close dialog"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 15, 15, 0.6)',
          zIndex: 1000,
        }}
      />

      {/* Dialog */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(900px, 90vw)',
          maxHeight: '85vh',
          background: 'var(--bg-page)',
          borderRadius: '8px',
          boxShadow:
            'rgba(15, 15, 15, 0.05) 0px 0px 0px 1px, rgba(15, 15, 15, 0.1) 0px 5px 10px, rgba(15, 15, 15, 0.2) 0px 15px 40px',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header with action buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '8px 8px 0',
            gap: 4,
          }}
        >
          {/* Open in Cursor button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              fetch('/api/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: feature.path }),
              })
            }}
            title="Open in Cursor"
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: 14,
              color: 'var(--text-secondary)',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            <img
              src="https://cursor.com/favicon.ico"
              alt="Cursor"
              width="16"
              height="16"
              style={{ opacity: 0.7 }}
            />
          </button>
          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: 18,
              color: 'var(--text-secondary)',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 72px 48px',
          }}
        >
          {/* Title */}
          <h1
            style={{
              fontSize: 32,
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--text-primary)',
              lineHeight: 1.2,
              marginBottom: 24,
            }}
          >
            {feature.title}
          </h1>

          {/* Editable Properties */}
          <div
            style={{
              borderTop: '1px solid rgba(55, 53, 47, 0.09)',
              paddingTop: 12,
              marginBottom: 24,
            }}
          >
            {editableProperties.map(({ key, options }) => {
              if (!key) return null
              const value = feature[key as keyof Feature]
              const isEditing = editingField === key

              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  style={{
                    ...propertyRowStyle,
                    position: 'relative',
                    background: isEditing ? 'var(--bg-hover)' : undefined,
                  }}
                  onClick={() => {
                    if (!isEditing) {
                      setEditingField(key)
                      if (key === 'rank') {
                        setTextInputValue(value !== undefined ? String(value) : '')
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !isEditing) {
                      setEditingField(key)
                      if (key === 'rank') {
                        setTextInputValue(value !== undefined ? String(value) : '')
                      }
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (!isEditing) e.currentTarget.style.background = 'var(--bg-hover)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isEditing) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <div style={propertyLabelStyle}>{formatPropertyName(key)}</div>
                  <div style={{ flex: 1, position: 'relative' }}>
                    {isEditing ? (
                      // Editing mode
                      options ? (
                        // Single-select dropdown
                        <>
                          {renderValue(value)}
                          {renderSelectDropdown(
                            key as 'status' | 'type' | 'size' | 'delivery_stage',
                            options,
                            value as string | null
                          )}
                        </>
                      ) : key === 'tags' || key === 'blocked_by' ? (
                        // Multi-select tag input
                        renderTagInput(key, (value as string[]) || [])
                      ) : key === 'rank' ? (
                        // Number input for rank
                        renderNumberInput()
                      ) : null
                    ) : (
                      // Display mode
                      renderValue(value)
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Markdown content */}
          <div
            style={{
              borderTop: '1px solid rgba(55, 53, 47, 0.09)',
              paddingTop: 16,
            }}
          >
            {loadingContent ? (
              <div style={{ color: 'var(--text-tertiary)' }}>Loading...</div>
            ) : content ? (
              <div className="markdown-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            ) : (
              <div style={{ color: 'var(--text-tertiary)' }}>No content</div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
