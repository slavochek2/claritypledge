// P1445 D: CP's Tailwind, for CP's shared renderers on the Day page only.
//  - presets: CP's own config (theme, colours, plugins) — never a copy
//  - important '.cp-scope': every utility needs a .cp-scope ancestor; the Day page puts that class on
//    <body> while it is mounted (body-level portals — Radix tooltips — need it there too)
//  - content: the shared renderers, plus ReflectionTab.tsx — the one Day file that lays out CP's renderers
//    with CP's utility classes. Its own class names are d-* (checked: none is a Tailwind utility).
//  - no preflight: the board keeps its own base styles; .cp-reset (day/cp-scope.css) is the scoped reset
import cp from '../../tailwind.config.js'

export default {
  presets: [cp],
  important: '.cp-scope',
  corePlugins: { preflight: false },
  content: [
    '../../src/app/components/shared/presentational/**/*.tsx',
    '../../src/app/components/shared/{agent-byline,PositionBadge,machine-chip}.tsx',
    '../../src/components/ui/tooltip.tsx',
    './src/components/day/ReflectionTab.tsx',
  ],
}
