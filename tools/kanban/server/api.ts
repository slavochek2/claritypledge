import express from 'express'
import cors from 'cors'
import { readdir, readFile, rename, mkdir } from 'fs/promises'
import { writeFileSync, readFileSync } from 'fs'
import { join, basename, extname, sep, resolve } from 'path'
import matter from 'gray-matter'
import { exec, execSync, spawnSync } from 'child_process'
import type { Feature, Status, FeatureType, Size, Milestone, MilestoneStatus, Article, ArticleStatus } from '../src/lib/types'
import { shouldSkipFolder, isFeatureFile, VALID_STATUS, VALID_TYPE, VALID_SIZE, VALID_DELIVERY_STAGE } from '../lib/scanner-rules'

const app = express()
app.use(cors())
app.use(express.json())

// Default features directory (relative to project root)
const DEFAULT_PROJECT_ROOT = join(process.cwd(), '..', '..')
const DEFAULT_FEATURES_DIR = join(DEFAULT_PROJECT_ROOT, 'features')
const DEFAULT_MILESTONES_DIR = join(DEFAULT_PROJECT_ROOT, 'docs', 'milestones')

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

// Valid values for enum fields (milestone status is kanban-specific, not in scanner-rules)
const VALID_MILESTONE_STATUS: MilestoneStatus[] = ['active', 'next', 'future']

// Valid article status values (content pipeline — separate from feature board)
const VALID_ARTICLE_STATUS: ArticleStatus[] = ['idea', 'draft', 'editing', 'ready', 'published', 'promoted', 'rejected']

// Articles directory (relative to project root)
const DEFAULT_ARTICLES_DIR = join(DEFAULT_PROJECT_ROOT, 'content', 'articles')

function getArticlesDir(worktreePath?: string): string {
  if (worktreePath) return join(worktreePath, 'content', 'articles')
  return DEFAULT_ARTICLES_DIR
}

// In-memory cache per worktree - invalidated on PATCH
const featuresCacheByWorktree: Map<string, Feature[]> = new Map()

// Articles cache per worktree
const articlesCacheByWorktree: Map<string, Article[]> = new Map()

