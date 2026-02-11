/**
 * CommonJS wrapper for config.ts
 * Allows shell scripts to read config via: node -e "console.log(require('./config.js').KANBAN_CONFIG.ports.frontend)"
 */

const KANBAN_CONFIG = {
  ports: {
    frontend: 9050,
    api: 9051,
  },
}

module.exports = { KANBAN_CONFIG }
