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
  const out: string[] = []
  const ok = new Set(approved.map((a) => resolve(repo, a)))
  const boardRoot = resolve(boardSrc, '..')
  const seen = new Set<string>()
  const walk = (file: string, fromBoard: boolean) => {
    if (seen.has(file)) return
    seen.add(file)
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
  return out
}
