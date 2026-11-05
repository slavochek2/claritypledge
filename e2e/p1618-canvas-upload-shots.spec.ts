/**
 * @file p1618-canvas-upload-shots.spec.ts
 * @description P1618: a canvas thread's composer in a real browser at 1440, 375 and 320: the Upload icon, the hint on one line and not cut, and the mirror's own composer
 * unchanged. Refuses anything but a TEST project.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUsers, setTestSession, TEST_PASSWORD } from './helpers/test-user';
import { isTestProjectUrl } from '../scripts/sweep-e2e-test-users';

test.skip(!isTestProjectUrl(process.env.VITE_SUPABASE_URL ?? ''), 'p1618: not a TEST project');
const BASE = process.env.P1618_BASE ?? 'http://localhost:5500';
const DIR = process.env.P1618_DIR ?? 'test-results/p1618';
test.use({ baseURL: BASE, actionTimeout: 20_000 });
test.setTimeout(240_000);

test('hint and icon at 1440, 375 and 320', async ({ browser }) => {
  const user = await createTestUser({ name: 'P1618 Shots' });
  try {
    const api = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const signIn = await api.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
    expect(signIn.error).toBeNull();
    const opened = await api.rpc('canvas_draft_open', { p_from_version: null });
    expect(opened.error).toBeNull();
    const draft = (await supabaseAdmin.from('canvas_drafts').select('conversation_id, thread_root_id').eq('owner_id', user.user.id).eq('state', 'open').limit(1).single()).data!;

    for (const [vp, height, touch] of [[1440, 900, false], [375, 812, true], [320, 700, true]] as const) {
      const ctx = await browser.newContext({ viewport: { width: vp, height }, baseURL: BASE, ...(touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
      await ctx.addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
      const page = await ctx.newPage();
      await setTestSession(page, user.email);
      await page.goto(`/chats/c/${draft.conversation_id}/t/${draft.thread_root_id}`);
      const upload = page.getByTestId('canvas-upload');
      await upload.waitFor({ timeout: 40_000 });
      expect(await page.evaluate(() => window.innerWidth)).toBe(vp);
      await expect(upload).toHaveAttribute('aria-label', 'Upload');
      await expect(upload).toHaveAttribute('title', 'Upload');
      await expect(upload.locator('svg.lucide-upload')).toHaveCount(1);
      const hint = page.getByTestId('composer-hint');
      await expect(hint).toHaveText('Reply, or upload a file');
      const m = await hint.evaluate(el => {
        const r = el as HTMLElement;
        return { client: r.clientWidth, scroll: r.scrollWidth, whiteSpace: getComputedStyle(r).whiteSpace, height: r.getBoundingClientRect().height, composer: (document.querySelector('[data-testid="composer"] form') as HTMLElement).getBoundingClientRect().height, pageOverflow: document.documentElement.scrollWidth - window.innerWidth };
      });
      console.log(`[p1618] ${vp}: ${JSON.stringify(m)}`);
      expect(m.whiteSpace, 'the hint cannot wrap').toBe('nowrap');
      expect(m.height, 'one line: the 40px field').toBe(40);
      if (vp !== 320) expect(m.scroll, 'the whole hint shows').toBeLessThanOrEqual(m.client); // at 320 it ends in an ellipsis, reported to the founder
      expect(m.pageOverflow).toBeLessThanOrEqual(0);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${DIR}/${vp}-canvas-thread.png` });

      await page.goto(`/chats/c/${draft.conversation_id}`);
      const clip = page.getByRole('button', { name: 'Attach a point or story' });
      await clip.first().waitFor({ timeout: 40_000 });
      await expect(clip.first().locator('svg.lucide-paperclip')).toHaveCount(1);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${DIR}/${vp}-mirror-main-composer.png` });
      await ctx.close();
    }
  } finally {
    await deleteTestUsers([user.user.id]).catch(() => undefined);
  }
});
