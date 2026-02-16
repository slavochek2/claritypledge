// Status columns for Notion-style kanban
export type Status = 'backlog' | 'week' | 'today' | 'in-progress' | 'blocked' | 'done' | 'draft' | 'rejected'

// Feature type badge (first-class badge)
export type FeatureType = 'bug' | 'task' | 'story' | 'comment'

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
  blocked_by?: string[] // AI-managed, display only
  // Display-if-present badges
  size?: Size // AI-managed
  workstream?: string // AI-managed (e.g., "C1", "C2", "R1")
  /**
   * @deprecated Use workstream field instead. Hypotheses were merged into workstreams (P130).
   * See docs/decisions.md "2026-02-07: Workstreams replace hypotheses"
   */
  hypothesis?: string // e.g., "H-Biz", "H2"
  tags: string[]
  created?: string
  // Added for P113: Backlog & Sorting improvements
  completed_at?: string // ISO date (YYYY-MM-DD) when moved to done
  // Added for P141: Unified Rank System
  rank: number // Fractional rank for ordering (e.g., 1.0, 1.5, 2.0)
  // Spec readiness (derived from prepped_date)
  prepped?: boolean // true if prepped_date is set
  // Milestone association (for focus page grouping)
  milestone?: string // e.g., "M1", "M2"
}

// Milestone status
export type MilestoneStatus = 'active' | 'next' | 'future'

// Milestone metadata from docs/milestones/
export interface Milestone {
  id: string // e.g., "M1", "M2"
  title: string // from first # heading
  filename: string // e.g., "m1-stories-live-events.md"
  path: string // full path to file
  status: MilestoneStatus
  summary?: string // One-line description for hover
  tests?: string[] // e.g., ["H-Stories"]
  answers?: string[] // e.g., ["OQ-6", "OQ-7"]
}
