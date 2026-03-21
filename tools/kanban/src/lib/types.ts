// Status columns for Notion-style kanban
export type Status = 'backlog' | 'week' | 'today' | 'in-progress' | 'blocked' | 'qa' | 'done' | 'all-done' | 'draft' | 'rejected'

// Article pipeline statuses (content kanban — separate from feature board)
export type ArticleStatus = 'idea' | 'draft' | 'editing' | 'ready' | 'published' | 'promoted' | 'rejected'

// Feature type badge (first-class badge)
export type FeatureType = 'bug' | 'task' | 'story' | 'comment' | 'change-request'

// Size badge (display-if-present, AI-managed)
export type Size = 'xs' | 's' | 'm' | 'l' | 'xl'

// Delivery stage (software delivery process tracking)
export type DeliveryStage =
  | 'prd-draft'
  | 'prd-review'
  | 'prd-approved'
  | 'ux-design'
  | 'ux-review'
  | 'ux-approved'
  | 'arch-design'
  | 'arch-review'
  | 'arch-approved'
  | 'tests-generated'
  | 'implementation'
  | 'uat'

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
  // Legacy fields — kept in frontmatter but unused by UI
  workstream?: string
  hypothesis?: string
  delivery_stage?: DeliveryStage // Software delivery process stage (AI-managed)
  tags: string[]
  created?: string
  // Added for P113: Backlog & Sorting improvements
  completed_at?: string // ISO date (YYYY-MM-DD) when moved to done
  // Added for P141: Unified Rank System
  rank: number // Fractional rank for ordering (e.g., 1.0, 1.5, 2.0)
  // Spec readiness (derived from prepped_date)
  prepped?: boolean // true if prepped_date is set
  // Legacy field — kept in frontmatter but unused by UI
  milestone?: string
  // Manual status lock — set by kanban UI when user changes status; agents must not override
  locked_at?: string // ISO timestamp of last manual status change
  // Implementation flow chosen by /pick-flow or agent (P451)
  flow?: 'fix' | 'dev' | 'inline' | 'quick-feature'
}

// Article — content pipeline item (P449: content kanban)
// Uses ArticleStatus for pipeline stages; rendered by ContentPage via same Card/Column components
export interface Article {
  id: string            // filename without extension (e.g., "a1")
  path: string          // full path to file
  title: string         // from first # heading or filename
  status: ArticleStatus
  rank: number          // fractional rank for ordering within column
  tags: string[]
  published_at?: string // ISO date set when status → published
}

