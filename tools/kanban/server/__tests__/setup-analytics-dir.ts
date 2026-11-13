// P1673: the Day run route now reads the weekly insights, from the founder's private analytics dir
// (~/.claude-analytics) unless KANBAN_ANALYTICS_DIR says otherwise. A test that seeds a run must never
// see the real read, so every test file starts with an empty one; a test that needs a read sets its own.
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

if (!process.env.KANBAN_ANALYTICS_DIR?.trim()) process.env.KANBAN_ANALYTICS_DIR = mkdtempSync(join(tmpdir(), 'kanban-test-analytics-'))
