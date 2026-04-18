/**
 * @file p763-free-mode-slider-stuck.spec.ts
 * Canary for P763: free-mode 10/10 slider stuck — handleFreeRoundComplete guard
 * reads stale confirmedLiveStateRef for own slider due to 300ms debounce.
 *
 * Bug: when the user drags their slider to 10 last (partner already at 10),
 * bothAtTen fires immediately but confirmedLiveStateRef.current[ownKey] still
 * holds the pre-drag value (debounce pending) → guard returns early → stuck.
 *
 * Fix: guard only checks partner's confirmed key (no debounce gap for partner).
 *
 * Pre-fix: test times out waiting for freePhase='success' → FAIL
 * Post-fix: guard passes, freePhase transitions to 'success' → PASS
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, setTestSession, deleteTestUser, deleteClaritySession } from './helpers/test-user';
import { mockMicPermission } from './helpers/test-realtime';

const SESSION_CODE_PREFIX = 'P763';

function generateSessionCode(): string {
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${SESSION_CODE_PREFIX}${suffix}`;
}

async function waitForLiveStateKey(
  sessionCode: string,
  key: string,
  value: unknown,
  timeoutMs = 10000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', sessionCode)
      .single();
    if (data?.live_state && (data.live_state as Record<string, unknown>)[key] === value) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for live_state.${key} = ${String(value)} on ${sessionCode}`);
}

test.describe('P763: free-mode 10/10 slider transitions to success', () => {
  let creatorUser: Awaited<ReturnType<typeof createTestUser>>;
  let sessionCode: string;

  test.beforeAll(async () => {
    creatorUser = await createTestUser({ name: 'P763 Creator' });
  });

  test.afterAll(async () => {
    if (creatorUser) await deleteTestUser(creatorUser.user.id);
  });

  test.beforeEach(async ({ page }) => {
    sessionCode = generateSessionCode();
    await mockMicPermission(page);
    await setTestSession(page, creatorUser.email);
  });

  test.afterEach(async () => {
    if (sessionCode) await deleteClaritySession(sessionCode);
  });

  test('dragging own slider to 10 when partner is already at 10 transitions to success', async ({ page }) => {
    // Set up session: partner (joiner) already at 10, own (creator) at 0, freePhase unlocked
    const { error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        creator_profile_id: creatorUser.user.id,
        creator_name: 'P763 Creator',
        joiner_name: 'P763 Joiner',
        code: sessionCode,
        mode: 'free',
        live_state: {
          freePhase: 'unlocked',
          freeSliderCreator: 0,
          freeSliderJoiner: 10,
        },
      });

    expect(error).toBeNull();

    await page.goto(`/live?code=${sessionCode}`);

    // Wait for free mode slider to appear
    const slider = page.locator('input[type="range"]').first();
    await expect(slider).toBeVisible({ timeout: 10000 });

    // Drag own slider to maximum (10) using the slider's max value
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = String(el.max);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // The success state should appear in DB within ~2s
    // Pre-fix: guard reads stale confirmedRef[freeSliderCreator]=0 → returns early → times out → FAIL
    // Post-fix: guard only checks confirmedRef[freeSliderJoiner]=10 → transitions → PASS
    await waitForLiveStateKey(sessionCode, 'freePhase', 'success', 5000);

    // Verify the UI also reflects the success state
    const liveState = (await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', sessionCode)
      .single()).data?.live_state as Record<string, unknown>;

    expect(liveState.freePhase).toBe('success');
  });
});
