// Status columns for Notion-style kanban
export type Status = 'backlog' | 'week' | 'today' | 'in-progress' | 'blocked' | 'qa' | 'done' | 'all-done' | 'draft' | 'rejected'

// Article pipeline statuses (content kanban — separate from feature board)
export type ArticleStatus = 'idea' | 'draft' | 'editing' | 'ready' | 'published' | 'promoted' | 'rejected'

// Feature type badge (first-class badge)
export type FeatureType = 'bug' | 'task' | 'story' | 'comment' | 'change-request'

// Size badge (display-if-present, AI-managed)
export type Size = 'xs' | 's' | 'm' | 'l' | 'xl'

// Delivery stage (software delivery process tracking)
// Skill-name values (P659): each pipeline skill stamps its name
export type DeliveryStage =
  | 'create-spec'
  | 'create-bug'
  | 'change-request'
  | 'challenge-prd'
  | 'ux'
  | 'research-arch'
  | 'architect'
  | 'ui'
  | 'generate-tests'
  | 'spec-review'
  | 'decompose'
  | 'dev'
  | 'fix'
  | 'verify'
  | 'ship'
  // Legacy values (pre-P659) — accepted for old specs
  | '1-prd-review'
  | '2-ux-review'
  | '3-arch-review'
  | '3.5-ui-review'
  | '4-tests-ready'
  | '5-decomposed'
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

// CRM pipeline stages (P962)
export type OpportunityStage = 'contacted' | 'in-conversation' | 'qualified' | 'committed' | 'active' | 'closed'

// CRM opportunity types (P962)
export type OpportunityType = 'founder' | 'coach' | 'distribution-partner' | 'investor'

// Opportunity — CRM pipeline item (P962)
export interface Opportunity {
  id: string                   // filename without extension
  path: string                 // full path to file
  name: string                 // from frontmatter `name` or first # heading or filename
  type?: OpportunityType       // optional badge
  stage: OpportunityStage      // pipeline stage (default: 'contacted')
  next_step?: string           // next action
  next_date?: string           // ISO date (YYYY-MM-DD)
  contact_ref?: string         // reference to contact record
}

