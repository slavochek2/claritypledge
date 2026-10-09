// P1445 D: the board's import boundary (replaces P1399 rule 10, "the board bundle imports no product
// code"). The board MAY render CP's approved shared renderers; nothing it reaches — directly, or
// through an approved renderer, or through anything those import — may touch auth, Supabase,
// telemetry or service code. Walks real imports transitively; `import type` is erased, so skipped.

import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'

/** CP files the board may import (repo-relative). Everything they import is walked too. */
export const APPROVED = [
  'src/app/components/shared/presentational/position-buttons.tsx',
  'src/app/components/shared/presentational/point-card-shell.tsx',
  'src/app/components/shared/presentational/story-quote-row.tsx',
  // P1449: the point card's footer + stories toggle, the thread line, and the author avatar
  'src/app/components/shared/presentational/card-footer.tsx',
  'src/app/components/shared/presentational/quoted-point-card.tsx',
  'src/app/components/shared/presentational/quoted-story-shell.tsx',
  'src/app/components/shared/story-video-quotes.tsx',
  'src/app/components/shared/agent-byline.tsx',
  'src/app/components/shared/card-action-classes.ts',
  'src/app/components/shared/ThreadLine.tsx',
  'src/components/ui/gravatar-avatar.tsx',
]

/** A module whose path or specifier matches is product state, not a renderer. */
const FORBIDDEN = /supabase|mixpanel|analytics|sentry|posthog|(^|\/)auth|contexts?\/|\/hooks\/|\/services?\/|\/api\/|\/lib\/(api|db|telemetry)/i

const EXT = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx']
// static import / export-from at a line start OR after a `;` or `}` on the same line; dynamic import()
// with any spacing and any quote (Codex review: `import (…)`, template literals and `x; export … from` slipped through)
const IMPORT = /(?:^|[\n;{}])\s*(import|export)\s+(type\s+)?(?:[^'"`;]*?\s+from\s+)?['"`]([^'"`]+)['"`]|\b(?:import|require)\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)*['"`]([^'"`]+)['"`]|\bimport\.meta\.glob\s*\(\s*['"`]([^'"`]+)['"`]/g

function resolveFile(base: string): string | null {
  for (const e of EXT) {
    const f = base + e
    if (existsSync(f) && statSync(f).isFile()) return f
  }
  return null
}

/**
 * Offenders reachable from every .ts/.tsx under `boardSrc`. `repo` is the CP root ('@/' → repo/src).
 * Returns readable lines: "<importer> → <specifier>: <why>".
 */
export function boundaryOffenders(boardSrc: string, repo: string, approved = APPROVED): string[] {
  return walkBoard(boardSrc, repo, approved).offenders
}

/**
 * P1449: every CP file the board reaches (approved renderers and everything they import), absolute.
 * tailwind.config.js scans exactly these, so a class that lives in a renderer's helper module (the
 * position buttons' `activeClass` map in position-groups.ts) is generated — a hand-kept glob list
 * missed it and the selected button rendered with no background.
 */
export function reachableCpFiles(boardSrc: string, repo: string, approved = APPROVED): string[] {
  return walkBoard(boardSrc, repo, approved).cp
}

function walkBoard(boardSrc: string, repo: string, approved: string[]): { offenders: string[]; cp: string[] } {
  const out: string[] = []
  const cp: string[] = []
  const ok = new Set(approved.map((a) => resolve(repo, a)))
  const boardRoot = resolve(boardSrc, '..')
  const seen = new Set<string>()
  const walk = (file: string, fromBoard: boolean) => {
    if (seen.has(file)) return
    seen.add(file)
    if (!file.startsWith(boardRoot + '/')) cp.push(file)
    const text = readFileSync(file, 'utf-8')
    for (const m of text.matchAll(IMPORT)) {
      if (m[2]) continue // import type / export type: erased at build
      const spec = m[3] ?? m[4] ?? m[5]
      const who = relative(repo, file)
      if (FORBIDDEN.test(spec)) {
        out.push(`${who} → ${spec}: product state`)
        continue
      }
      let target: string | null = null
      if (spec.startsWith('@/')) target = resolveFile(join(repo, 'src', spec.slice(2)))
      else if (spec.startsWith('.')) target = resolveFile(resolve(dirname(file), spec))
      else continue // a package
      if (!target) {
        if (!spec.startsWith('virtual:') && !/\.css$/.test(spec)) out.push(`${who} → ${spec}: unresolved`)
        continue
      }
      if (/\.css$/.test(target)) continue
      if (FORBIDDEN.test(relative(repo, target))) {
        out.push(`${who} → ${spec}: product state`)
        continue
      }
      const inBoard = target.startsWith(boardRoot + '/')
      // the board reaches CP only through an approved renderer
      if (fromBoard && !inBoard && !ok.has(target)) {
        out.push(`${who} → ${spec}: not an approved shared renderer`)
        continue
      }
      walk(target, inBoard)
    }
  }
  const files = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(d, e.name)) : /\.(tsx?)$/.test(e.name) ? [join(d, e.name)] : []))
  for (const f of files(boardSrc)) walk(f, true)
  return { offenders: out, cp: cp.sort() }
}
