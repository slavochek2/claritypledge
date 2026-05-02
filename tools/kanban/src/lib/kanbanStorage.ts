// Shared localStorage helpers. Keys are scoped by API port so embedders running
// multiple kanban instances in the same browser (e.g., cp on :9051 + pp on :9053)
// don't share state. App sets the port on config arrival via setStorageApiPort.
// Pre-config reads fall back to the legacy un-namespaced key.

let _apiPort: number | null = null

export const STORAGE_KEYS = {
  viewMode: 'view-mode',
  focusViewMode: 'focus-view-mode',
  typeFilter: 'type-filter',
  worktree: 'worktree',
  page: 'page',
  sidebarCollapsed: 'sidebar-collapsed',
} as const

export function setStorageApiPort(port: number): void {
  _apiPort = port
}

export function readPref(key: string): string | null {
  if (_apiPort !== null) {
    const v = localStorage.getItem(`kanban-${_apiPort}-${key}`)
    if (v !== null) return v
  }
  return localStorage.getItem(`kanban-${key}`)
}

export function writePref(key: string, value: string): void {
  if (_apiPort !== null) {
    localStorage.setItem(`kanban-${_apiPort}-${key}`, value)
  } else {
    localStorage.setItem(`kanban-${key}`, value)
  }
}

export function migrateLegacyKeys(apiPort: number): void {
  for (const key of Object.values(STORAGE_KEYS)) {
    const oldKey = `kanban-${key}`
    const newKey = `kanban-${apiPort}-${key}`
    if (localStorage.getItem(newKey) === null) {
      const existing = localStorage.getItem(oldKey)
      if (existing !== null) localStorage.setItem(newKey, existing)
    }
  }
}
