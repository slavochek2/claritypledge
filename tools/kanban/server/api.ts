import express from 'express'
import cors from 'cors'
import { readdir, readFile, rename } from 'fs/promises'
import { writeFileSync, readFileSync } from 'fs'
import { join, basename, extname } from 'path'
import matter from 'gray-matter'
import { exec, execSync } from 'child_process'
import type { Feature, Status, FeatureType, Priority, Size } from '../src/lib/types'

const app = express()
app.use(cors())
app.use(express.json())

// Default features directory (relative to project root)
const DEFAULT_PROJECT_ROOT = join(process.cwd(), '..', '..')
const DEFAULT_FEATURES_DIR = join(DEFAULT_PROJECT_ROOT, 'features')

// Get features directory for a given worktree path
function getFeaturesDir(worktreePath?: string): string {
  if (worktreePath) {
    return join(worktreePath, 'features')
  }
  return DEFAULT_FEATURES_DIR
}

// Get list of git worktrees
function getWorktrees(): { path: string; branch: string; isCurrent: boolean }[] {
  try {
    const output = execSync('git worktree list --porcelain', {
      cwd: DEFAULT_PROJECT_ROOT,
      encoding: 'utf-8',
    })

    const worktrees: { path: string; branch: string; isCurrent: boolean }[] = []
    const blocks = output.trim().split('\n\n')

    for (const block of blocks) {
      const lines = block.split('\n')
      let path = ''
      let branch = ''

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          path = line.replace('worktree ', '')
        } else if (line.startsWith('branch ')) {
          branch = line.replace('branch refs/heads/', '')
        }
      }

      if (path) {
        worktrees.push({
          path,
          branch: branch || 'detached',
          isCurrent: path === DEFAULT_PROJECT_ROOT,
        })
      }
    }

    return worktrees
  } catch {
    // If git command fails, return just the current directory
    return [{ path: DEFAULT_PROJECT_ROOT, branch: 'main', isCurrent: true }]
  }
}

// Valid values for enum fields
const VALID_STATUS: Status[] = ['backlog', 'week', 'today', 'in-progress', 'blocked', 'done']
const VALID_TYPE: FeatureType[] = ['bug', 'task', 'story']
const VALID_PRIORITY: Priority[] = ['p0', 'p1', 'p2', 'p3']
const VALID_SIZE: Size[] = ['xs', 's', 'm', 'l', 'xl']

// In-memory cache per worktree - invalidated on PATCH
const featuresCacheByWorktree: Map<string, Feature[]> = new Map()

// Content cache - keyed by file path, invalidated on PATCH
const contentCache: Map<string, { frontmatter: unknown; content: string }> = new Map()

async function getCachedFeatures(worktreePath?: string): Promise<Feature[]> {
  const cacheKey = worktreePath || DEFAULT_PROJECT_ROOT
  const cached = featuresCacheByWorktree.get(cacheKey)
  if (cached) {
    return cached
  }
  const features = await getFeatures(worktreePath)
  featuresCacheByWorktree.set(cacheKey, features)
  return features
}

async function parseFeatureFile(filePath: string): Promise<Feature | null> {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const { data, content: body } = matter(content)

    // Extract title from first heading or filename
    const titleMatch = body.match(/^#\s+(.+)$/m)
    const filename = basename(filePath, extname(filePath))
    const title = titleMatch?.[1] || filename

    // Determine status from frontmatter (default: 'backlog' for new items without status)
    // Frontmatter is source of truth; ignore folder location
    let status: Status = 'backlog'
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
      completed_at: data.completed_at,
      sort_order: data.sort_order,
    }
  } catch {
    return null
  }
}

