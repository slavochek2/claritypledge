import express from 'express'
import cors from 'cors'
import { readdir, readFile, writeFile, rename } from 'fs/promises'
import { join, basename, extname } from 'path'
import matter from 'gray-matter'
import chokidar from 'chokidar'
import { exec } from 'child_process'

const app = express()
app.use(cors())
app.use(express.json())

// Path to features directory (relative to project root)
const FEATURES_DIR = join(process.cwd(), '..', '..', 'features')

// SSE clients for file change notifications
const sseClients: express.Response[] = []

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

interface Feature {
  id: string
  path: string
  title: string
  status: 'backlog' | 'in-progress' | 'done'
  priority: 'urgent-important' | 'important' | 'urgent' | 'neither'
  hypothesis?: string
  tags: string[]
  created?: string
}

async function parseFeatureFile(filePath: string): Promise<Feature | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const { data, content: body } = matter(content)

    // Extract title from first heading or filename
    const titleMatch = body.match(/^#\s+(.+)$/m)
    const filename = basename(filePath, extname(filePath))
    const title = titleMatch?.[1] || filename

    // Determine status from frontmatter or folder
    let status: Feature['status'] = 'backlog'
    if (data.status) {
      status = data.status
    } else if (filePath.includes('/done/')) {
      status = 'done'
    } else if (filePath.includes('/archive/')) {
      status = 'done' // Treat archived as done for kanban purposes
    }

    // Determine priority
    let priority: Feature['priority'] = 'neither'
    if (data.priority) {
      priority = data.priority
    }

    return {
      id: filename,
      path: filePath,
      title,
      status,
      priority,
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

// PATCH /api/features/:id - update feature status/priority
app.patch('/api/features/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { status, priority } = req.body

    // Find the feature file
    const features = await getFeatures()
    const feature = features.find((f) => f.id === id)

    if (!feature) {
      return res.status(404).json({ error: 'Feature not found' })
    }

    // Read current file
    const content = await readFile(feature.path, 'utf-8')
    const { data, content: body } = matter(content)

    // Update frontmatter
    if (status) data.status = status
    if (priority) data.priority = priority

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

const PORT = 5051
app.listen(PORT, () => {
  console.log(`Kanban API running on http://localhost:${PORT}`)
  console.log(`Watching: ${FEATURES_DIR}`)
})
