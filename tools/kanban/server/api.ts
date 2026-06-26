import express from 'express'
import cors from 'cors'
import { readdir, readFile, rename, mkdir } from 'fs/promises'
import { writeFileSync, readFileSync, realpathSync } from 'fs'
import { join, basename, extname, sep } from 'path'
import matter from 'gray-matter'
import { execFile, execSync, spawnSync } from 'child_process'
import type { Feature, Status, FeatureType, Size, Article, ArticleStatus, Opportunity, OpportunityStage, OpportunityType } from '../src/lib/types'
import { shouldSkipFolder, isFeatureFile, VALID_STATUS, VALID_TYPE, VALID_SIZE, VALID_DELIVERY_STAGE } from '../lib/scanner-rules'
import { KANBAN_CONFIG } from '../config'

const app = express()
app.use(cors())
app.use(express.json())

// Project root + features dir — overrideable via env for embedding in other
// projects (e.g., pp). Defaults preserve cp behavior. Every git op in this
// file resolves through DEFAULT_PROJECT_ROOT.
const DEFAULT_PROJECT_ROOT = process.env.KANBAN_PROJECT_ROOT ?? join(process.cwd(), '..', '..')
const FEATURES_DIR_NAME = process.env.KANBAN_FEATURES_DIR ?? 'features'
const DEFAULT_FEATURES_DIR = join(DEFAULT_PROJECT_ROOT, FEATURES_DIR_NAME)

// Page/column hide lists (CSV in env). Used by /api/config and to gate hidden
// pages' write endpoints (prevents stale-client PATCHes when a page is hidden).
const HIDDEN_PAGES = new Set(
  (process.env.KANBAN_HIDE_PAGES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
)
const HIDDEN_COLUMNS = new Set(
  (process.env.KANBAN_HIDE_COLUMNS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
)
const WORKTREES_DISABLED = process.env.KANBAN_DISABLE_WORKTREES === 'true'

// Branding — overrideable so embedding projects (pp, sd, etc.) can distinguish
// their tab/favicon at a glance. Defaults preserve cp's identity.
const KANBAN_TITLE = process.env.KANBAN_TITLE ?? 'Clarity Kanban'
const KANBAN_FAVICON_EMOJI = process.env.KANBAN_FAVICON_EMOJI ?? '🛹'

// Get features directory for a given worktree path
function getFeaturesDir(worktreePath?: string): string {
  if (worktreePath) {
    return join(worktreePath, FEATURES_DIR_NAME)
  }
  return DEFAULT_FEATURES_DIR
}

// Get list of git worktrees
function getWorktrees(): { path: string; branch: string; name: string; isCurrent: boolean }[] {
  // When disabled, return a single stub for the project root so /api/open's
  // allowlist still matches (empty array would 403 every card-open click).
  if (WORKTREES_DISABLED) {
    return [{ path: DEFAULT_PROJECT_ROOT, branch: 'main', name: 'main', isCurrent: true }]
  }
  try {
    const output = execSync('git worktree list --porcelain', {
      cwd: DEFAULT_PROJECT_ROOT,
      encoding: 'utf-8',
    })

    const worktrees: { path: string; branch: string; name: string; isCurrent: boolean }[] = []
    const blocks = output.trim().split('\n\n')

    for (const block of blocks) {
      const lines = block.split('\n')
      // Skip prunable worktrees — stale agent worktrees whose .git dir no longer exists
      if (lines.some((l) => l.startsWith('prunable'))) continue
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
        // Extract slot name: .claude/worktrees/w1 → "w1", main repo → "main"
        const slotMatch = path.match(/\/worktrees\/(w\d+)$/)
        const name = slotMatch ? slotMatch[1] : 'main'
        worktrees.push({
          path,
          branch: branch || 'detached',
          name,
          isCurrent: path === DEFAULT_PROJECT_ROOT,
        })
      }
    }

    return worktrees
  } catch {
    // If git command fails, return just the current directory
    return [{ path: DEFAULT_PROJECT_ROOT, branch: 'main', name: 'main', isCurrent: true }]
  }
}

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

    // Legacy field — kept in frontmatter but unused by UI
    const milestone: string | undefined =
      typeof data.milestone === 'string' && data.milestone ? data.milestone : undefined

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
  } catch (err) {
    console.error(`[kanban] parseFeatureFile failed for ${filePath}:`, err)
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
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e?.code !== 'ENOENT') {
        console.error(`[kanban] scanDir failed for ${dir}:`, err)
      }
    }
  }

  await scanDir(featuresDir)
  return features.sort((a, b) => a.id.localeCompare(b.id))
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
  if (HIDDEN_PAGES.has('content')) return res.status(404).json({ error: 'Content page is hidden' })
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
  if (HIDDEN_PAGES.has('content')) return res.status(404).json({ error: 'Content page is hidden' })
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

