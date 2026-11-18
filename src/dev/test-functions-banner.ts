/**
 * P1705 (section C): the page side of the dev-only functions check. Imported only behind
 * `import.meta.env.DEV` (src/main.tsx), so a production build contains none of it; the fixed marker
 * string below is what a grep of dist looks for.
 *
 * Plain DOM, one fixed element, never blocks the page. Blue and grey only (design system).
 */
import { displayState, FUNCTIONS_CHECK_EVENT, FUNCTIONS_CHECK_REQUEST, type Display, type FunctionsCheckState } from './functions-check-state'

export const BANNER_MARKER = 'p1705-test-functions-banner'

const clock = (t: number) => new Date(t).toTimeString().slice(0, 5)

/** The text lines for a display state (pure, so it is unit-tested without a DOM). */
export function bannerLines(d: Display): { tone: 'mark' | 'banner' | 'muted'; lines: string[] } {
  const s = d.state
  switch (d.kind) {
    case 'match':
      return { tone: 'mark', lines: [`TEST functions match, checked ${clock(s.checkedAt)}`] }
    case 'differs':
      return {
        tone: 'banner',
        // Fix commands before the provenance: on a phone the banner scrolls, so what to do comes first.
        lines: [
          `TEST serves other code for: ${s.functions.join(', ') || s.line}`,
          ...s.fix,
          s.branch ? `Server holds: ${s.branch}` : '',
        ].filter(Boolean),
      }
    case 'stale':
      return { tone: 'muted', lines: [`TEST functions check is ${d.ageMinutes} min old (last result: ${s.kind})`] }
    default:
      return { tone: 'muted', lines: ['TEST functions check could not run', s.reason] .filter(Boolean) }
  }
}

const STYLE: Record<'mark' | 'banner' | 'muted', string> = {
  mark: 'background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe',
  banner: 'background:#1e40af;color:#ffffff;border:1px solid #1e3a8a',
  muted: 'background:#f3f4f6;color:#4b5563;border:1px solid #d1d5db',
}

function render(el: HTMLElement, state: FunctionsCheckState, now: number, onDismiss: () => void): void {
  const d = displayState(state, now)
  const { tone, lines } = bannerLines(d)
  el.setAttribute('data-state', d.kind)
  // Capped at a third of the screen (scrolls inside) so a long differs list never hides the page;
  // the right padding keeps text clear of the 32px dismiss target.
  // The match mark has no dismiss button and sits over the mobile bottom nav, so clicks pass through
  // it; the others take clicks (dismiss, and selecting a fix command to copy).
  const pointer = tone === 'mark' ? 'none' : 'auto'
  el.style.cssText = `position:fixed;left:8px;bottom:8px;z-index:2147483000;max-width:min(520px,calc(100vw - 16px));max-height:33vh;overflow-y:auto;padding:6px 36px 6px 10px;border-radius:6px;font:12px/1.4 ui-monospace,monospace;white-space:pre-wrap;pointer-events:${pointer};${STYLE[tone]}`
  el.textContent = lines.join('\n')
  if (tone !== 'mark') {
    const close = document.createElement('button')
    close.type = 'button'
    close.textContent = 'x'
    close.setAttribute('aria-label', 'Dismiss')
    close.style.cssText = 'position:absolute;top:0;right:0;width:32px;height:32px;background:none;border:0;color:inherit;cursor:pointer;font:14px/1 ui-monospace,monospace'
    close.onclick = onDismiss
    el.appendChild(close)
  }
}

/**
 * One element kept up to date. A dismissal hides it until the next check result arrives; the
 * per-minute repaint (which only refreshes the age) never brings a dismissed banner back.
 */
export function createFunctionsBanner(doc: Document): {
  el: HTMLElement
  update: (state: FunctionsCheckState, now: number) => void
  repaint: (now: number) => void
} {
  let last: FunctionsCheckState | null = null
  let dismissed = false
  const el = doc.createElement('div')
  el.id = BANNER_MARKER
  el.setAttribute('data-testid', BANNER_MARKER)
  const dismiss = () => { dismissed = true; el.style.display = 'none' }
  const repaint = (now: number) => {
    if (!last || dismissed) return
    if (!el.isConnected) doc.body.appendChild(el)
    render(el, last, now, dismiss)
  }
  const update = (state: FunctionsCheckState, now: number) => { last = state; dismissed = false; repaint(now) }
  return { el, update, repaint }
}

/** Listen on Vite's dev channel and keep one element up to date; also refreshes its age each minute. */
export function mountFunctionsBanner(): void {
  if (typeof document === 'undefined' || !import.meta.hot) return
  // An automated browser (Playwright, the DevTools MCP) never sees it: a test reusing a person's dev
  // server would otherwise find it over the page under test. The banner is for people.
  if (typeof navigator !== 'undefined' && navigator.webdriver) return
  const banner = createFunctionsBanner(document)
  import.meta.hot.on(FUNCTIONS_CHECK_EVENT, (data: FunctionsCheckState) => banner.update(data, Date.now()))
  // A result sent before this module loaded was missed: ask for the latest one now that we listen.
  import.meta.hot.send(FUNCTIONS_CHECK_REQUEST)
  setInterval(() => banner.repaint(Date.now()), 60_000)
}
