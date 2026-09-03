/**
 * @file live-join.ts
 * @description P1232: one correct way to get past the /live join step.
 *
 * P396 removed the guest email input and the consent checkbox from the join-via-link form
 * (features/done/5_feb_26/p396_eliminate-unverified-user-state.md). What remains is a name
 * field plus a "Join as Guest" button (guest-or-account-join.tsx:91,108). Verified by grep:
 * the placeholder `your@email.com` appears 0 times in src/.
 *
 * Why this helper exists rather than a find-and-replace: `page.fill()` AUTO-WAITS. A fill
 * against the removed input does not fail fast — it blocks until the whole test times out,
 * producing a bare timeout with no assertion error. That is why 58 failures in the
 * 2026-08-31 overnight run looked like an unexplained environmental category rather than
 * one dead selector (docs/technical/e2e-triage-2026-09-01.md).
 *
 * "Join Session" is a SEPARATE trap, and it is not simply a rename. The label still exists,
 * at clarity-live-page.tsx:4002 — but only inside the error branch: while auto-join is in
 * flight the page renders a "Joining session..." spinner, and the button appears only if the
 * join failed. So an unconditional click on it hangs on every run where auto-join WORKS,
 * which is the normal path. Callers must not click it directly; this helper clicks it only
 * when it is actually on screen, where it means "retry a failed join".
 *
 * The three states a page can be in after landing on /live/<code>, all handled below:
 *   'guest-form'   — not signed in: name field + "Join as Guest".
 *   'retry-button' — auto-join failed and offered the fallback "Join Session".
 *   'auto-joined'  — signed in and already through; nothing to do.
 */
import type { Page } from '@playwright/test';

export type JoinOutcome = 'guest-form' | 'retry-button' | 'auto-joined';

/**
 * Resolves the /live join step whatever state it is in, and reports which state that was so
 * a caller can assert on it. Never throws when the form is simply absent — being already
 * joined is a legitimate outcome, and the common one for an authenticated test user.
 *
 * Call it AFTER `page.goto('/live/<code>')` and BEFORE asserting on the live view. It does
 * not handle the "Updated Terms" dialog; callers that need it keep their own handling, which
 * is a different surface with a different lifetime.
 *
 * @param name    name to type when the guest form is showing and its field is empty
 * @param timeout how long to wait for the join UI to settle before concluding 'auto-joined'
 */
export async function completeLiveJoinIfPrompted(
  page: Page,
  { name = 'Test User', timeout = 5000 }: { name?: string; timeout?: number } = {},
): Promise<JoinOutcome> {
  const nameField = page.getByPlaceholder('Enter your name');
  const guestButton = page.getByRole('button', { name: 'Join as Guest' });
  const retryButton = page.getByRole('button', { name: 'Join Session' });

  // Race the two terminal shapes. Whichever appears first decides the branch; if neither
  // does within `timeout`, the page auto-joined and there is nothing to interact with.
  const appeared = await Promise.race([
    guestButton.waitFor({ state: 'visible', timeout }).then(() => 'guest-form' as const),
    retryButton.waitFor({ state: 'visible', timeout }).then(() => 'retry-button' as const),
  ]).catch(() => 'auto-joined' as const);

  if (appeared === 'guest-form') {
    // Some callers fill the name themselves before calling this. Don't clobber that.
    if (await nameField.isVisible().catch(() => false)) {
      const current = await nameField.inputValue().catch(() => '');
      if (!current) await nameField.fill(name);
    }
    await guestButton.click();
    return 'guest-form';
  }

  if (appeared === 'retry-button') {
    await retryButton.click();
    return 'retry-button';
  }

  return 'auto-joined';
}