// ─── Opportunities (P962: CRM Pipeline) ──────────────────────────────────────

const VALID_OPPORTUNITY_STAGE: OpportunityStage[] = ['contacted', 'in-conversation', 'qualified', 'committed', 'active', 'closed']
const VALID_OPPORTUNITY_TYPE: OpportunityType[] = ['founder', 'coach', 'distribution-partner', 'investor']

const DEFAULT_OPPORTUNITIES_DIR = join(DEFAULT_PROJECT_ROOT, '.private', 'crm', 'opportunities')

function getOpportunitiesDir(worktreePath?: string): string {
  if (worktreePath) return join(worktreePath, '.private', 'crm', 'opportunities')
  return DEFAULT_OPPORTUNITIES_DIR
}

// Opportunities cache per worktree
const opportunitiesCacheByWorktree: Map<string, Opportunity[]> = new Map()

async function parseOpportunityFile(filePath: string): Promise<Opportunity | null> {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const { data, content: body } = matter(content)

    const filename = basename(filePath, extname(filePath))

    // name: frontmatter name → first # heading → filename
    let name: string
    if (typeof data.name === 'string' && data.name) {
      name = data.name
    } else {
      const headingMatch = body.match(/^#\s+(.+)$/m)
      name = headingMatch?.[1] ?? filename
    }

    // type: valid OpportunityType or undefined
    const type: OpportunityType | undefined =
      data.type && VALID_OPPORTUNITY_TYPE.includes(data.type) ? data.type : undefined

    // stage: valid OpportunityStage, else default 'contacted'
    const stage: OpportunityStage =
      data.stage && VALID_OPPORTUNITY_STAGE.includes(data.stage) ? data.stage : 'contacted'

    // next_step, contact_ref: string or undefined
    const next_step: string | undefined = typeof data.next_step === 'string' ? data.next_step : undefined
    const contact_ref: string | undefined = typeof data.contact_ref === 'string' ? data.contact_ref : undefined

    // next_date: handle YAML date (Date object) AND quoted string → normalize to YYYY-MM-DD
    let next_date: string | undefined
    if (data.next_date instanceof Date) {
      next_date = data.next_date.toISOString().split('T')[0]
    } else if (typeof data.next_date === 'string' && data.next_date) {
      next_date = data.next_date
    }

    return { id: filename, path: filePath, name, type, stage, next_step, next_date, contact_ref }
  } catch (err) {
    console.error(`[kanban] parseOpportunityFile failed for ${filePath}:`, err)
    return null
  }
}

async function getOpportunities(worktreePath?: string): Promise<Opportunity[]> {
  const opportunitiesDir = getOpportunitiesDir(worktreePath)
  const opportunities: Opportunity[] = []

  try {
    const entries = await readdir(opportunitiesDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const opp = await parseOpportunityFile(join(opportunitiesDir, entry.name))
        if (opp) opportunities.push(opp)
      }
    }
  } catch {
    // Directory doesn't exist yet — return empty
  }

  return opportunities.sort((a, b) => a.id.localeCompare(b.id))
}

async function getCachedOpportunities(worktreePath?: string): Promise<Opportunity[]> {
  const cacheKey = worktreePath || DEFAULT_PROJECT_ROOT
  const cached = opportunitiesCacheByWorktree.get(cacheKey)
  if (cached) return cached
  const opportunities = await getOpportunities(worktreePath)
  opportunitiesCacheByWorktree.set(cacheKey, opportunities)
  return opportunities
}

