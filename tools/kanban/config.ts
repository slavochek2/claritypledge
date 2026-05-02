/**
 * Kanban Tool Configuration
 *
 * SINGLE SOURCE OF TRUTH for kanban port allocations.
 * All consumers (vite, API server, launch scripts) import from here.
 *
 * Ports may be overridden via env vars (KANBAN_PORT_FRONTEND, KANBAN_PORT_API)
 * to allow embedding in other projects (e.g., pp). Defaults preserve cp behavior.
 */

const FRONTEND_DEFAULT = 9050
const API_DEFAULT = 9051

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const KANBAN_CONFIG = {
  ports: {
    /** Vite development server (frontend) */
    frontend: parsePort(process.env.KANBAN_PORT_FRONTEND, FRONTEND_DEFAULT),
    /** Express API server (backend) */
    api: parsePort(process.env.KANBAN_PORT_API, API_DEFAULT),
  },
} as const
