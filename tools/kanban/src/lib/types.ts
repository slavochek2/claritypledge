export type Status = 'backlog' | 'in-progress' | 'done'
export type Priority = 'urgent-important' | 'important' | 'urgent' | 'neither'
export type ColumnId = 'urgent-important' | 'important' | 'in-progress' | 'done'

export interface Feature {
  id: string // filename without extension
  path: string // full path to file
  title: string // from first # heading or filename
  status: Status
  priority: Priority
  hypothesis?: string // e.g., "H-Biz", "H2"
  tags: string[]
  created?: string
}