// GET /api/opportunities — list all CRM opportunities
app.get('/api/opportunities', async (req, res) => {
  try {
    const worktreePath = req.query.worktree as string | undefined
    if (req.query.refresh === 'true') {
      opportunitiesCacheByWorktree.delete(worktreePath || DEFAULT_PROJECT_ROOT)
    }
    const opportunities = await getCachedOpportunities(worktreePath)
    res.json(opportunities)
  } catch (error) {
    console.error('GET /api/opportunities error:', error)
    res.status(500).json({ error: 'Failed to read opportunities' })
  }
})

// PATCH /api/opportunities/:id — update stage
app.patch('/api/opportunities/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { stage } = req.body
    const worktreePath = req.query.worktree as string | undefined

    if (stage !== undefined && !VALID_OPPORTUNITY_STAGE.includes(stage)) {
      return res.status(400).json({ error: 'Invalid stage value' })
    }

    // Fresh disk scan (not cache) so a file created since the last GET is found
    // — mirrors the article PATCH endpoint.
    const opportunities = await getOpportunities(worktreePath)
    const opp = opportunities.find((o) => o.id === id)
    if (!opp) return res.status(404).json({ error: 'Opportunity not found' })

    const content = await readFile(opp.path, 'utf-8')
    const { data, content: body } = matter(content)

    if (stage !== undefined) data.stage = stage

    writeFileSync(opp.path, matter.stringify(body, data))

    // Invalidate cache so the next GET rescans disk and reflects all field
    // changes (not just stage) — mirrors the article PATCH endpoint.
    const cacheKey = worktreePath || DEFAULT_PROJECT_ROOT
    opportunitiesCacheByWorktree.delete(cacheKey)

    res.json({ success: true })
  } catch (error) {
    console.error('PATCH /api/opportunities/:id error:', error)
    res.status(500).json({ error: 'Failed to update opportunity' })
  }
})

