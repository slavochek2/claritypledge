/**
 * @file p1231-intensity-tutorial-gate.spec.ts
 * @description P1231: guards both directions of the E2E first-run tutorial seed.
 *
 * playwright.config.ts seeds `letter_intensity_preview_seen_at_v2` into every context's
 * localStorage, so the hard-mandatory IntensityTutorialModal does not open on top of the
 * letter flow during tests (see e2e/helpers/storage-state.ts for the measurement that
 * motivated it — ~155 failures across ~19 spec files).
 *
 * A suppression is only trustworthy if its counterpart is also tested. Epistemic gate 7c:
 * a new gate must be run against the workflows that already exist, and a fixture containing
 * only inputs the gate should reject leaves the false-positive rate unmeasured. So this file
 * asserts BOTH halves against the same navigation:
 *
 *   1. seeded (the suite default) — the modal must NOT appear, and the engage-phase
 *      controls beneath it must be reachable.
 *   2. cleared (`clearTutorialSeen`) — the modal MUST appear, proving the product's
 *      first-run gate still works and that test 1 passes for the right reason.
 *
 * Without test 2, a future change that deleted the modal entirely would leave test 1
 * green and the regression invisible.
 */
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, setTestSession, deleteTestUser } from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createFullTestLetter, deleteTestLetter, type TestDelivery } from './helpers/test-letter';
import { clearTutorialSeen } from './helpers/storage-state';

/** The modal's DialogTitle — intensity-tutorial-modal.tsx:122-124. */
const TUTORIAL_TITLE = /Double-click to pick/i;

interface Fixture {
  delivery: TestDelivery;
  cleanup: () => Promise<void>;
}

async function buildLetterFixture(label: string): Promise<Fixture> {
  const sender = await createTestUser({ name: `${label} Sender` });
  const receiver = await createTestUser({ name: `${label} Receiver` });

  const { data: doc, error: docError } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ owner_id: sender.user.id, title: `${label} Doc`, visibility: 'public' })
    .select('id')
    .single();
  if (docError || !doc) throw new Error(`doc creation failed: ${docError?.message}`);

  const story = await createTestStory(sender.user.id, {
    title: `${label} story`,
    content: `${label} story content for the engage phase.`,
  });
  const point = await createTestPoint(sender.user.id, story.id, { statement: `${label} point one.` });

  const { data: version, error: versionError } = await supabaseAdmin
    .from('story_versions')
    .select('id')
    .eq('story_id', story.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (versionError || !version) throw new Error(`story version lookup failed: ${versionError?.message}`);

  const { letter, delivery } = await createFullTestLetter(
    sender.user.id,
    doc.id,
    [{ storyId: story.id, versionId: version.id, prediction: 6, position: 0 }],
    { email: receiver.email, profileId: receiver.user.id },
    { seal: true },
  );

  return {
    delivery,
    cleanup: async () => {
      await deleteTestLetter(letter.id);
      await deleteTestPoint(point.id);
      await deleteTestStory(story.id);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', doc.id);
      await deleteTestUser(receiver.user.id);
      await deleteTestUser(sender.user.id);
    },
  };
}

/**
 * Walks a sealed one-chapter letter from the cover to the point-engage phase — the only
 * phase that opens the tutorial modal (letter-flow-content.tsx:218-224).
 *
 * The rating buttons' accessible name is `Rate N`, not `N` (partners/shared.tsx:42). A
 * locator matching bare "7" silently resolves to a different element and leaves Continue
 * disabled, which is how this walk first appeared to hang.
 */
async function walkToPointEngage(page: Page, receiverEmail: string, delivery: TestDelivery) {
  await setTestSession(page, receiverEmail);
  await page.goto(`/letter/${delivery.id}?token=${delivery.invitationToken}`);

  await page.getByRole('button', { name: /open the letter/i }).click();
  await page.getByRole('button', { name: 'Rate 7', exact: true }).click();
  await page.getByRole('button', { name: /^continue$/i }).click();
  // Numeric reveal — skipping the explain-back branch lands directly on point-engage.
  await page.getByRole('button', { name: /skip to next point/i }).click();
}

test.describe('P1231: E2E first-run tutorial seed', () => {
  test.describe.configure({ timeout: 120000 });

  test('seeded (suite default): the tutorial modal does not block the engage phase', async ({ page }) => {
    const fixture = await buildLetterFixture('P1231 Seeded');
    const receiverEmail = (await supabaseAdmin
      .from('letter_deliveries')
      .select('receiver_email')
      .eq('id', fixture.delivery.id)
      .single()).data!.receiver_email as string;
    try {
      await walkToPointEngage(page, receiverEmail, fixture.delivery);

      // The engage phase is reached and its own controls are hit-testable — which they
      // are not while a Radix dialog is open, because it makes the rest of the page inert.
      await expect(page.getByRole('button', { name: TUTORIAL_TITLE })).toHaveCount(0);
      await expect(page.getByText(TUTORIAL_TITLE)).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^agree$/i }).first()).toBeVisible();
    } finally {
      await fixture.cleanup();
    }
  });

  test('cleared: the product still forces the tutorial on a genuine first run', async ({ page }) => {
    const fixture = await buildLetterFixture('P1231 Cleared');
    const receiverEmail = (await supabaseAdmin
      .from('letter_deliveries')
      .select('receiver_email')
      .eq('id', fixture.delivery.id)
      .single()).data!.receiver_email as string;
    try {
      // Must run before the navigation — the gate is read during the flow's first render.
      await clearTutorialSeen(page);
      await walkToPointEngage(page, receiverEmail, fixture.delivery);

      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByText(TUTORIAL_TITLE)).toBeVisible();
    } finally {
      await fixture.cleanup();
    }
  });
});
