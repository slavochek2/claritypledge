import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { KANBAN_CONFIG } from './config'

export default defineConfig({
  plugins: [react()],
  server: {
    port: KANBAN_CONFIG.ports.frontend,
    proxy: {
      '/api': `http://localhost:${KANBAN_CONFIG.ports.api}`
    }
  }
})
