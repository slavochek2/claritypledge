/**
 * CommonJS wrapper for config.ts
 * Allows shell scripts to read config via: node -e "console.log(require('./config.cjs').KANBAN_CONFIG.ports.frontend)"
 *
 * Mirrors config.ts: ports may be overridden via KANBAN_PORT_FRONTEND / KANBAN_PORT_API.
 */

function parsePort(raw, fallback) {
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const KANBAN_CONFIG = {
  ports: {
    frontend: parsePort(process.env.KANBAN_PORT_FRONTEND, 9050),
    api: parsePort(process.env.KANBAN_PORT_API, 9051),
  },
}

module.exports = { KANBAN_CONFIG }