// Milestone cache per worktree
const milestonesCacheByWorktree: Map<string, Milestone[]> = new Map()

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
      status = 'rejected'
    }

    // Parse optional type (first-class badge)
    const type: FeatureType | undefined =
      data.type && VALID_TYPE.includes(data.type) ? data.type : undefined

    // Parse optional size (display-if-present, AI-managed)
    const size: Size | undefined =
      data.size && VALID_SIZE.includes(data.size) ? data.size : undefined

    // Parse optional blocked_by (AI-managed, display only)
    const blocked_by: string[] | undefined = Array.isArray(data.blocked_by)
      ? data.blocked_by.filter((id: unknown) => typeof id === 'string')
      : undefined

    // Parse optional workstream (AI-managed)
    const workstream: string | undefined =
      typeof data.workstream === 'string' ? data.workstream : undefined

    // Parse optional delivery_stage (AI-managed, software delivery process tracking)
    const delivery_stage = data.delivery_stage && VALID_DELIVERY_STAGE.includes(data.delivery_stage)
      ? data.delivery_stage
      : undefined

    // Parse optional flow (implementation flow chosen by /pick-flow or agent)
    const VALID_FLOW = ['fix', 'dev', 'inline', 'quick-feature'] as const
    const flow: Feature['flow'] = data.flow && VALID_FLOW.includes(data.flow) ? data.flow : undefined

    // Parse required rank (P141: Unified Rank System)
    // Validate: positive finite number, truncate to 3 decimals
    let rank: number = 1000000 // Default for files without rank
    if (typeof data.rank === 'number' && Number.isFinite(data.rank)) {
      if (data.rank >= 0) {
        rank = Math.round(data.rank * 1000) / 1000 // Truncate to 3 decimals
      } else {
        console.warn(`Feature ${filename}: negative rank (${data.rank}), using default`)
      }
    } else if (data.rank !== undefined) {
      console.warn(`Feature ${filename}: invalid rank type (${data.rank}), using default`)
    }

    // Parse optional milestone — explicit field takes precedence, falls back to workstream
    // (workstream values like "C1", "R1" match milestone IDs; "foundation" does not → Unlinked)
    const milestone: string | undefined =
      typeof data.milestone === 'string' && data.milestone ? data.milestone :
      typeof data.workstream === 'string' && data.workstream ? data.workstream : undefined

    return {
      id: filename,
      path: filePath,
      title,
      status,
      type,
      blocked_by,
      size,
      workstream,
      milestone,
      hypothesis: data.hypothesis,
      delivery_stage,
      tags: Array.isArray(data.tags) ? data.tags : [],
      created: data.created,
      completed_at: data.completed_at instanceof Date
        ? data.completed_at.toISOString().split('T')[0]
        : data.completed_at,
      rank,
      prepped: !!data.prepped_date,
      locked_at: typeof data.locked_at === 'string' ? data.locked_at : undefined,
      flow,
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
          // Skip folders using shared scanner-rules logic (P147: prevents drift like P137)
          if (!shouldSkipFolder(entry.name)) {
            await scanDir(fullPath)
          }
        } else if (isFeatureFile(entry.name)) {
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

// Get milestones directory for a given worktree path
function getMilestonesDir(worktreePath?: string): string {
  if (worktreePath) {
    return join(worktreePath, 'docs', 'milestones')
  }
  return DEFAULT_MILESTONES_DIR
}

// Parse milestone file
async function parseMilestoneFile(filePath: string): Promise<Milestone | null> {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const { data, content: body } = matter(content)

    // Extract title from first heading
    const titleMatch = body.match(/^#\s+(.+)$/m)
    const filename = basename(filePath)
    const title = titleMatch?.[1] || filename

    // Extract milestone ID: frontmatter.milestone > title pattern > filename-derived
    let id: string
    if (typeof data.milestone === 'string' && data.milestone) {
      id = data.milestone.toUpperCase()
    } else {
      // Match patterns like "C1:", "R1:", "M1:" at the start of the title
      const milestoneIdMatch = title.match(/^([A-Z]\d*)/)
      id = milestoneIdMatch?.[1] || filename.replace('.md', '').split('-')[0].toUpperCase()
    }

    // Parse status — map aliases to valid MilestoneStatus values
    let status: MilestoneStatus = 'future'
    const rawStatus = data.status
    if (rawStatus === 'active' || rawStatus === 'running') {
      status = 'active'
    } else if (rawStatus === 'next') {
      status = 'next'
    } else if (rawStatus && VALID_MILESTONE_STATUS.includes(rawStatus)) {
      status = rawStatus
    }

    // Parse optional fields
    const summary = typeof data.summary === 'string' ? data.summary : undefined
    const tests = Array.isArray(data.tests) ? data.tests : undefined
    const answers = Array.isArray(data.answers) ? data.answers : undefined

    return {
      id,
      title,
      filename,
      path: filePath,
      status,
      summary,
      tests,
      answers,
    }
  } catch {
    return null
  }
}

// Get all milestones
async function getMilestones(worktreePath?: string): Promise<Milestone[]> {
  const milestonesDir = getMilestonesDir(worktreePath)
  const milestones: Milestone[] = []

  try {
    const entries = await readdir(milestonesDir, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const fullPath = join(milestonesDir, entry.name)
        const milestone = await parseMilestoneFile(fullPath)
        if (milestone) milestones.push(milestone)
      }
    }
  } catch {
    // Directory doesn't exist, return empty
  }

  // Sort by milestone ID alphanumerically (C1, C2, R, R1, ...)
  return milestones.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
}

// Get cached milestones
async function getCachedMilestones(worktreePath?: string): Promise<Milestone[]> {
  const cacheKey = worktreePath || DEFAULT_PROJECT_ROOT
  const cached = milestonesCacheByWorktree.get(cacheKey)
  if (cached) {
    return cached
  }
  const milestones = await getMilestones(worktreePath)
  milestonesCacheByWorktree.set(cacheKey, milestones)
  return milestones
}

