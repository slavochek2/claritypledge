// P1445 D: CP's Tailwind, for CP's shared renderers on the Day page only.
//  - presets: CP's own config (theme, colours, plugins) — never a copy
//  - important '.cp-scope': every utility needs a .cp-scope ancestor; the Day page puts that class on
//    <body> while it is mounted (body-level portals — Radix tooltips — need it there too)
//  - content: every CP file the board reaches (derived; see below), plus ReflectionTab.tsx — the one Day
//    file that lays out CP's renderers with CP's utility classes. Its own class names are d-* (checked: none is a Tailwind utility).
//  - no preflight: the board keeps its own base styles; .cp-reset (day/cp-scope.css) is the scoped reset
import { fileURLToPath } from 'url'
import cp from '../../tailwind.config.js'
import { reachableCpFiles } from './server/boundary.ts'

export default {
  presets: [cp],
  important: '.cp-scope',
  corePlugins: { preflight: false },
  // P1449: derived, not hand-kept — every CP file the board's import graph reaches (the same walk the
  // boundary test runs), plus the Day file that lays them out. A hand list missed position-groups.ts,
  // where the selected button's colours live, so `bg-blue-600` was never generated.
  content: [...reachableCpFiles(fileURLToPath(new URL('./src', import.meta.url)), fileURLToPath(new URL('../..', import.meta.url))), './src/components/day/ReflectionTab.tsx'],
}
