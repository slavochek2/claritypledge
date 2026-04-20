/**
 * E2E regression for P765 — invite overlay MUST appear via realtime on the
 * receiver's letter page.
 *
 * Root cause (pre-fix): `useOpenLiveInvite` realtime INSERT handler queried
 * `clarity_sessions` for columns that do not exist (`creator_photo_url`,
 * `creator_avatar_color`, `creator_is_pledger`). PostgREST returned 42703 and
 * the hook bailed before dispatch — banner never appeared.
 *
 * This test asserts both:
 *   1. Banner text renders after invite is seeded post-navigation (proves realtime
 *      delivery + enrichment query reaches dispatch).
 *   2. Banner avatar renders with the seeded profile's `avatar_color` — proves
 *      the nested `profiles!...fkey` join returned data (would be default color
 *      if the join resolved null).
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
} from './helpers/test-user';
import {
  createTestLetter,
  createTestDelivery,
  createTestStorySnapshot,
  sealTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { waitForUIUpdate } from './helpers/test-realtime';

// Distinct color so the assertion can't accidentally pass on the default test
// user color. rgb form matches what the browser computes from the hex.
const AUTHOR_AVATAR_COLOR_HEX = '#A21CAF';
const AUTHOR_AVATAR_COLOR_RGB = 'rgb(162, 28, 175)';

test('P765: receiver banner appears via realtime with enriched avatar color', async ({ browser }) => {
  test.setTimeout(90000);
  const [author, receiver] = await Promise.all([
    createTestUser({ name: 'P765 Regression Author' }),
    createTestUser({ name: 'P765 Regression Receiver' }),
  ]);

  // Override author's avatar_color to a distinct value so the enrichment assertion
  // proves the nested profiles join populated the field (not a default fallback).
  await supabaseAdmin
    .from('profiles')
    .update({ avatar_color: AUTHOR_AVATAR_COLOR_HEX })
    .eq('id', author.user.id);

  const { data: doc } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ title: `P765 Regression Doc ${Date.now()}`, owner_id: author.user.id })
    .select('id')
    .single();
  if (!doc) throw new Error('doc insert failed');

  const story = await createTestStory(author.user.id, {
    title: `P765 Regression Story ${Date.now()}`,
    summary: 'regression story',
  });

  const { data: version } = await supabaseAdmin
    .from('story_versions')
    .select('id')
    .eq('story_id', story.id)
    .order('version_number', { ascending: true })
    .limit(1)
    .single();
  if (!version) throw new Error('story_versions missing');

  const letter = await createTestLetter(author.user.id, doc.id, { mode: 'one-to-one' });
  await createTestStorySnapshot(letter.id, story.id, version.id, {
    position: 0,
    pointConfig: {
      storyTitle: `P765 Regression Story`,
      storyText: 'text',
      points: [],
    },
  });
  const delivery = await createTestDelivery(letter.id, {
    receiverEmail: receiver.email,
    receiverProfileId: receiver.user.id,
    status: 'in_progress',
  });
  await sealTestLetter(letter.id);

  const receiverContext = await browser.newContext();
  const receiverPage = await receiverContext.newPage();

  let sessionId: string | undefined;

  try {
    await setTestSession(receiverPage, receiver.email);
    await receiverPage.goto(`/letter/${delivery.id}`);
    await receiverPage.waitForLoadState('networkidle');

    // Receiver must enter reading view — LetterLiveBanner only mounts inside
    // LetterReadingFlow (viewState === 'reading'), not on the cover.
    const openButton = receiverPage.getByRole('button', { name: 'Open the Letter' });
    await expect(openButton).toBeVisible({ timeout: 10000 });
    await openButton.click();
    // Wait for the reading flow to mount (hook subscribes to Realtime on mount).
    await expect(receiverPage.getByRole('button', { name: 'Open the Letter' })).not.toBeVisible({
      timeout: 10000,
    });

    // Seed session + invite AFTER navigation so delivery must arrive via Realtime.
    const code = `P765R${Date.now().toString(36).toUpperCase().slice(0, 4)}`;
    const { data: session } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: 'P765 Regression Author',
        creator_profile_id: author.user.id,
        target_listener_id: receiver.user.id,
        source_letter_id: letter.id,
        live_state: { checksCount: 0 },
        last_activity_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (!session) throw new Error('session insert failed');
    sessionId = session.id;

    const { data: invite } = await supabaseAdmin
      .from('clarity_live_invites')
      .insert({ session_id: session.id, target_user_id: receiver.user.id })
      .select('id')
      .single();
    if (!invite) throw new Error('invite insert failed');

    // (1) Banner title arrives via Realtime — proves enrichment SELECT reached dispatch.
    const bannerTitle = receiverPage.getByText('P765 Regression Author is inviting you to Clarity');
    await waitForUIUpdate(receiverPage, bannerTitle, 20000);

    // (2) The avatar inside the banner is colored with the author's profile
    //     avatar_color — only possible if the nested `profiles!...fkey` join
    //     populated. Pre-fix (missing-column 42703), session is null, enrichment
    //     bails, banner never renders; if something weaker rendered the banner
    //     without the join, the avatar would fall back to the default color.
    const bannerAvatar = receiverPage
      .locator('div.flex.items-center.gap-3')
      .filter({ has: bannerTitle })
      .locator('div.rounded-full')
      .first();
    await expect(bannerAvatar).toHaveCSS('background-color', AUTHOR_AVATAR_COLOR_RGB, {
      timeout: 10000,
    });
  } finally {
    if (sessionId) {
      await supabaseAdmin.from('clarity_live_invites').delete().eq('session_id', sessionId);
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    }
    await deleteTestLetter(letter.id);
    await deleteTestStory(story.id);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', doc.id);
    await Promise.all([deleteTestUser(author.user.id), deleteTestUser(receiver.user.id)]);
    await receiverContext.close();
  }
});