async function getFeatures(worktreePath?: string): Promise<Feature[]> {
  const featuresDir = getFeaturesDir(worktreePath)
  const features: Feature[] = []

  async function scanDir(dir: string) {
    try {
      const entries = await readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(dir, entry.name)

        if (entry.isDirectory()) {
          // Skip folders that shouldn't be scanned
          const skipFolders = ['research']
          // Also skip dated archive folders (e.g., "4_27_jan26")
          const isDateArchive = /^\d+_\d+_\w+\d+$/.test(entry.name)
          if (!skipFolders.includes(entry.name) && !isDateArchive) {
            await scanDir(fullPath)
          }
        } else if (entry.name.endsWith('.md') && /\bp\d+/.test(entry.name)) {
          const feature = await parseFeatureFile(fullPath)
          if (feature) features.push(feature)
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  await scanDir(featuresDir)
  return features.sort((a, b) => a.id.localeCompare(b.id))
}

// GET /api/worktrees - list all git worktrees
app.get('/api/worktrees', (_req, res) => {
  try {
    const worktrees = getWorktrees()
    res.json(worktrees)
  } catch {
    res.status(500).json({ error: 'Failed to list worktrees' })
  }
})

// GET /api/features - list all features
// Query param: ?worktree=/path/to/worktree
app.get('/api/features', async (req, res) => {
  try {
    const worktreePath = req.query.worktree as string | undefined
    const features = await getCachedFeatures(worktreePath)
    res.json(features)
  } catch {
    res.status(500).json({ error: 'Failed to read features' })
  }
})

// PATCH /api/features/:id - update feature fields
// Supports: status, sort_order, type, priority, size, tags, blocked_by, milestone, hypothesis
// Query param: ?worktree=/path/to/worktree
app.patch('/api/features/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { status, sort_order, type, priority, size, tags, blocked_by, milestone, hypothesis } =
      req.body
    const worktreePath = req.query.worktree as string | undefined

    // Validate enum fields
    if (status && !VALID_STATUS.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' })
    }
    if (type !== undefined && type !== null && !VALID_TYPE.includes(type)) {
      return res.status(400).json({ error: 'Invalid type value' })
    }
    if (priority !== undefined && priority !== null && !VALID_PRIORITY.includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority value' })
    }
    if (size !== undefined && size !== null && !VALID_SIZE.includes(size)) {
      return res.status(400).json({ error: 'Invalid size value' })
    }

    // Find the feature file
    const features = await getFeatures(worktreePath)
    const feature = features.find((f) => f.id === id)

    if (!feature) {
      return res.status(404).json({ error: 'Feature not found' })
    }

    // Read current file
    const content = await readFile(feature.path, 'utf-8')
    const { data, content: body } = matter(content)

    const oldStatus = data.status

    // Update frontmatter - only update fields that are explicitly provided
    if (status !== undefined) data.status = status
    if (sort_order !== undefined) data.sort_order = sort_order

    // Handle nullable enum fields (null = remove from frontmatter)
    if (type !== undefined) {
      if (type === null) delete data.type
      else data.type = type
    }
    if (priority !== undefined) {
      if (priority === null) delete data.priority
      else data.priority = priority
    }
    if (size !== undefined) {
      if (size === null) delete data.size
      else data.size = size
    }

    // Handle array fields
    if (tags !== undefined) {
      if (Array.isArray(tags) && tags.length === 0) delete data.tags
      else data.tags = tags
    }
    if (blocked_by !== undefined) {
      if (Array.isArray(blocked_by) && blocked_by.length === 0) delete data.blocked_by
      else data.blocked_by = blocked_by
    }

    // Handle text fields (empty string = remove)
    if (milestone !== undefined) {
      if (milestone === '' || milestone === null) delete data.milestone
      else data.milestone = milestone
    }
    if (hypothesis !== undefined) {
      if (hypothesis === '' || hypothesis === null) delete data.hypothesis
      else data.hypothesis = hypothesis
    }

    // Handle completed_at based on status transition
    if (status === 'done' && oldStatus !== 'done') {
      // Moving TO done: set completed_at to today
      data.completed_at = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    } else if (status && status !== 'done' && oldStatus === 'done') {
      // Moving OUT of done: clear completed_at
      delete data.completed_at
    }

    // Write to file
    const newContent = matter.stringify(body, data)
    writeFileSync(feature.path, newContent)

    // Invalidate content cache for this file
    contentCache.delete(feature.path)

    // Update cache directly (faster than invalidating)
    const cacheKey = worktreePath || DEFAULT_PROJECT_ROOT
    const cachedFeatures = featuresCacheByWorktree.get(cacheKey)
    if (cachedFeatures) {
      const cachedFeature = cachedFeatures.find((f) => f.id === id)
      if (cachedFeature) {
        if (status !== undefined) cachedFeature.status = status
        if (sort_order !== undefined) cachedFeature.sort_order = sort_order
        if (type !== undefined) cachedFeature.type = type === null ? undefined : type
        if (priority !== undefined) cachedFeature.priority = priority === null ? undefined : priority
        if (size !== undefined) cachedFeature.size = size === null ? undefined : size
        if (tags !== undefined) cachedFeature.tags = tags || []
        if (blocked_by !== undefined) cachedFeature.blocked_by = blocked_by || undefined
        if (milestone !== undefined)
          cachedFeature.milestone = milestone === '' || milestone === null ? undefined : milestone
        if (hypothesis !== undefined)
          cachedFeature.hypothesis =
            hypothesis === '' || hypothesis === null ? undefined : hypothesis
        if (status === 'done' && oldStatus !== 'done') {
          cachedFeature.completed_at = data.completed_at
        } else if (status && status !== 'done' && oldStatus === 'done') {
          cachedFeature.completed_at = undefined
        }
      }
    }

    // Move to/from done folder based on status
    const featuresDir = getFeaturesDir(worktreePath)
    if (status === 'done' && !feature.path.includes('/done/')) {
      const newPath = join(featuresDir, 'done', basename(feature.path))
      await rename(feature.path, newPath)
      // Update path in cache
      if (cachedFeatures) {
        const cachedFeature = cachedFeatures.find((f) => f.id === id)
        if (cachedFeature) cachedFeature.path = newPath
      }
    } else if (status && status !== 'done' && feature.path.includes('/done/')) {
      const newPath = join(featuresDir, basename(feature.path))
      await rename(feature.path, newPath)
      // Update path in cache
      if (cachedFeatures) {
        const cachedFeature = cachedFeatures.find((f) => f.id === id)
        if (cachedFeature) cachedFeature.path = newPath
      }
    }

    // Return updated feature data
    res.json({
      success: true,
      feature: cachedFeatures?.find((f) => f.id === id) || feature,
    })
  } catch (error) {
    console.error('Update error:', error)
    res.status(500).json({ error: 'Failed to update feature' })
  }
})

// GET /api/features/:id/content - get file content for preview
// Query param: ?worktree=/path/to/worktree
// Returns: { frontmatter: {...}, content: "..." } - content is markdown body without frontmatter
app.get('/api/features/:id/content', async (req, res) => {
  try {
    const { id } = req.params
    const worktreePath = req.query.worktree as string | undefined
    const features = await getCachedFeatures(worktreePath)
    const feature = features.find((f) => f.id === id)

    if (!feature) {
      return res.status(404).json({ error: 'Feature not found' })
    }

    // Check content cache first
    const cached = contentCache.get(feature.path)
    if (cached) {
      return res.json(cached)
    }

    // Parse and cache
    const rawContent = await readFile(feature.path, 'utf-8')
    const { data: frontmatter, content } = matter(rawContent)
    const result = { frontmatter, content }
    contentCache.set(feature.path, result)
    res.json(result)
  } catch {
    res.status(500).json({ error: 'Failed to read file' })
  }
})

// POST /api/open - open file in Cursor
app.post('/api/open', (req, res) => {
  const { path: filePath } = req.body
  if (!filePath) {
    return res.status(400).json({ error: 'Path required' })
  }

  // Security: only allow opening files in known worktree features directories
  const worktrees = getWorktrees()
  const isAllowedPath = worktrees.some((wt) => filePath.startsWith(join(wt.path, 'features')))

  if (!isAllowedPath) {
    return res.status(403).json({ error: 'Path not allowed' })
  }

  // Note: Cursor CLI doesn't support --preview flag
  // User can press Cmd+Shift+V in Cursor for markdown preview
  exec(`cursor -r "${filePath}"`, (error) => {
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
  const worktrees = getWorktrees()
  console.log(`Available worktrees:`)
  worktrees.forEach((wt) => {
    console.log(`  ${wt.isCurrent ? '* ' : '  '}${wt.branch} → ${wt.path}`)
  })
})
