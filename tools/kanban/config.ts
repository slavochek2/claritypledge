/**
 * Kanban Tool Configuration
 *
 * SINGLE SOURCE OF TRUTH for all kanban port allocations.
 * All consumers (vite, API server, launch scripts) import from here.
 *
 * To change ports: edit this file only. All consumers will update automatically.
 */

export const KANBAN_CONFIG = {
  ports: {
    /** Vite development server (frontend) */
    frontend: 9050,
    /** Express API server (backend) */
    api: 9051,
  },
} as const
