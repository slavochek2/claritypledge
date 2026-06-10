/**
 * @file p852-verify.spec.ts
 * @description P852: Letter full-flow UX redesign (Phase B) — /verify functional pass.
 *
 * Verifies the redesigned letter reading flow against the spec's Done-When + Locked Decisions:
 * - Chapter progress bar ("Chapter X of N") persists                          (UAT-2)
 * - Anti-point engage: LetterPointCard + PositionButtons size=lg + lock CTA   (UAT-3)
 * - Priming gate: community count badges hidden on engage (ZERO_COUNTS)       (UAT-4)
 * - Ordinal reveal: side-by-side full-word stances, "Where you each stand"    (UAT-5)
 * - Numeric reveal: "Before you answered…estimated" opener, 0–10 You/author markers (UAT-6, P915)
 * - Anti-point-lead chapter flows end-to-end                                  (UAT-8)
 * - Story-first chapter (1 visible point) starts at story-rate                (UAT-9)
 * - Advance CTAs name what's next                                             (UAT-10)
 * - Story-rate question prominence + "Continue" CTA                           (UAT-11)
 * - Completion: "A Moment of Intellectual Integrity"                          (UAT-12)
 *
 * Author positions are injected into point_config (createFullTestLetter hardcodes
 * authorPosition:null, which would force the ordinal reveal into its fallback branch).
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import {
  createTestLetter,
  createTestStorySnapshot,
  createTestDelivery,
  createTestPrediction,
  sealTestLetter,
  deleteTestLetter,
  type TestDelivery,
} from './helpers/test-letter';

// ---------------------------------------------------------------------------
// Local letter builder — like createFullTestLetter, but with real author
// positions injected into point_config (the redesigned ordinal reveal needs them).
// ---------------------------------------------------------------------------

interface ChapterSpec {
  storyTitle: string;
  storyText: string;
  prediction: number; // author's predicted understanding (0–10)
  points: Array<{ statement: string; authorPosition: string }>;
}

interface BuiltLetter {
  letterId: string;
  delivery: TestDelivery;
  docId: string;
  storyIds: string[];
  pointIds: string[];
}

async function buildLetter(
  senderId: string,
  receiver: { email: string; profileId: string },
  chapters: ChapterSpec[],
): Promise<BuiltLetter> {
  const { data: doc } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ owner_id: senderId, title: 'P852 Verify Doc', visibility: 'public' })
    .select('id')
    .single();
  if (!doc) throw new Error('doc creation failed');
  const docId = doc.id as string;

  const letter = await createTestLetter(senderId, docId, { mode: 'one-to-one' });
  const delivery = await createTestDelivery(letter.id, {
    receiverEmail: receiver.email,
    receiverProfileId: receiver.profileId,
  });

  const storyIds: string[] = [];
  const pointIds: string[] = [];

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const story = await createTestStory(senderId, { title: ch.storyTitle, content: ch.storyText });
    storyIds.push(story.id);

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', story.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error(`story_versions row missing for story ${story.id}`);
    const versionId = version.id as string;

    await supabaseAdmin.from('doc_stories').insert({ doc_id: docId, story_id: story.id, position: i });

    const configPoints: Array<{ id: string; text: string; authorPosition: string }> = [];
    for (const p of ch.points) {
      const pt = await createTestPoint(senderId, story.id, { statement: p.statement });
      pointIds.push(pt.id);
      configPoints.push({ id: pt.id, text: p.statement, authorPosition: p.authorPosition });
    }

    await createTestStorySnapshot(letter.id, story.id, versionId, {
      position: i,
      pointConfig: { storyTitle: ch.storyTitle, storyText: ch.storyText, points: configPoints },
    });

    await createTestPrediction(letter.id, story.id, ch.prediction, delivery.id);
  }

  await sealTestLetter(letter.id);

  return { letterId: letter.id, delivery, docId, storyIds, pointIds };
}

async function cleanupLetter(b: BuiltLetter): Promise<void> {
  await deleteTestLetter(b.letterId);
  await supabaseAdmin.from('doc_stories').delete().eq('doc_id', b.docId);
  for (const id of b.pointIds) await deleteTestPoint(id);
  for (const id of b.storyIds) await deleteTestStory(id);
  await supabaseAdmin.from('clarity_docs').delete().eq('id', b.docId);
}

const readUrl = (d: TestDelivery) => `/letter/${d.id}?token=${d.invitationToken}`;

async function openCover(page: import('@playwright/test').Page) {
  const openBtn = page.getByRole('button', { name: /open the letter/i });
  await expect(openBtn).toBeVisible({ timeout: 15000 });
  await openBtn.click();
}

// ===========================================================================
// Anti-point-lead letter: 1 chapter, 2 visible points → starts at point-engage
// ===========================================================================

test.describe('P852: Anti-point-lead chapter (redesigned reveal)', () => {
  test.describe.configure({ timeout: 90000 });

  let sender: TestUser;
  let receiver: TestUser;
  let built: BuiltLetter;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P852 Sender' });
    receiver = await createTestUser({ name: 'P852 Receiver' });
    built = await buildLetter(
      sender.user.id,
      { email: receiver.email, profileId: receiver.user.id },
      [
        {
          storyTitle: 'Remote work',
          storyText: 'P852 anti-point-lead story. Two visible points so the chapter leads with an anti-point.',
          prediction: 8,
          points: [
            { statement: 'Remote work improves deep focus.', authorPosition: 'disagree' },
            { statement: 'Async beats synchronous for clarity.', authorPosition: 'agree' },
          ],
        },
      ],
    );
  });

  test.afterAll(async () => {
    if (built) await cleanupLetter(built);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('UAT-2/3/4: smoke + engage presentation + priming gate', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

    await setTestSession(page, receiver.email);
    await page.goto(readUrl(built.delivery));
    await openCover(page);

    // Anti-point lead → first phase is point-engage. Statement + framing visible.
    await expect(page.getByText('Remote work improves deep focus.')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/to what extent do you agree/i)).toBeVisible();

    // UAT-2: chapter progress label.
    // P852 Phase-2: single-chapter letters drop "of 1" (reads like a bug otherwise).
    await expect(page.getByText(/^Chapter 1$/)).toBeVisible();
    await expect(page.getByText(/chapter 1 of 1/i)).toHaveCount(0);

    // UAT-3: position buttons (size lg) present
    await expect(page.getByTestId('agree-group')).toBeVisible();
    await expect(page.getByTestId('disagree-group')).toBeVisible();
    await expect(page.getByTestId('unsure-group')).toBeVisible();

    // UAT-3: lock CTA present + disabled until a position is chosen
    const lockCta = page.getByRole('button', { name: /lock in your position/i });
    await expect(lockCta).toBeVisible();
    await expect(lockCta).toBeDisabled();

    // UAT-4: priming gate — no community count badges on engage (ZERO_COUNTS)
    await expect(page.getByTestId('agree-count-badge')).toHaveCount(0);
    await expect(page.getByTestId('disagree-count-badge')).toHaveCount(0);
    await expect(page.getByTestId('unsure-count-badge')).toHaveCount(0);

    // Smoke: no console errors during load + engage
    const appErrors = consoleErrors.filter((e) => !/favicon|net::ERR|Failed to load resource/i.test(e));
    expect(appErrors, `console errors: ${appErrors.join(' | ')}`).toHaveLength(0);
  });

  test('UAT-5/10: ordinal reveal — side-by-side stances + named advance CTA', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(readUrl(built.delivery));
    await openCover(page);

    await expect(page.getByText('Remote work improves deep focus.')).toBeVisible({ timeout: 15000 });

    // Select "Agree" (single click selects default intensity, no dropdown) then lock in.
    await page.getByTestId('agree-group').click();
    const lockCta = page.getByRole('button', { name: /lock in your position/i });
    await expect(lockCta).toBeEnabled();
    await lockCta.click();

    // UAT-5: ordinal reveal — header + both full-word stance badges, no numeric scale.
    await expect(page.getByText(/where you each stand/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Agrees', { exact: true })).toBeVisible();    // reader: Agree
    await expect(page.getByText('Disagrees', { exact: true })).toBeVisible(); // author: disagree

    // UAT-10: advance CTA names the story that follows (400ms delayed button).
    await expect(page.getByRole('button', { name: /read .*'s story/i })).toBeVisible({ timeout: 5000 });
  });

  test('UAT-6/8/10/11/12: full chapter — story reveal, remaining point, completion', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(readUrl(built.delivery));
    await openCover(page);

    // 1) Anti-point engage → reveal
    await expect(page.getByText('Remote work improves deep focus.')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('disagree-group').click();
    await page.getByRole('button', { name: /lock in your position/i }).click();

    // 2) Advance to story-rate
    const readStory = page.getByRole('button', { name: /read .*'s story/i });
    await expect(readStory).toBeVisible({ timeout: 5000 });
    await readStory.click();

    // UAT-11: story-rate — prominent question + Continue CTA
    await expect(page.getByText(/how well do you believe you understand/i)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /^Rate 5$/ }).click();
    const continueCta = page.getByRole('button', { name: /^Continue$/ });
    await expect(continueCta).toBeEnabled();
    await continueCta.click();

    // UAT-6: numeric story reveal — P915 pre-commitment opener + You marker
    await expect(page.getByText(/before you answered/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/You 5/)).toBeVisible();

    // UAT-10: after story reveal, a 2nd point remains → "Next point"
    const nextPoint = page.getByRole('button', { name: /^Next point$/ });
    await expect(nextPoint).toBeVisible({ timeout: 5000 });
    await nextPoint.click();

    // 3) Remaining point engage → reveal
    await expect(page.getByText('Async beats synchronous for clarity.')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('agree-group').click();
    await page.getByRole('button', { name: /lock in your position/i }).click();
    await expect(page.getByText(/where you each stand/i)).toBeVisible({ timeout: 15000 });

    // UAT-10: last point of final chapter → "Complete Letter"
    const complete = page.getByRole('button', { name: /^Complete Letter$/ });
    await expect(complete).toBeVisible({ timeout: 5000 });
    await complete.click();

    // UAT-12: completion screen
    await expect(page.getByText(/a moment of intellectual integrity/i)).toBeVisible({ timeout: 15000 });
  });

  // P852 Phase-3: the in-bar Leave back-chevron was removed (founder decision
  // after Phase-2 review — browser back is the universal reading-flow exit,
  // matches Kindle/Pocket/Substack). The original UAT-13 ("Leave affordance
  // navigates away mid-flow") no longer applies; there is no in-flow Leave button.
});

// ===========================================================================
// Story-first letter: 1 chapter, 1 visible point → starts at story-rate
// ===========================================================================

test.describe('P852: Story-first chapter (D36 path)', () => {
  test.describe.configure({ timeout: 90000 });

  let sender: TestUser;
  let receiver: TestUser;
  let built: BuiltLetter;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P852 SF Sender' });
    receiver = await createTestUser({ name: 'P852 SF Receiver' });
    built = await buildLetter(
      sender.user.id,
      { email: receiver.email, profileId: receiver.user.id },
      [
        {
          storyTitle: 'Single point',
          storyText: 'P852 story-first story. One visible point so the chapter opens with the story.',
          prediction: 6,
          points: [{ statement: 'Clarity compounds over time.', authorPosition: 'agree' }],
        },
      ],
    );
  });

  test.afterAll(async () => {
    if (built) await cleanupLetter(built);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('UAT-9: 1 visible point → first phase is story-rate (not point-engage)', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto(readUrl(built.delivery));
    await openCover(page);

    // Story-first: the rating question is the entry phase; the point card is NOT first.
    await expect(page.getByText(/how well do you believe you understand/i)).toBeVisible({ timeout: 15000 });
    // The single point's statement must NOT be on screen yet (it comes after the story reveal).
    await expect(page.getByText('Clarity compounds over time.')).toHaveCount(0);
    // No "Lock in your position" CTA on the entry screen.
    await expect(page.getByRole('button', { name: /lock in your position/i })).toHaveCount(0);
  });
});
