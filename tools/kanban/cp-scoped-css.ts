import postcss from 'postcss'
import { fileURLToPath } from 'url'

const CP_PUBLIC = fileURLToPath(new URL('../../public', import.meta.url))

/**
 * P1449: what CP's src/index.css gives CP's renderers beyond Tailwind's utilities, read from CP and
 * scoped to the Day page's CP card — never copied:
 *  - the `:root` tokens, on `.cp-scope, .cp-reset` (P1445 D);
 *  - the `@font-face` rules, pointing at CP's own font files;
 *  - CP's token-bound utility overrides, on `.cp-scope .cp-reset <class>` so they win over the board's
 *    `.cp-scope <class>` utilities as they win over CP's own by source order. The rule picked: a
 *    top-level single-class rule whose every declaration reads a `:root` token (`var(--x)` with --x
 *    defined there). That is what an override binding CP's design tokens to a utility looks like —
 *    today the `.rounded*` family on --radius — while page layout classes (.mobile-nav-panel,
 *    .live-scroll …) use literal values and `.dark` defines tokens rather than reading them;
 *  - the `body` font (family, weight), on `.cp-scope .cp-reset`, where CP's text inherits it.
 *
 * FAILS CLOSED (P1449 review): a build error names any piece that is no longer where this reads it —
 * no tokens, no @font-face, a font url not under /fonts/, no `.rounded` override, no body font —
 * rather than a board that silently renders without CP's corners or font.
 */
export function cpScopedCss(css: string): string {
  const root = postcss.parse(css)
  const out: string[] = []
  const missing = (what: string) => {
    throw new Error(`cp-tokens: ${what} not found in CP src/index.css where the Day board reads it — update tools/kanban/cp-scoped-css.ts`)
  }
  const tokenNames = new Set<string>()
  let tokens = false
  root.each((node) => {
    if (node.type === 'rule' && node.selector.trim() === ':root') {
      tokens = true
      node.walkDecls((d) => {
        if (d.prop.startsWith('--')) tokenNames.add(d.prop)
      })
      out.push(`.cp-scope, .cp-reset {${node.nodes.map(String).join(';')};}`)
    }
  })
  if (!tokens) missing('the :root tokens')

  let fonts = 0
  const overrides: string[] = []
  let bodyFont = false
  root.each((node) => {
    if (node.type === 'atrule' && node.name === 'font-face') {
      const text = String(node)
      const rewritten = text.replace(/url\((['"]?)\/fonts\//g, `url($1/@fs${CP_PUBLIC}/fonts/`)
      if (/url\(/.test(text) && /url\((?!['"]?\/@fs\/)/.test(rewritten)) missing(`a @font-face url under /fonts/ (got: ${/url\([^)]*\)/.exec(text)?.[0]})`)
      fonts++
      out.push(rewritten)
    } else if (node.type === 'rule' && node.selectors.every((x) => /^\.[\w-]+$/.test(x.trim()))) {
      const decls = node.nodes.filter((d) => d.type === 'decl')
      const readsTokens = decls.length > 0 && decls.every((d) => d.type === 'decl' && [...d.value.matchAll(/var\((--[\w-]+)/g)].some((m) => tokenNames.has(m[1])))
      if (readsTokens) {
        overrides.push(...node.selectors.map((x) => x.trim()))
        out.push(String(node.clone({ selectors: node.selectors.map((x) => `.cp-scope .cp-reset ${x.trim()}`) })))
      }
    } else if (node.type === 'rule' && node.selector.trim() === 'body') {
      const font = node.nodes.filter((d) => d.type === 'decl' && /^font-(family|weight)$/.test(d.prop)).map(String)
      if (font.some((f) => f.startsWith('font-family'))) bodyFont = true
      if (font.length) out.push(`.cp-scope .cp-reset {${font.join(';')};}`)
    }
  })
  if (!fonts) missing('a top-level @font-face')
  if (!overrides.includes('.rounded')) missing('the top-level .rounded override family')
  if (!bodyFont) missing('the top-level body font')
  return out.join('\n') + '\n'
}

/**
 * P1449 review: Tailwind's `@tailwind base` (preflight off) emits only the per-element defaults the
 * transform / ring / shadow / filter utilities read — `*, ::before, ::after { --tw-… }` and
 * `::backdrop { --tw-… }` — unscoped, i.e. on every element of the board. This postcss step, run after
 * Tailwind on day/cp-scope.css only, scopes them to `.cp-scope` (the Day page's <body> while it is
 * mounted, so CP's body-level portals keep them) and leaves the rest of the board untouched.
 * Fails closed: if Tailwind stops emitting them in this shape, the build says so.
 */
export function scopeTailwindBase(file = 'cp-scope.css'): postcss.Plugin {
  return {
    postcssPlugin: 'cp-scope-tailwind-base',
    OnceExit(root, { result }) {
      if (!result.opts.from?.endsWith(file)) return
      let scoped = 0
      root.walkRules((rule) => {
        if (rule.parent?.type !== 'root') return
        const decls = rule.nodes.filter((n) => n.type === 'decl')
        if (!decls.length || !decls.every((d) => d.type === 'decl' && d.prop.startsWith('--tw-'))) return
        if (rule.selectors.some((x) => x.trim().startsWith('.cp-scope'))) return
        const wasUniversal = rule.selectors.some((x) => x.trim() === '*')
        rule.selectors = [...(wasUniversal ? ['.cp-scope'] : []), ...rule.selectors.map((x) => `.cp-scope ${x.trim()}`)]
        scoped++
      })
      if (!scoped) throw new Error(`cp-scope-tailwind-base: no unscoped --tw-* defaults found in ${file} — has @tailwind base or Tailwind's output changed?`)
    },
  }
}
