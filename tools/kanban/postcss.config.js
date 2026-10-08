// P1445 D: Tailwind runs only on stylesheets with @tailwind directives (day/cp-scope.css); the board's
// own CSS passes through untouched.
import { fileURLToPath } from 'url'

export default {
  plugins: {
    tailwindcss: { config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)) },
    autoprefixer: {},
  },
}
