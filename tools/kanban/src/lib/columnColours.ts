// Column header colours → their status pill. Amber means "needs you" (QA) and nothing else:
// Blocked has its own red family, and the Pipeline and Content boards use neutral slate where
// they used amber. Blue = an action, green = worked.

export const COLUMN_COLOURS = {
  gray: '#6b7280',
  slate: '#64748b',
  blue: '#3b82f6',
  red: '#ef4444',
  green: '#22c55e',
  amber: '#f59e0b',
  purple: '#8b5cf6',
} as const

export interface StatusStyle { bg: string; text: string }

const MAP: Record<string, StatusStyle> = {
  [COLUMN_COLOURS.gray]: { bg: 'var(--status-gray-bg)', text: 'var(--status-gray-text)' },
  [COLUMN_COLOURS.slate]: { bg: 'var(--status-gray-bg)', text: 'var(--status-gray-text)' },
  [COLUMN_COLOURS.blue]: { bg: 'var(--status-blue-bg)', text: 'var(--status-blue-text)' },
  [COLUMN_COLOURS.red]: { bg: 'var(--status-red-bg)', text: 'var(--status-red-text)' },
  [COLUMN_COLOURS.green]: { bg: 'var(--status-green-bg)', text: 'var(--status-green-text)' },
  [COLUMN_COLOURS.amber]: { bg: 'var(--status-yellow-bg)', text: 'var(--status-yellow-text)' },
  [COLUMN_COLOURS.purple]: { bg: 'var(--tag-purple-bg)', text: 'var(--tag-purple-text)' },
}

export const statusStyleFor = (color: string): StatusStyle => MAP[color] ?? MAP[COLUMN_COLOURS.gray]

/** The header count: red over the WIP limit (something needs a decision), plain at it, quiet under it. */
export const wipCountColour = (count: number, limit?: number): string =>
  limit === undefined || count < limit ? 'var(--text-tertiary)' : count > limit ? 'var(--cp-red-800)' : 'var(--cp-fg)'
