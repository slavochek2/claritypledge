// P1445 D: Tailwind runs only on stylesheets with @tailwind directives (day/cp-scope.css); the board's
// own CSS passes through untouched.
import { fileURLToPath } from 'url'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { scopeTailwindBase } from './cp-scoped-css.ts'

export default {
  plugins: [
    tailwindcss({ config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)) }),
    // P1449 review: Tailwind base's --tw-* defaults scoped to the CP card, not the whole board
    scopeTailwindBase(),
    autoprefixer(),
  ],
}
