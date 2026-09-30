/**
 * @file p1379-public-letter-no-prediction.spec.ts
 * @description P1379 slice A: public (one-to-many) letters skip the author prediction
 * step, and no reader surface shows an author number, gap or "{Author} thinks…".
 * One-to-one letters are unchanged (control test at the end).
 *
 * Every public letter below is an OLD letter seeded WITH a shared prediction
 * (createTestPrediction(..., null)) — the known-bad input. A pass therefore proves the
 * number is withheld, not merely absent.
 *
 * A2 path coverage in this file:
 *   1 anonymous public link                         → 'anon public link'
 *   2 signed-in reader on the public link           → 'signed-in public link'
 *   3 anonymous email invitee (token, no session)   → 'anon token invitee'
 *   4 signed-in email invitee                       → 'signed-in invitee'
 *   5 reader results page                           → 'reader results page'
 *   6 letter-sourced /live baseline                 → NOT here (unit: getLetterBaselineRatings
 *                                                      gate; server: RLS layer L6 of the
 *                                                      integration spec). Stated, not skipped.
 *   7 direct table read under RLS                   → integration spec L6
 * Plus: compose (A1), author overview (A4), preview (A1), one-to-one control.
 */

import { test, expect, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, setTestSession, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import {
  createTestLetter,
  createTestDelivery,
  createTestStorySnapshot,
  createTestPrediction,
  getTestStoryVersionId,
  sealTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';

const STORY_TEXT = 'P1379 story: public letters carry no author prediction.';
const LEGACY_PREDICTION = 9; // distinctive: must never appear on a reader surface

// ─── Fixture helpers ─────────────────────────────────────────────────────────

async function makeDoc(ownerId: string, visibility: 'public' | 'private', storyId: string): Promise<string> {
  const { data: doc, error } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ owner_id: ownerId, title: `P1379 ${visibility} doc`, visibility })
    .select('id')
    .single();
  if (error || !doc) throw new Error(`makeDoc failed: ${error?.message}`);
  const { error: dsErr } = await supabaseAdmin.from('doc_stories').insert({ doc_id: doc.id, story_id: storyId, position: 0 });
  if (dsErr) throw new Error(`doc_stories insert failed: ${dsErr.message}`);
  return doc.id;
}

async function makeSealedLetter(opts: {
  senderId: string;
  docId: string;
  storyId: string;
  mode: 'one-to-one' | 'one-to-many';
  /** A second story keeps the letter open after story 1's reveal. In local (anon) mode,
   *  rating the LAST story with no points completes the letter at once (existing flow),
   *  so a one-story fixture would flash the reveal and jump to the save screen. */
  secondStoryId?: string;
}): Promise<string> {
  const letter = await createTestLetter(opts.senderId, opts.docId, { mode: opts.mode });
  await createTestStorySnapshot(letter.id, opts.storyId, await getTestStoryVersionId(opts.storyId), {
    position: 0,
    pointConfig: { storyText: STORY_TEXT, points: [] },
  });
  if (opts.secondStoryId) {
    await createTestStorySnapshot(letter.id, opts.secondStoryId, await getTestStoryVersionId(opts.secondStoryId), {
      position: 1,
      pointConfig: { storyText: `${STORY_TEXT} (2)`, points: [] },
    });
  }
  return letter.id;
}

async function rateAs(storyId: string, senderId: string, listenerId: string, deliveryId: string, rating: number) {
  const { error } = await supabaseAdmin.from('story_verifications').insert({
    story_id: storyId,
    version_id: await getTestStoryVersionId(storyId),
    speaker_id: senderId,
    listener_id: listenerId,
    listener_rating: rating,
    speaker_rating: 0,
    source: 'letter',
    verified: false,
    delivery_id: deliveryId,
  });
  if (error) throw new Error(`rating insert failed: ${error.message}`);
}

async function openCover(page: Page) {
  const openBtn = page.getByRole('button', { name: /open the letter/i });
  await expect(openBtn).toBeVisible({ timeout: 15000 });
  await openBtn.click();
}

