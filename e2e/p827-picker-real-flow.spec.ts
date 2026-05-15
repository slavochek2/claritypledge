/**
 * P827 — Picker-driven flow, real UI path.
 *
 * Drives the actual picker UI (Author clicks "+ Select your story" → picks a story)
 * so handleSelectStory runs in production exactly as it does for a real user. The
 * canary test in p827-round-2-picker-preload.spec.ts bypassed this path by writing
 * live_state directly — that's why it passed while manual repro still failed.
 *
 * Setup:
 *   - Author + listener users (auth contexts)
 *   - A clarity_letters row from author → listener, sealed
 *   - One letter_story_snapshots row
 *   - One letter_predictions row (author predicted listener's understanding)
 *   - One letter_deliveries row, status='completed'
 *   - One story_verifications row, source='letter' (listener's self-rating)
 *   - One clarity_sessions row WITHOUT source_letter_id (regular picker session)
 *
 * Scenario:
 *   1. Both users navigate to /live/<code>
 *   2. Author opens picker → picks the letter-backed story
 *   3. Assert BOTH pages reach explain-back (creator AND joiner)
 *      ← if joiner stays on rating drawer, we've reproduced the manual-test bug
 */

import { test, expect, type Browser } from '@playwright/test';
import { getTestAuthContext } from './helpers/auth-context';
import { deleteTestUser, type TestUser } from './helpers/test-user';
import { mockMicPermission } from './helpers/test-realtime';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestLetter,
  createTestStorySnapshot,
  createTestPrediction,
  createTestDelivery,
  sealTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';

const SESSION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateSessionCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += SESSION_CODE_ALPHABET[Math.floor(Math.random() * SESSION_CODE_ALPHABET.length)];
  }
  return code;
}

