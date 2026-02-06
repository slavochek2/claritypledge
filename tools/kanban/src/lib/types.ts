// Status columns for Notion-style kanban
export type Status = 'backlog' | 'week' | 'today' | 'in-progress' | 'blocked' | 'done' | 'rejected'

// Feature type badge (first-class badge)
export type FeatureType = 'bug' | 'task' | 'story' | 'comment'

// Priority badge (first-class badge, AI-managed)
export type Priority = 'p0' | 'p1' | 'p2' | 'p3'

// Size badge (display-if-present, AI-managed)
export type Size = 'xs' | 's' | 'm' | 'l' | 'xl'

// Column IDs match status values
export type ColumnId = Status

export interface Feature {
  id: string // filename without extension (e.g., "p112")
  path: string // full path to file
  title: string // from first # heading or filename
  status: Status
  // First-class badges
  type?: FeatureType
  priority?: Priority
  blocked_by?: string[] // AI-managed, display only
  // Display-if-present badges
  size?: Size // AI-managed
  milestone?: string // AI-managed
  hypothesis?: string // e.g., "H-Biz", "H2"
  tags: string[]
  created?: string
  // Added for P113: Backlog & Sorting improvements
  completed_at?: string // ISO date (YYYY-MM-DD) when moved to done
  sort_order?: number // For within-column ordering (fractional)
  // Spec readiness (derived from prepped_date)
  prepped?: boolean // true if prepped_date is set
}