// GET /api/opportunities/:id/content - get opportunity body (notes) + frontmatter
app.get('/api/opportunities/:id/content', async (req, res) => {
  try {
    const { id } = req.params
    const worktreePath = req.query.worktree as string | undefined
    const opportunities = await getOpportunities(worktreePath)
    const opp = opportunities.find((o) => o.id === id)

    if (!opp) {
      return res.status(404).json({ error: 'Opportunity not found' })
    }

    const rawContent = await readFile(opp.path, 'utf-8')
    const { data: frontmatter, content } = matter(rawContent)
    res.json({ frontmatter, content })
  } catch (error) {
    console.error('GET /api/opportunities/:id/content error:', error)
    res.status(500).json({ error: 'Failed to read file' })
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

// GET /api/config - runtime config for the client (ports, hidden pages/columns,
// features dir, worktree-disabled flag). Read once on app mount.
app.get('/api/config', (_req, res) => {
  res.json({
    apiPort: KANBAN_CONFIG.ports.api,
    frontendPort: KANBAN_CONFIG.ports.frontend,
    featuresDir: FEATURES_DIR_NAME,
    hidePages: Array.from(HIDDEN_PAGES),
    hideColumns: Array.from(HIDDEN_COLUMNS),
    disableWorktrees: WORKTREES_DISABLED,
    title: KANBAN_TITLE,
    faviconEmoji: KANBAN_FAVICON_EMOJI,
  })
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
      contentCache.clear()
    }

    const features = await getCachedFeatures(worktreePath)
    res.json(features)
  } catch (err) {
    console.error('[kanban] GET /api/features failed:', err)
    res.status(500).json({ error: 'Failed to read features' })
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
      await mkdir(join(featuresDir, 'done'), { recursive: true })
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
  if (HIDDEN_PAGES.has('content')) return res.status(404).json({ error: 'Content page is hidden' })
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

// POST /api/open - open file in VS Code
app.post('/api/open', (req, res) => {
  const { path: filePath } = req.body
  if (!filePath) {
    return res.status(400).json({ error: 'Path required' })
  }

  // Security: only allow opening files in known worktree features directories.
  // realpathSync follows symlinks (resolve() only normalizes the string), so a
  // symlink planted inside an allowed dir can't smuggle the open to its target.
  // Open the resolved path, not the raw input, so the check and the action agree.
  const worktrees = getWorktrees()
  let resolvedPath: string
  try {
    resolvedPath = realpathSync(filePath)
  } catch {
    return res.status(404).json({ error: 'File not found' })
  }
  const isAllowedPath = worktrees.some((wt) => {
    // realpath the worktree base too, so a symlinked worktree dir doesn't cause
    // a legitimate file (whose realpath differs from the string-joined path) to fail.
    let base: string
    try { base = realpathSync(wt.path) } catch { return false }
    const allowedFeatures = join(base, FEATURES_DIR_NAME) + sep
    const allowedArticles = join(base, 'content', 'articles') + sep
    const allowedOpps = join(base, '.private', 'crm', 'opportunities') + sep
    return resolvedPath.startsWith(allowedFeatures) ||
           resolvedPath.startsWith(allowedArticles) ||
           resolvedPath.startsWith(allowedOpps) ||
           resolvedPath === join(base, FEATURES_DIR_NAME)
  })

  if (!isAllowedPath) {
    return res.status(403).json({ error: 'Path not allowed' })
  }

  // VS Code only. The `code` CLI may not be symlinked onto PATH, so fall back
  // to the binary bundled inside the VS Code app. Both invoke VS Code — never
  // another editor. Report what was tried on failure so it's diagnosable.
  const VSCODE_BUNDLED = '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
  const candidates = ['code', VSCODE_BUNDLED]
  const tryEditor = (i: number) => {
    if (i >= candidates.length) {
      console.error(`Failed to open file — VS Code CLI not found (tried: ${candidates.join(', ')})`)
      return res.status(500).json({ error: 'VS Code CLI not found. Install it via VS Code: Cmd+Shift+P → "Shell Command: Install \'code\' command in PATH".' })
    }
    execFile(candidates[i], ['-r', resolvedPath], (error) => {
      if (error) return tryEditor(i + 1)
      res.json({ success: true })
    })
  }
  tryEditor(0)
})

// GET /api/goals - milestone-based goals removed; returns empty
app.get('/api/goals', async (_req, res) => {
  res.json({ steps: [], hypothesis: '', question: '' })
})

// PATCH /api/goals/:index - milestone-based goals removed; noop
app.patch('/api/goals/:index', async (_req, res) => {
  res.status(404).json({ error: 'Milestone-based goals removed — use docs/goals.md via /api/goals-strategic' })
})

// GET /api/goals-strategic - parse docs/goals.md for next steps + dos/don'ts
app.get('/api/goals-strategic', async (_req, res) => {
  if (HIDDEN_PAGES.has('goals')) return res.status(404).json({ error: 'Goals page is hidden' })
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

    // Parse weekly review section
    let weeklyReview: { date: string; metrics: Record<string, string>; commitment: string; insight: string } | null = null
    const weeklyBlock = Object.entries(sections).find(([key]) => key.startsWith('Last Weekly Review'))
    if (weeklyBlock) {
      const [heading, content] = weeklyBlock
      const dateMatch = heading.match(/\((\d{4}-\d{2}-\d{2})\)/)
      const metrics: Record<string, string> = {}
      const tableLines = content.split('\n').filter(l => l.startsWith('|') && !l.includes('---'))
      for (const line of tableLines.slice(1)) { // skip header row
        const cells = line.split('|').map(c => c.trim()).filter(Boolean)
        if (cells.length >= 2) metrics[cells[0]] = cells[1]
      }
      // Extract commitment block (between ``` fences)
      const commitMatch = content.match(/```\n([\s\S]*?)```/)
      // Extract insight line
      const insightMatch = content.match(/\*\*Key insight:\*\*\s*(.+)/)
      weeklyReview = {
        date: dateMatch?.[1] || '',
        metrics,
        commitment: commitMatch?.[1]?.trim() || '',
        insight: insightMatch?.[1]?.trim() || '',
      }
    }

    res.json({ steps, dos, donts, weeklyReview })
  } catch {
    res.json(null)
  }
})

// PATCH /api/goals-strategic/:index - toggle a strategic goal done/undone in docs/goals.md
app.patch('/api/goals-strategic/:index', async (req, res) => {
  if (HIDDEN_PAGES.has('goals')) return res.status(404).json({ error: 'Goals page is hidden' })
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
