import express from 'express'
import cors from 'cors'
import { readdir, readFile, writeFile, rename } from 'fs/promises'
import { join, basename, extname } from 'path'
import matter from 'gray-matter'
import chokidar from 'chokidar'
import { exec } from 'child_process'
import type { Feature, Status, FeatureType, Priority, Size } from '../src/lib/types'

const app = express()
app.use(cors())
app.use(express.json())

// Path to features directory (relative to project root)
const FEATURES_DIR = join(process.cwd(), '..', '..', 'features')

// SSE clients for file change notifications
const sseClients: express.Response[] = []

// Valid values for enum fields
const VALID_STATUS: Status[] = ['week', 'today', 'in-progress', 'blocked', 'done']
const VALID_TYPE: FeatureType[] = ['bug', 'task', 'story']
const VALID_PRIORITY: Priority[] = ['p0', 'p1', 'p2', 'p3']
const VALID_SIZE: Size[] = ['xs', 's', 'm', 'l', 'xl']

// Watch for file changes
const watcher = chokidar.watch(FEATURES_DIR, {
  ignored: /node_modules/,
  persistent: true,
})

watcher.on('all', () => {
  // Notify all SSE clients
  sseClients.forEach((client) => {
    client.write('data: refresh\n\n')
  })
})

// SSE endpoint for file change notifications
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  sseClients.push(res)
  req.on('close', () => {
    const index = sseClients.indexOf(res)
    if (index !== -1) sseClients.splice(index, 1)
  })
})

async function parseFeatureFile(filePath: string): Promise<Feature | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const { data, content: body } = matter(content)

    // Extract title from first heading or filename
    const titleMatch = body.match(/^#\s+(.+)$/m)
    const filename = basename(filePath, extname(filePath))
    const title = titleMatch?.[1] || filename

    // Determine status from frontmatter (default: 'week' for new items)
    // Frontmatter is source of truth; ignore folder location
    let status: Status = 'week'
    if (data.status && VALID_STATUS.includes(data.status)) {
      status = data.status
    } else if (filePath.includes('/done/')) {
      // Backward compat: files in done/ folder without status frontmatter
      status = 'done'
    } else if (filePath.includes('/archive/')) {
      status = 'done'
    }

    // Parse optional type (first-class badge)
    const type: FeatureType | undefined =
      data.type && VALID_TYPE.includes(data.type) ? data.type : undefined

    // Parse optional priority (first-class badge, AI-managed)
    const priority: Priority | undefined =
      data.priority && VALID_PRIORITY.includes(data.priority) ? data.priority : undefined

    // Parse optional size (display-if-present, AI-managed)
    const size: Size | undefined =
      data.size && VALID_SIZE.includes(data.size) ? data.size : undefined

    // Parse optional blocked_by (AI-managed, display only)
    const blocked_by: string[] | undefined = Array.isArray(data.blocked_by)
      ? data.blocked_by.filter((id: unknown) => typeof id === 'string')
      : undefined

    // Parse optional milestone (AI-managed)
    const milestone: string | undefined =
      typeof data.milestone === 'string' ? data.milestone : undefined

    return {
      id: filename,
      path: filePath,
      title,
      status,
      type,
      priority,
      blocked_by,
      size,
      milestone,
      hypothesis: data.hypothesis,
      tags: Array.isArray(data.tags) ? data.tags : [],
      created: data.created,
    }
  } catch {
    return null
  }
}

async function getFeatures(): Promise<Feature[]> {
  const features: Feature[] = []

  async function scanDir(dir: string) {
    try {
      const entries = await readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(dir, entry.name)

        if (entry.isDirectory()) {
          // Skip drafts folder for now
          if (entry.name !== 'drafts' && entry.name !== 'research') {
            await scanDir(fullPath)
          }
        } else if (entry.name.endsWith('.md') && entry.name.startsWith('p')) {
          const feature = await parseFeatureFile(fullPath)
          if (feature) features.push(feature)
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  await scanDir(FEATURES_DIR)
  return features.sort((a, b) => a.id.localeCompare(b.id))
}

// GET /api/features - list all features
app.get('/api/features', async (_req, res) => {
  try {
    const features = await getFeatures()
    res.json(features)
  } catch {
    res.status(500).json({ error: 'Failed to read features' })
  }
})

// PATCH /api/features/:id - update feature status
// Note: Only status is user-editable via drag-drop. Other fields (priority, size, etc.) are AI-managed.
app.patch('/api/features/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    // Validate status
    if (status && !VALID_STATUS.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' })
    }

    // Find the feature file
    const features = await getFeatures()
    const feature = features.find((f) => f.id === id)

    if (!feature) {
      return res.status(404).json({ error: 'Feature not found' })
    }

    // Read current file
    const content = await readFile(feature.path, 'utf-8')
    const { data, content: body } = matter(content)

    // Update frontmatter (only status is editable via UI)
    if (status) data.status = status

    // Write back
    const newContent = matter.stringify(body, data)
    await writeFile(feature.path, newContent)

    // If status is 'done', move to done/ folder
    if (status === 'done' && !feature.path.includes('/done/')) {
      const newPath = join(FEATURES_DIR, 'done', basename(feature.path))
      await rename(feature.path, newPath)
    }

    // If moving out of done, move back to root
    if (status !== 'done' && feature.path.includes('/done/')) {
      const newPath = join(FEATURES_DIR, basename(feature.path))
      await rename(feature.path, newPath)
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Update error:', error)
    res.status(500).json({ error: 'Failed to update feature' })
  }
})

// GET /api/features/:id/content - get file content for preview
app.get('/api/features/:id/content', async (req, res) => {
  try {
    const { id } = req.params
    const features = await getFeatures()
    const feature = features.find((f) => f.id === id)

    if (!feature) {
      return res.status(404).json({ error: 'Feature not found' })
    }

    const content = await readFile(feature.path, 'utf-8')
    res.json({ content })
  } catch {
    res.status(500).json({ error: 'Failed to read file' })
  }
})

// POST /api/open - open file in Cursor
app.post('/api/open', (req, res) => {
  const { path } = req.body
  if (!path) {
    return res.status(400).json({ error: 'Path required' })
  }

  // Security: only allow opening files in features directory
  if (!path.startsWith(FEATURES_DIR.replace(/\.\.\//g, ''))) {
    // Normalize and check
    const normalizedFeaturesDir = join(process.cwd(), '..', '..')
    if (!path.startsWith(normalizedFeaturesDir)) {
      return res.status(403).json({ error: 'Path not allowed' })
    }
  }

  // Note: Cursor CLI doesn't support --preview flag
  // User can press Cmd+Shift+V in Cursor for markdown preview
  exec(`cursor -r "${path}"`, (error) => {
    if (error) {
      console.error('Failed to open in Cursor:', error)
      return res.status(500).json({ error: 'Failed to open file' })
    }
    res.json({ success: true })
  })
})

const PORT = 9051
app.listen(PORT, () => {
  console.log(`Kanban API running on http://localhost:${PORT}`)
  console.log(`Watching: ${FEATURES_DIR}`)
})