// Parse a single article file into an Article object
async function parseArticleFile(filePath: string): Promise<Article | null> {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const { data, content: body } = matter(content)

    const titleMatch = body.match(/^#\s+(.+)$/m)
    const filename = basename(filePath, extname(filePath))
    const title = titleMatch?.[1] || filename

    const status: ArticleStatus = VALID_ARTICLE_STATUS.includes(data.status) ? data.status : 'idea'

    let rank: number = 1000000
    if (typeof data.rank === 'number' && Number.isFinite(data.rank) && data.rank >= 0) {
      rank = Math.round(data.rank * 1000) / 1000
    }

    return {
      id: filename,
      path: filePath,
      title,
      status,
      rank,
      tags: Array.isArray(data.tags) ? data.tags : [],
      published_at: typeof data.published_at === 'string' ? data.published_at : undefined,
    }
  } catch (error) {
    console.warn(`Failed to parse article ${filePath}:`, error)
    return null
  }
}

async function getArticles(worktreePath?: string): Promise<Article[]> {
  const articlesDir = getArticlesDir(worktreePath)
  const articles: Article[] = []

  try {
    const entries = await readdir(articlesDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md') && /\ba\d+/.test(entry.name)) {
        const article = await parseArticleFile(join(articlesDir, entry.name))
        if (article) articles.push(article)
      }
    }
  } catch {
    // Directory doesn't exist yet — return empty
  }

  return articles.sort((a, b) => a.id.localeCompare(b.id))
}

async function getCachedArticles(worktreePath?: string): Promise<Article[]> {
  const cacheKey = worktreePath || DEFAULT_PROJECT_ROOT
  const cached = articlesCacheByWorktree.get(cacheKey)
  if (cached) return cached
  const articles = await getArticles(worktreePath)
  articlesCacheByWorktree.set(cacheKey, articles)
  return articles
}

// GET /api/articles - list all articles from content/articles/
app.get('/api/articles', async (req, res) => {
  try {
    const worktreePath = req.query.worktree as string | undefined
    if (req.query.refresh === 'true') {
      articlesCacheByWorktree.delete(worktreePath || DEFAULT_PROJECT_ROOT)
    }
    const articles = await getCachedArticles(worktreePath)
    res.json(articles)
  } catch (error) {
    console.error('GET /api/articles error:', error)
    res.status(500).json({ error: 'Failed to read articles' })
  }
})

// PATCH /api/articles/:id - update article status and/or rank
app.patch('/api/articles/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { status, rank } = req.body
    const worktreePath = req.query.worktree as string | undefined

    if (status !== undefined && !VALID_ARTICLE_STATUS.includes(status)) {
      return res.status(400).json({ error: 'Invalid article status value' })
    }
    if (rank !== undefined && (typeof rank !== 'number' || !Number.isFinite(rank) || rank < 0)) {
      return res.status(400).json({ error: 'Invalid rank value: must be a positive number' })
    }

    const articles = await getArticles(worktreePath)
    const article = articles.find((a) => a.id === id)
    if (!article) return res.status(404).json({ error: 'Article not found' })

    const content = await readFile(article.path, 'utf-8')
    const { data, content: body } = matter(content)

    if (status !== undefined) data.status = status
    if (rank !== undefined) data.rank = Math.round(rank * 1000) / 1000
    if (status === 'published' && !data.published_at) {
      data.published_at = new Date().toISOString().split('T')[0]
    }

    writeFileSync(article.path, matter.stringify(body, data))

    // Invalidate cache
    articlesCacheByWorktree.delete(worktreePath || DEFAULT_PROJECT_ROOT)

    res.json({ success: true })
  } catch (error) {
    console.error('PATCH /api/articles/:id error:', error)
    res.status(500).json({ error: 'Failed to update article' })
  }
})

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
// Query param: ?refresh=true - clear cache before fetching
app.get('/api/features', async (req, res) => {
  try {
    const worktreePath = req.query.worktree as string | undefined
    const refresh = req.query.refresh === 'true'

    // Clear cache if refresh requested
    if (refresh) {
      const cacheKey = worktreePath || DEFAULT_PROJECT_ROOT
      featuresCacheByWorktree.delete(cacheKey)
    }

    const features = await getCachedFeatures(worktreePath)
    res.json(features)
  } catch {
    res.status(500).json({ error: 'Failed to read features' })
  }
})

// GET /api/milestones - list all milestones
// Query param: ?worktree=/path/to/worktree
app.get('/api/milestones', async (req, res) => {
  try {
    const worktreePath = req.query.worktree as string | undefined
    const milestones = await getCachedMilestones(worktreePath)
    res.json(milestones)
  } catch {
    res.status(500).json({ error: 'Failed to read milestones' })
  }
})

