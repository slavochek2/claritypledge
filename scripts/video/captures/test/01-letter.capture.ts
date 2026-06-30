/**
 * Capture 01 — Week 1: file a Clarity Letter (real product, real clicking).
 *
 * Drives the REAL composition flow end-to-end and records video:
 *   doc → "Prepare a Letter" → choose recipient → prediction walk (rate each story)
 *   → review → Seal & Send → "Letter Sealed".
 *
 * Reuses the e2e auth + seed helpers and the proven selectors from
 * e2e/p581-letter-composition.spec.ts. This is NOT an assertion test — it exists to
 * produce footage; a few expects remain only as guard rails so a broken capture fails
 * loudly instead of recording a blank screen.
 *
 * Run via: npx playwright test --config=playwright.capture.config.ts 01-letter
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../../../e2e/helpers/supabase-admin';
import { createTestUser, setTestSession, deleteTestUser, type TestUser } from '../../../e2e/helpers/test-user';
import { createTestStory, deleteTestStory } from '../../../e2e/helpers/test-story';

// deliberate on-screen pause so a viewer can read the state before the next action
const beat = (page: import('@playwright/test').Page, ms = 1400) => page.waitForTimeout(ms);

test.describe('Capture: Week 1 — file a Clarity Letter', () => {
  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  const storyIds: string[] = [];

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'Maya' });
    receiver = await createTestUser({ name: 'Daniel' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'Our co-founder baseline', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const stories = [
      { title: 'How we split equity', content: 'I think our equity split should reflect who carries the most risk over the next two years, not just who started first.' },
      { title: 'What "full-time" means', content: 'When we say full-time, I mean nights and weekends included until launch. I want to make sure we actually agree on that.' },
    ];
    for (let i = 0; i < stories.length; i++) {
      const story = await createTestStory(sender.user.id, stories[i]);
      storyIds.push(story.id);
      await supabaseAdmin.from('doc_stories').insert({ doc_id: docId, story_id: story.id, position: i });
    }
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('clarity_letters').delete().eq('source_doc_id', docId);
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    for (const id of storyIds) await deleteTestStory(id);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
  });

  test('compose and seal a letter', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto(`/d/${docId}`);
    await page.waitForLoadState('networkidle');
    await beat(page);

    // Start composing — current UI goes straight into the prediction walk
    const prepareBtn = page.getByRole('button', { name: /prepare.*letter/i }).first();
    await expect(prepareBtn).toBeVisible({ timeout: 10000 });
    await prepareBtn.click();

    // Prediction walk — rate how well I think my co-founder will understand each story.
    // Current UI: "Rate N" buttons; the Seal action appears once rating is complete.
    // Adaptive: rate each presented story, advancing via Continue when present, until
    // the Seal button shows.
    // Multi-chapter prediction walk ("Chapter N of M"): rate each chapter, then advance
    // via Continue; on the final chapter the action becomes "Seal & Get Link".
    // Continue is a custom button — a plain Playwright click can fail to register
    // (React synthetic events), so we verify advancement and fall back to a DOM click.
    const chapterLabel = () => page.locator('text=/Chapter \\d+ of \\d+/i').first().textContent().catch(() => '');
    let sealed = false;
    for (let chapter = 0; chapter < 5 && !sealed; chapter++) {
      const rate = page.getByRole('button', { name: /^(Rate )?8$/ }).first();
      await expect(rate).toBeVisible({ timeout: 10000 });
      await beat(page);
      await rate.click({ timeout: 8000 });
      await beat(page);

      const sealBtn = page.getByRole('button', { name: /seal/i }).first();
      if (await sealBtn.isVisible().catch(() => false) && await sealBtn.isEnabled().catch(() => false)) {
        await beat(page);
        await sealBtn.click({ timeout: 8000 });
        sealed = true;
        break;
      }

      const before = await chapterLabel();
      const cont = page.getByRole('button', { name: 'Continue' }).first();
      await expect(cont).toBeEnabled({ timeout: 8000 });
      await cont.click({ timeout: 8000 });
      // verify the chapter actually advanced; if not, force a DOM click
      const advanced = await page.locator(`text=${before}`).waitFor({ state: 'detached', timeout: 4000 })
        .then(() => true).catch(() => false);
      if (!advanced) await cont.evaluate((el: HTMLElement) => el.click());
      await beat(page);
    }
    expect(sealed).toBe(true);

    // "Ready to send?" — choose response mode (Invite is the default) and send.
    await beat(page, 1800);
    const sendBtn = page.getByRole('button', { name: /send letter/i }).first();
    if (await sendBtn.isVisible().catch(() => false)) {
      await beat(page);
      await sendBtn.click({ timeout: 8000 });
      await beat(page, 2500);
    }
    await page.screenshot({ path: 'test-results/capture-01-final.png', fullPage: true });
  });
});