test.describe('P827 — picker-driven real UI flow', () => {
  test.setTimeout(120000);

  test('Author picks letter-backed story from picker → BOTH pages reach explain-back', async ({
    browser,
  }: { browser: Browser }) => {
    let author: TestUser | undefined;
    let listener: TestUser | undefined;
    let storyId: string | undefined;
    let docId: string | undefined;
    let letterId: string | undefined;
    let sessionId: string | undefined;
    let verificationId: string | undefined;
    let sessionCode = '';

    try {
      // ── 1. Create users
      const [authorAuth, listenerAuth] = await Promise.all([
        getTestAuthContext('host', browser, { name: 'P827 Author' }),
        getTestAuthContext('host', browser, { name: 'P827 Listener' }),
      ]);
      author = authorAuth.user;
      listener = listenerAuth.user;

      // ── 2. Doc + Story (authored by author)
      const { data: doc } = await supabaseAdmin
        .from('clarity_docs')
        .insert({ title: `P827 Doc ${Date.now()}`, owner_id: author.user.id })
        .select('id')
        .single();
      if (!doc) throw new Error('Failed to create doc');
      docId = doc.id;

      const story = await createTestStory(author.user.id, {
        title: `P827 Story ${Date.now()}`,
        content: 'P827 picker-flow story content — checking joiner-side preload',
      });
      storyId = story.id;

      const { data: version } = await supabaseAdmin
        .from('story_versions')
        .select('id')
        .eq('story_id', story.id)
        .order('version_number', { ascending: true })
        .limit(1)
        .single();
      if (!version) throw new Error('Failed to fetch story version');

      // ── 3. Letter author → listener, sealed, delivery completed
      const letter = await createTestLetter(author.user.id, doc.id, { mode: 'one-to-one' });
      letterId = letter.id;
      await createTestStorySnapshot(letter.id, story.id, version.id, { position: 0 });
      const delivery = await createTestDelivery(letter.id, {
        receiverEmail: listener.email,
        receiverProfileId: listener.user.id,
        status: 'completed',
      });
      await createTestPrediction(letter.id, story.id, 7, delivery.id);
      await sealTestLetter(letter.id);

      // ── 4. story_verifications baseline (listener's self-rating, source='letter')
      const { data: verification } = await supabaseAdmin
        .from('story_verifications')
        .insert({
          story_id: story.id,
          speaker_id: author.user.id,
          listener_id: listener.user.id,
          speaker_rating: 7,
          listener_rating: 5,
          source: 'letter',
          verified: false,
        })
        .select('id')
        .single();
      if (!verification) throw new Error('Failed to create verification');
      verificationId = verification.id;

      // ── 5. Regular session — NO source_letter_id (picker entry path)
      sessionCode = generateSessionCode();
      const { data: session } = await supabaseAdmin
        .from('clarity_sessions')
        .insert({
          code: sessionCode,
          creator_name: 'P827 Author',
          creator_profile_id: author.user.id,
          joiner_name: 'P827 Listener',
          joiner_profile_id: listener.user.id,
          live_state: { checksCount: 0 },
          last_activity_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (!session) throw new Error('Failed to create session');
      sessionId = session.id;

      // ── 6. Both pages navigate to /live/<code>
      const authorPage = await authorAuth.context.newPage();
      const listenerPage = await listenerAuth.context.newPage();

      // Forward browser console to test output so we see [Realtime], [LiveUpdate], etc.
      listenerPage.on('console', (msg) => {
        const text = msg.text();
        if (/Realtime|LiveUpdate|Drift|P646|P827|P643|P671/.test(text)) {
          console.log(`[listener-console] ${text}`);
        }
      });
      authorPage.on('console', (msg) => {
        const text = msg.text();
        if (/Realtime|LiveUpdate|Drift|P646|P827|P643|P671/.test(text)) {
          console.log(`[author-console] ${text}`);
        }
      });

      await Promise.all([mockMicPermission(authorPage), mockMicPermission(listenerPage)]);

      await Promise.all([
        authorPage.goto(`/live/${sessionCode}?skipMicCheck=true`),
        listenerPage.goto(`/live/${sessionCode}?skipMicCheck=true`),
      ]);

      // Wait for both pages to settle on the live view
      await authorPage.waitForLoadState('networkidle');
      await listenerPage.waitForLoadState('networkidle');

      // ── 7. Author opens picker
      const selectStoryButton = authorPage.getByRole('button', { name: /\+ Select your story/i });
      await expect(selectStoryButton).toBeVisible({ timeout: 15000 });
      await selectStoryButton.click();

      // ── 8. Author picks the story (button with the story content as text)
      const storyButton = authorPage.getByRole('button', {
        name: new RegExp(story.content.slice(0, 40), 'i'),
      });
      await expect(storyButton).toBeVisible({ timeout: 10000 });
      await storyButton.click();

      // ── 9. Both pages should reach explain-back — story content visible, rating drawer NOT visible
      console.log('[P827 test] Picker click done — waiting for both pages to reach explain-back');

      // Neither page should be on the rating-capture drawer (that's the bug symptom).
      const authorRatingDrawer = authorPage.getByText(/How well do you believe.*understands you/i);
      const listenerRatingDrawer = listenerPage.getByText(/How well do you believe.*understands you/i);

      await expect(
        authorRatingDrawer,
        'BUG: Author (writer of handleSelectStory) stuck on rating drawer instead of explain-back',
      ).toHaveCount(0, { timeout: 15000 });
      await expect(
        listenerRatingDrawer,
        'BUG: Listener stuck on rating drawer instead of explain-back',
      ).toHaveCount(0, { timeout: 15000 });

      // Both pages should reach explain-back. Author sees "<partner>'s journey to understand you"
      // (checker view, partner explains back); listener sees "Your journey to understand <author>"
      // (responder view, listener explains back). Match either pattern on each side.
      await expect(authorPage.getByText(/journey to understand/i).first())
        .toBeVisible({ timeout: 15000 });
      await expect(listenerPage.getByText(/journey to understand/i).first())
        .toBeVisible({ timeout: 15000 });

      await authorAuth.cleanup();
      await listenerAuth.cleanup();
    } finally {
      // Cleanup in reverse dependency order
      if (sessionId) {
        await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
      }
      if (verificationId) {
        await supabaseAdmin.from('story_verifications').delete().eq('id', verificationId);
      }
      if (letterId) await deleteTestLetter(letterId).catch(() => {});
      if (storyId) await deleteTestStory(storyId).catch(() => {});
      if (docId) {
        await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
      }
      if (author) await deleteTestUser(author.user.id).catch(() => {});
      if (listener) await deleteTestUser(listener.user.id).catch(() => {});
    }
  });
});