// PATCH /api/features/:id - update feature fields
// Supports: status, rank, type, size, tags, blocked_by, workstream, hypothesis, delivery_stage
// Query param: ?worktree=/path/to/worktree
app.patch('/api/features/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { status, rank, type, size, tags, blocked_by, workstream, hypothesis, delivery_stage } =
      req.body
    const worktreePath = req.query.worktree as string | undefined

    // Validate enum fields
    if (status && !VALID_STATUS.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' })
    }
    if (type !== undefined && type !== null && !VALID_TYPE.includes(type)) {
      return res.status(400).json({ error: 'Invalid type value' })
    }
    if (size !== undefined && size !== null && !VALID_SIZE.includes(size)) {
      return res.status(400).json({ error: 'Invalid size value' })
    }
    if (delivery_stage !== undefined && delivery_stage !== null && !VALID_DELIVERY_STAGE.includes(delivery_stage)) {
      return res.status(400).json({ error: 'Invalid delivery_stage value' })
    }

    // Validate rank (P141: must be positive finite number if provided)
    if (rank !== undefined && rank !== null) {
      if (typeof rank !== 'number' || !Number.isFinite(rank) || rank < 0) {
        return res.status(400).json({ error: 'Invalid rank value: must be a positive number' })
      }
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
    if (rank !== undefined) {
      // Truncate to 3 decimals
      data.rank = Math.round(rank * 1000) / 1000
    }

    // Handle nullable enum fields (null = remove from frontmatter)
    if (type !== undefined) {
      if (type === null) delete data.type
      else data.type = type
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
    if (workstream !== undefined) {
      if (workstream === '' || workstream === null) delete data.workstream
      else data.workstream = workstream
    }
    if (hypothesis !== undefined) {
      if (hypothesis === '' || hypothesis === null) delete data.hypothesis
      else data.hypothesis = hypothesis
    }
    if (delivery_stage !== undefined) {
      if (delivery_stage === '' || delivery_stage === null) delete data.delivery_stage
      else data.delivery_stage = delivery_stage
    }

    // Handle completed_at based on status transition
    if (status === 'done' && oldStatus !== 'done') {
      // Moving TO done: set completed_at to today
      data.completed_at = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    } else if (status && status !== 'done' && oldStatus === 'done') {
      // Moving OUT of done: clear completed_at
      delete data.completed_at
    }

    // Lock status against automated overrides: record that a human set this manually
    if (status !== undefined) {
      data.locked_at = new Date().toISOString()
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
        if (rank !== undefined) cachedFeature.rank = data.rank
        if (type !== undefined) cachedFeature.type = type === null ? undefined : type
        if (size !== undefined) cachedFeature.size = size === null ? undefined : size
        if (tags !== undefined) cachedFeature.tags = tags || []
        if (blocked_by !== undefined) cachedFeature.blocked_by = blocked_by || undefined
        if (workstream !== undefined)
          cachedFeature.workstream = workstream === '' || workstream === null ? undefined : workstream
        if (hypothesis !== undefined)
          cachedFeature.hypothesis =
            hypothesis === '' || hypothesis === null ? undefined : hypothesis
        if (delivery_stage !== undefined)
          cachedFeature.delivery_stage =
            delivery_stage === '' || delivery_stage === null ? undefined : delivery_stage
        if (status === 'done' && oldStatus !== 'done') {
          cachedFeature.completed_at = data.completed_at
        } else if (status && status !== 'done' && oldStatus === 'done') {
          cachedFeature.completed_at = undefined
        }
        if (status !== undefined) {
          cachedFeature.locked_at = data.locked_at
        }
        // Keep prepped in sync with frontmatter
        cachedFeature.prepped = !!data.prepped_date
      }
    }

    // Move files to correct folder based on status.
    // Also stage the move in git (spawnSync, no shell) so HEAD stays in sync.
    // Without git staging, HEAD retains both old and new paths; any git
    // checkout/pull restores the old copy, making the card appear to revert.
    const moveAndStage = async (oldPath: string, newPath: string) => {
      await rename(oldPath, newPath)
      // Best-effort: if git staging fails the file move still succeeded
      spawnSync('git', ['add', '--', newPath], { cwd: DEFAULT_PROJECT_ROOT, stdio: 'ignore' })
      spawnSync('git', ['rm', '--cached', '--', oldPath], { cwd: DEFAULT_PROJECT_ROOT, stdio: 'ignore' })
    }

    const featuresDir = getFeaturesDir(worktreePath)
    const isInDone = feature.path.includes('/done/')
    const isInArchive = feature.path.includes('/archive/')
    const isInSubfolder = isInDone || isInArchive

    if (status === 'done' && !isInDone) {
      const newPath = join(featuresDir, 'done', basename(feature.path))
      await moveAndStage(feature.path, newPath)
      if (cachedFeatures) {
        const cachedFeature = cachedFeatures.find((f) => f.id === id)
        if (cachedFeature) cachedFeature.path = newPath
      }
    } else if (status === 'rejected' && !isInArchive) {
      await mkdir(join(featuresDir, 'archive'), { recursive: true })
      const newPath = join(featuresDir, 'archive', basename(feature.path))
      await moveAndStage(feature.path, newPath)
      if (cachedFeatures) {
        const cachedFeature = cachedFeatures.find((f) => f.id === id)
        if (cachedFeature) cachedFeature.path = newPath
      }
    } else if (status && status !== 'done' && status !== 'rejected' && isInSubfolder) {
      // Moving out of done/ or archive/ back to active
      const newPath = join(featuresDir, basename(feature.path))
      await moveAndStage(feature.path, newPath)
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

// GET /api/articles/:id/content - get article body for preview
app.get('/api/articles/:id/content', async (req, res) => {
  try {
    const { id } = req.params
    const worktreePath = req.query.worktree as string | undefined
    const articles = await getArticles(worktreePath)
    const article = articles.find((a) => a.id === id)

    if (!article) {
      return res.status(404).json({ error: 'Article not found' })
    }

    const cached = contentCache.get(article.path)
    if (cached) return res.json(cached)

    const rawContent = await readFile(article.path, 'utf-8')
    const { data: frontmatter, content } = matter(rawContent)
    const result = { frontmatter, content }
    contentCache.set(article.path, result)
    res.json(result)
  } catch (error) {
    console.error('GET /api/articles/:id/content error:', error)
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
  const resolvedPath = resolve(filePath)
  const isAllowedPath = worktrees.some((wt) => {
    const allowedFeatures = join(wt.path, 'features') + sep
    const allowedArticles = join(wt.path, 'content', 'articles') + sep
    return resolvedPath.startsWith(allowedFeatures) ||
           resolvedPath.startsWith(allowedArticles) ||
           resolvedPath === join(wt.path, 'features')
  })

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

// GET /api/goals - parse pilot sequence from active milestone
app.get('/api/goals', async (_req, res) => {
  try {
    const milestones = await getCachedMilestones()
    const active = milestones.find((m) => m.status === 'active')
    if (!active) return res.json({ steps: [], hypothesis: '', question: '' })

    const raw = readFileSync(active.path, 'utf-8')
    const { content } = matter(raw)

    const hypothesisMatch = content.match(/\*\*Hypothesis:\*\*\s*(.+)/m)
    const hypothesis = hypothesisMatch?.[1]?.trim() || ''

    const questionMatch = content.match(/\*\*The question:\*\*\s*(.+)/m)
    const question = questionMatch?.[1]?.trim() || ''

    const seqMatch = content.match(/## Pilot Sequence([\s\S]*?)(?=\n##|$)/)
    const seqBlock = seqMatch?.[1] || ''
    const stepMatches = [...seqBlock.matchAll(/^\d+\. \[([ x])\] (.+)$/gm)]
    const steps = stepMatches.map((m, i) => ({ index: i, text: m[2].trim(), done: m[1] === 'x' }))

    res.json({ steps, hypothesis, question, milestoneId: active.id, milestoneTitle: active.title })
  } catch {
    res.status(500).json({ error: 'Failed to read goals' })
  }
})

// PATCH /api/goals/:index - toggle a pilot sequence step done/undone
app.patch('/api/goals/:index', async (req, res) => {
  try {
    const stepIndex = parseInt(req.params.index, 10)
    const { done } = req.body as { done: boolean }

    const milestones = await getCachedMilestones()
    const active = milestones.find((m) => m.status === 'active')
    if (!active) return res.status(404).json({ error: 'No active milestone' })

    let raw = readFileSync(active.path, 'utf-8')
    let i = 0
    raw = raw.replace(/^(\d+\. )\[([ x])\] (.+)$/gm, (full, num, _check, text) => {
      if (i++ === stepIndex) return `${num}[${done ? 'x' : ' '}] ${text}`
      return full
    })

    writeFileSync(active.path, raw, 'utf-8')
    milestonesCacheByWorktree.clear()
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Failed to update goal' })
  }
})

// GET /api/goals-strategic - parse docs/goals.md for next steps + dos/don'ts
app.get('/api/goals-strategic', async (_req, res) => {
  try {
    const goalsPath = join(DEFAULT_PROJECT_ROOT, 'docs', 'goals.md')
    const raw = readFileSync(goalsPath, 'utf-8')

    // Parse sections by ## headings
    const sections: Record<string, string> = {}
    let currentSection = ''
    for (const line of raw.split('\n')) {
      const heading = line.match(/^## (.+)/)
      if (heading) {
        currentSection = heading[1].trim()
        sections[currentSection] = ''
      } else if (currentSection) {
        sections[currentSection] += line + '\n'
      }
    }

    // Parse next steps (numbered checkboxes)
    const steps: Array<{ index: number; text: string; done: boolean }> = []
    const stepsBlock = sections['Next Steps'] || ''
    for (const line of stepsBlock.split('\n')) {
      const m = line.match(/^\d+\. \[([ x])\] (.+)/)
      if (m) steps.push({ index: steps.length, text: m[2].trim(), done: m[1] === 'x' })
    }

    // Parse dos and don'ts (bullet lists)
    const dos: string[] = []
    for (const line of (sections['Dos'] || '').split('\n')) {
      const m = line.match(/^- (.+)/)
      if (m) dos.push(m[1].trim())
    }
    const donts: string[] = []
    for (const line of (sections["Don'ts"] || '').split('\n')) {
      const m = line.match(/^- (.+)/)
      if (m) donts.push(m[1].trim())
    }

    res.json({ steps, dos, donts })
  } catch {
    res.json(null)
  }
})

// PATCH /api/goals-strategic/:index - toggle a strategic goal done/undone in docs/goals.md
app.patch('/api/goals-strategic/:index', async (req, res) => {
  try {
    const stepIndex = parseInt(req.params.index, 10)
    const { done } = req.body as { done: boolean }
    const goalsPath = join(DEFAULT_PROJECT_ROOT, 'docs', 'goals.md')
    let raw = readFileSync(goalsPath, 'utf-8')
    let i = 0
    raw = raw.replace(/^(\d+\. )\[([ x])\] (.+)$/gm, (full, num, _check, text) => {
      if (i++ === stepIndex) return `${num}[${done ? 'x' : ' '}] ${text}`
      return full
    })
    writeFileSync(goalsPath, raw, 'utf-8')
    res.json({ success: true })
  } catch {
    res.status(500).json({ error: 'Failed to update strategic goal' })
  }
})

// GET /api/weekly - read weekly commitment from ~/.claude_weekly_last_run
app.get('/api/weekly', (_req, res) => {
  try {
    const homedir = process.env.HOME || ''
    const raw = readFileSync(join(homedir, '.claude_weekly_last_run'), 'utf-8')
    const result: Record<string, string> = {}
    for (const line of raw.split('\n')) {
      const m = line.match(/^(\w+):\s*(.+)/)
      if (m) result[m[1]] = m[2].trim()
    }
    if (!result.date) return res.json(null)
    res.json(result)
  } catch {
    res.json(null)
  }
})

import { KANBAN_CONFIG } from '../config'

export { app }

if (process.env.NODE_ENV !== 'test') {
  const PORT = KANBAN_CONFIG.ports.api
  app.listen(PORT, () => {
    console.log(`Kanban API running on http://localhost:${PORT}`)
    const worktrees = getWorktrees()
    console.log(`Available worktrees:`)
    worktrees.forEach((wt) => {
      console.log(`  ${wt.isCurrent ? '* ' : '  '}${wt.branch} → ${wt.path}`)
    })
  })
}
