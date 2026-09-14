/**
 * @file immersive-letter-route.ts
 * @description The one definition of an IMMERSIVE letter route — where the app hides its
 * chrome, including the cross-page session bar, because the bar would collide with the letter's
 * fixed progress bar (P852/P888/P932).
 *
 * Two readers must agree on it, which is why it lives here rather than inline in either:
 *   - clarity-landing-layout.tsx, which hides the chrome;
 *   - room-capture-context.tsx, which PAUSES room capture on these screens (P1307 D13), so
 *     capture never runs on a route where its indicator is hidden.
 *
 * Reading (/letter/:id, UUID or shortcode per P772) and compose (/letter/:docId/compose) only.
 * Results + overview keep the nav (P699/P700); a bare startsWith("/letter/") swept them in —
 * that was P888. A completed letter (?done=1) leaves immersive mode for a person who has the
 * app menu (P932).
 */
const IMMERSIVE_LETTER_PATH = /^\/letter\/[^/]+(\/compose)?$/;

export function isImmersiveLetterRoute(pathname: string, search: string, hasAppMenu: boolean): boolean {
  const letterDone = new URLSearchParams(search).get('done') === '1' && hasAppMenu;
  return IMMERSIVE_LETTER_PATH.test(pathname) && !letterDone;
}
