// P1449 review: the board's CP stylesheet is read from CP's src/index.css at build time. It must fail
// CLOSED: if CP's index.css changes shape so a piece the CP card relies on is no longer found, the
// build throws and names it — never a board that silently renders without CP's corners or font.
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import { cpScopedCss, scopeTailwindBase } from '../../cp-scoped-css'

const REAL = readFileSync(resolve(__dirname, '../../../../src/index.css'), 'utf-8')

describe('cpScopedCss — the real CP src/index.css', () => {
  const out = cpScopedCss(REAL)
  it('carries the :root tokens on the card scope', () => {
    expect(out).toMatch(/\.cp-scope, \.cp-reset \{[^}]*--radius:\s*0\.5rem/)
  })
  it('carries CP\'s @font-face with its url rewritten to CP\'s own public/fonts', () => {
    expect(out).toMatch(/@font-face[^}]*url\(['"]?\/@fs\/[^)]*\/public\/fonts\/inter-latin\.woff2/)
    expect(out).not.toMatch(/url\(['"]?\/fonts\//)
  })
  it('carries CP\'s .rounded override family, scoped to the card', () => {
    for (const c of ['rounded-sm', 'rounded', 'rounded-md', 'rounded-lg', 'rounded-xl']) expect(out).toContain(`.cp-scope .cp-reset .${c} {`)
  })
  it('carries the body font onto the card', () => {
    expect(out).toMatch(/\.cp-scope \.cp-reset \{font-family:\s*"Inter"/)
  })
  it('emits no page-level CP layout classes and no dark-theme block', () => {
    for (const c of ['mobile-nav-panel', 'event-links-sheet', 'live-scroll', 'dark', 'clarity-loader-c']) expect(out).not.toContain(`.${c}`)
  })
})

describe('cpScopedCss — fails closed when CP\'s index.css changes shape', () => {
  const variants: [string, (css: string) => string, RegExp][] = [
    ['no :root tokens', (c) => c.replace(/:root\s*\{/, '.not-root {'), /:root/],
    ['.rounded family moved into @layer', (c) => c.replace(/(\.rounded-sm \{[\s\S]*?\.rounded-xl \{[^}]*\})/, '@layer utilities {\n$1\n}'), /\.rounded/],
    ['.rounded family removed', (c) => c.replace(/\.rounded-sm \{[\s\S]*?\.rounded-xl \{[^}]*\}/, ''), /\.rounded/],
    ['font-face url made relative', (c) => c.split("url('/fonts/").join("url('./fonts/"), /font-face/],
    ['font-face removed', (c) => c.replace(/@font-face \{[^}]*\}/g, ''), /font-face/],
    ['body font moved into @layer base', (c) => c.replace(/body \{\n {2}font-family:([^;]*);\n {2}font-weight: 400;\n\}/, '@layer base { body { font-family:$1; font-weight: 400; } }'), /body font/],
  ]
  for (const [name, mutate, why] of variants) {
    it(`throws: ${name}`, () => {
      const css = mutate(REAL)
      expect(css, 'the mutation applied').not.toBe(REAL)
      expect(() => cpScopedCss(css)).toThrow(why)
    })
  }
})

describe('scopeTailwindBase — Tailwind base\'s --tw-* defaults reach only the CP card', () => {
  const run = (css: string, from: string) =>
    postcss([tailwindcss({ config: resolve(__dirname, '../../tailwind.config.js') }), scopeTailwindBase()]).process(css, { from })
  it('the real Tailwind base output: every --tw-* defaults rule sits under .cp-scope, none is left global', async () => {
    const out = (await run('@tailwind base;', resolve(__dirname, '../../src/components/day/cp-scope.css'))).root
    const sels: string[] = []
    out.walkRules((r) => {
      sels.push(...r.selectors)
    })
    expect(sels.length).toBeGreaterThan(0)
    expect(sels.filter((x) => !x.startsWith('.cp-scope'))).toEqual([])
    expect(sels).toEqual(expect.arrayContaining(['.cp-scope', '.cp-scope *', '.cp-scope ::before', '.cp-scope ::after', '.cp-scope ::backdrop']))
  })
  it('fails closed: cp-scope.css with no such defaults throws', async () => {
    await expect(run('.x { color: red }', resolve(__dirname, '../../src/components/day/cp-scope.css'))).rejects.toThrow(/no unscoped --tw-\* defaults/)
  })
  it('leaves any other stylesheet alone', async () => {
    const out = (await run('@tailwind base;', '/elsewhere/other.css')).css
    expect(out).toMatch(/^\*, ::before, ::after/m)
  })
})