async function rateStory(page: Page, value: number) {
  const rate = page.getByRole('button', { name: `Rate ${value}` });
  await expect(rate).toBeVisible({ timeout: 15000 });
  await rate.click();
  const cont = page.getByRole('button', { name: /^continue$/i });
  await expect(cont).toBeEnabled({ timeout: 5000 });
  await cont.click();
}

async function expectPublicReveal(page: Page, value: number) {
  await expect(page.getByTestId('letter-reveal-reader-only')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(`You said ${value} out of 10.`)).toBeVisible();
  const body = page.locator('body');
  await expect(body).not.toContainText('Calibration data unavailable.');
  await expect(body).not.toContainText(/thinks you understand/);
  await expect(body).not.toContainText(/point gap|Perfectly calibrated/);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

test.describe('P1379: public letters — no author prediction anywhere', () => {
  test.describe.configure({ timeout: 120000 });

  let sender: TestUser;
  let reader: TestUser;
  let reader2: TestUser;
  let storyId: string;
  let story2Id: string;
  let publicDocId: string;
  let privateDocId: string;
  const letters: string[] = [];

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'Paula Sender' });
    reader = await createTestUser({ name: 'Rita Reader' });
    reader2 = await createTestUser({ name: 'Rob Reader' });
    storyId = (await createTestStory(sender.user.id, { content: STORY_TEXT, visibility: 'public' })).id;
    story2Id = (await createTestStory(sender.user.id, { content: `${STORY_TEXT} (2)`, visibility: 'public' })).id;
    publicDocId = await makeDoc(sender.user.id, 'public', storyId);
    privateDocId = await makeDoc(sender.user.id, 'private', storyId);
  });

  test.afterAll(async () => {
    test.setTimeout(180000); // ~10 letters + 3 users; the 30s default is not enough
    await Promise.all(letters.map((id) => deleteTestLetter(id).catch(() => {})));
    await supabaseAdmin.from('story_verifications').delete().eq('story_id', storyId);
    // Owner-scoped: also removes a doc left half-built by a failed beforeAll.
    const { data: ownDocs } = await supabaseAdmin.from('clarity_docs').select('id').eq('owner_id', sender?.user.id ?? '');
    for (const d of (ownDocs ?? []).map((r) => r.id as string)) {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', d);
      await supabaseAdmin.from('clarity_letters').delete().eq('source_doc_id', d);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', d);
    }
    if (story2Id) await deleteTestStory(story2Id);
    if (storyId) await deleteTestStory(storyId);
    for (const u of [sender, reader, reader2].filter(Boolean)) await deleteTestUser(u.user.id).catch(() => {});
  });

  // Rating a story writes story_verifications for (story, listener); each test that
  // rates through the UI uses its own listener or clears rows first.
  test.beforeEach(async () => {
    await supabaseAdmin.from('story_verifications').delete().in('story_id', [storyId, story2Id]);
  });

  test('smoke: public compose skips the prediction walk and seals with no predictions (A1)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

    // Stale key from an earlier compose of this doc — must be cleared on entry.
    const staleKey = `clarity-preview-predictions-${publicDocId}`;
    await page.addInitScript(([k, v]) => {
      if (!sessionStorage.getItem('p1379-seeded')) {
        localStorage.setItem(k, v);
        sessionStorage.setItem('p1379-seeded', '1');
      }
    }, [staleKey, JSON.stringify([[storyId, LEGACY_PREDICTION]])]);
    await setTestSession(page, sender.user.email!);

    await page.goto(`/letter/${publicDocId}/compose`);
    await expect(page.getByText('Should readers explain your stories back to you?')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('[aria-label="Rating scale from 0 to 10"]')).toHaveCount(0);
    await expect(page.getByLabel('Just read the letter')).toBeChecked();
    expect(await page.evaluate((k) => localStorage.getItem(k), staleKey)).toBeNull();

    await page.getByRole('button', { name: /send letter/i }).click();
    await expect(page.locator('h2:has-text("Letter Sealed")')).toBeVisible({ timeout: 20000 });

    const { data: sealed } = await supabaseAdmin
      .from('clarity_letters')
      .select('id, mode, status')
      .eq('source_doc_id', publicDocId)
      .eq('status', 'sealed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    expect(sealed?.mode).toBe('one-to-many');
    letters.push(sealed!.id);
    const { count } = await supabaseAdmin
      .from('letter_predictions')
      .select('id', { count: 'exact', head: true })
      .eq('letter_id', sealed!.id);
    expect(count).toBe(0);
    expect(consoleErrors.filter((e) => !/favicon|DevTools|Download the React/i.test(e))).toEqual([]);
  });

  test('anon public link: own rating only; the public reading response carries no prediction', async ({ page }) => {
    const letterId = await makeSealedLetter({ senderId: sender.user.id, docId: publicDocId, storyId, secondStoryId: story2Id, mode: 'one-to-many' });
    letters.push(letterId);
    await createTestPrediction(letterId, storyId, LEGACY_PREDICTION, null);
    await sealTestLetter(letterId);

    const rpc = page.waitForResponse((r) => r.url().includes('/rpc/get_letter_for_public_reading'));
    await page.goto(`/letter/${letterId}`);
    const body = await (await rpc).json();
    expect(body.predictions).toEqual([]);

    await openCover(page);
    await rateStory(page, 5);
    await expectPublicReveal(page, 5);
  });

  test('signed-in public link: own rating only, and "Just read" (off) shows no explain-back', async ({ page }) => {
    const letterId = await makeSealedLetter({ senderId: sender.user.id, docId: publicDocId, storyId, mode: 'one-to-many' });
    letters.push(letterId);
    await createTestPrediction(letterId, storyId, LEGACY_PREDICTION, null);
    await supabaseAdmin.from('clarity_letters').update({ responses_mode: 'off' }).eq('id', letterId);
    await sealTestLetter(letterId);

    await setTestSession(page, reader.user.email!);
    await page.goto(`/letter/${letterId}`);
    await openCover(page);
    await rateStory(page, 6);
    await expectPublicReveal(page, 6);
    await expect(page.getByRole('button', { name: /explain back what you understood/i })).toHaveCount(0);
  });

  // Opening the cover as an anonymous token reader starts an account-creation step that
  // does not complete in the test environment (pre-existing; outside P1379). What this
  // path can prove here: nothing on it mentions a prediction, before or after Open.
  // The server half (one-to-many reveal refused/NULL) is integration L2/L8.
  test('anon token invitee of a public letter: no prediction wording on the path', async ({ page }) => {
    const letterId = await makeSealedLetter({ senderId: sender.user.id, docId: publicDocId, storyId, mode: 'one-to-many' });
    letters.push(letterId);
    const delivery = await createTestDelivery(letterId, { receiverEmail: 'p1379-invitee@example.com' });
    await createTestPrediction(letterId, storyId, LEGACY_PREDICTION, null);
    await sealTestLetter(letterId);

    await page.goto(`/letter/${delivery.id}?token=${delivery.invitationToken}`);
    const bodyLoc = page.locator('body');
    await expect(page.getByRole('button', { name: /open the letter/i })).toBeVisible({ timeout: 15000 });
    await expect(bodyLoc).not.toContainText(/prediction|estimated you understood/i);
    await page.getByRole('button', { name: /open the letter/i }).click();
    await page.waitForTimeout(3000);
    await expect(bodyLoc).not.toContainText(/prediction|estimated you understood|point gap/i);
    await expect(bodyLoc).not.toContainText(String(LEGACY_PREDICTION) + ' ');
  });

  test('signed-in email invitee of a public letter: own rating only', async ({ page }) => {
    const letterId = await makeSealedLetter({ senderId: sender.user.id, docId: publicDocId, storyId, mode: 'one-to-many' });
    letters.push(letterId);
    const delivery = await createTestDelivery(letterId, {
      receiverEmail: reader.user.email!,
      receiverProfileId: reader.user.id,
    });
    await createTestPrediction(letterId, storyId, LEGACY_PREDICTION, null);
    await sealTestLetter(letterId);

    await setTestSession(page, reader.user.email!);
    await page.goto(`/letter/${delivery.id}`);
    await openCover(page);
    await rateStory(page, 3);
    await expectPublicReveal(page, 3);
  });

  test('reader results page of a public letter: "You said N out of 10.", no belief row', async ({ page }) => {
    const letterId = await makeSealedLetter({ senderId: sender.user.id, docId: publicDocId, storyId, mode: 'one-to-many' });
    letters.push(letterId);
    const delivery = await createTestDelivery(letterId, {
      receiverEmail: reader.user.email!,
      receiverProfileId: reader.user.id,
      status: 'completed',
    });
    await createTestPrediction(letterId, storyId, LEGACY_PREDICTION, null);
    await sealTestLetter(letterId);
    await rateAs(storyId, sender.user.id, reader.user.id, delivery.id, 4);

    await setTestSession(page, reader.user.email!);
    await page.goto(`/letter/${letterId}/results?delivery=${delivery.id}`);
    await expect(page.getByTestId('story-walk-rating-only')).toHaveText('You said 4 out of 10.', { timeout: 20000 });
    const body = page.locator('body');
    await expect(body).not.toContainText(/belief/i);
    await expect(body).not.toContainText(/thinks you understand|believes you understand/);
  });

  test('author overview of a public letter: summary line, "Their rating", no "You → Them" (A4)', async ({ page }) => {
    const letterId = await makeSealedLetter({ senderId: sender.user.id, docId: publicDocId, storyId, mode: 'one-to-many' });
    letters.push(letterId);
    const d1 = await createTestDelivery(letterId, { receiverEmail: reader.user.email!, receiverProfileId: reader.user.id, status: 'completed' });
    const d2 = await createTestDelivery(letterId, { receiverEmail: reader2.user.email!, receiverProfileId: reader2.user.id, status: 'completed' });
    await createTestPrediction(letterId, storyId, LEGACY_PREDICTION, null);
    await sealTestLetter(letterId);
    await rateAs(storyId, sender.user.id, reader.user.id, d1.id, 3);
    await rateAs(storyId, sender.user.id, reader2.user.id, d2.id, 8);

    await setTestSession(page, sender.user.email!);
    await page.goto(`/letter/${letterId}/overview`);
    await expect(page.getByTestId('cohort-rating-summary')).toHaveText('2 readers · median 5.5 · range 3–8', { timeout: 20000 });
    await expect(page.getByText('Their rating')).toBeVisible();
    await expect(page.getByText('You → Them')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(`${LEGACY_PREDICTION} →`);
  });

  test('author preview of a public doc: public reveal even with a stale stored prediction (A1)', async ({ page }) => {
    const key = `clarity-preview-predictions-${publicDocId}`;
    await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [key, JSON.stringify([[storyId, LEGACY_PREDICTION]])]);
    await setTestSession(page, sender.user.email!);
    await page.goto(`/letter/${publicDocId}/preview`);
    await openCover(page);
    await rateStory(page, 5);
    await expectPublicReveal(page, 5);
  });

  test('CONTROL one-to-one: the reader still sees the verdict, the gap and "{Author} thinks…"', async ({ page }) => {
    const letterId = await makeSealedLetter({ senderId: sender.user.id, docId: privateDocId, storyId, mode: 'one-to-one' });
    letters.push(letterId);
    const delivery = await createTestDelivery(letterId, {
      receiverEmail: reader.user.email!,
      receiverProfileId: reader.user.id,
    });
    await createTestPrediction(letterId, storyId, 7, delivery.id);
    await sealTestLetter(letterId);

    await setTestSession(page, reader.user.email!);
    await page.goto(`/letter/${delivery.id}`);
    await openCover(page);
    await rateStory(page, 5);
    await expect(page.getByText('2-point gap')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('body')).toContainText('Paula estimated you understood their intended meaning at a 7.');
    await expect(page.getByRole('img', { name: /You: 5\. Paula: 7\. Gap of 2\./ })).toBeVisible();
    await expect(page.getByTestId('letter-reveal-reader-only')).toHaveCount(0);
  });
});
