/**
 * @file p673-letter-reading-flow.spec.ts
 * @description P673: Letter reading flow reuses /live components.
 *
 * Tests the receiver's reading experience with /live component composition:
 * - Story cards via LiveStoryCardExpanded (points hidden)
 * - Rating via Drawer + RatingButtons
 * - Gap reveal via JourneyToUnderstanding + GapBanner
 * - Point engagement via LetterPointCard + PositionButtons
 * - Sequential ritual: Submit → reveal → Continue
 * - Anti-point lead ordering for 2+ visible points
 * - D36: story-first for 1 visible point
 * - Preview matches reading
 */

import { test, expect as _expect } from '@playwright/test';
import {
  createTestUser,
  setTestSession as _setTestSession,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createFullTestLetter as _createFullTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';

test.describe('P673: Letter reading — /live component reuse', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  let storyId: string;
  let point1Id: string;
  let point2Id: string;
  let point3Id: string;
  let letterId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P673 Sender' });
    receiver = await createTestUser({ name: 'P673 Receiver' });

    // Create doc with story and 3 points (triggers anti-point lead: 2+ visible)
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P673 Test Doc', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, { content: 'P673 test story content for reading flow.' });
    storyId = story.id;

    const p1 = await createTestPoint(sender.user.id, storyId, { statement: 'First test point' });
    const p2 = await createTestPoint(sender.user.id, storyId, { statement: 'Second test point' });
    const p3 = await createTestPoint(sender.user.id, storyId, { statement: 'Third test point' });
    point1Id = p1.id;
    point2Id = p2.id;
    point3Id = p3.id;

    // TODO: Create full letter with snapshots including point_config with 3 visible points
    // Use createFullTestLetter or manual setup with createTestStorySnapshot
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    await deleteTestPoint(point3Id);
    await deleteTestPoint(point2Id);
    await deleteTestPoint(point1Id);
    await deleteTestStory(storyId);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    await deleteTestUser(receiver.user.id);
    await deleteTestUser(sender.user.id);
  });

  // ===========================================================================
  // AC1: Story cards use LiveStoryCardExpanded (points hidden)
  // ===========================================================================

  test('story card shows author avatar, name, and story text (LiveStoryCardExpanded)', async ({ page: _page }) => {
    // TODO: Navigate to letter reading page
    // TODO: Progress to story-rate phase
    // Assert: story card has author name, avatar, story text
    // Assert: NO "N points" expand toggle visible (hidePoints)
    // Assert: no point rows visible inside the card
  });

  // ===========================================================================
  // AC2: Rating in Drawer (not inline)
  // ===========================================================================

  test('rating question appears in bottom Drawer over story card', async ({ page: _page }) => {
    // TODO: Navigate to story-rate phase
    // Assert: Drawer is visible (bottom sheet)
    // Assert: contains "How well do you believe you understand this story?"
    // Assert: RatingButtons 0-10 visible
    // Assert: Submit button visible
    // Assert: story card still visible behind/above drawer
  });

  test('Submit button is disabled until a rating is selected', async ({ page: _page }) => {
    // TODO: Navigate to story-rate phase
    // Assert: Submit disabled initially
    // TODO: Click rating button (e.g., 7)
    // Assert: Submit now enabled
  });

  // ===========================================================================
  // AC3: JourneyToUnderstanding + GapBanner after rating
  // ===========================================================================

  test('after rating submit, JourneyToUnderstanding shows with sealed-bid reveal', async ({ page: _page }) => {
    // TODO: Submit rating
    // Assert: JourneyToUnderstanding component visible above story card
    // Assert: shows receiver's rating AND sender's prediction (both revealed)
    // Assert: GapBanner shows "N points gap" badge + insight message
    // Assert: Continue button visible
  });

  test('gap banner shows correct insight message', async ({ page: _page }) => {
    // TODO: Set up letter where sender predicted 8, receiver rates 5
    // Assert: gap banner shows "3 points gap"
    // Assert: insight message contains "less" or "more" depending on direction
  });

  // ===========================================================================
  // AC4: Point engagement uses PositionButtons
  // ===========================================================================

  test('point card shows point text with agree/disagree/unsure buttons', async ({ page: _page }) => {
    // TODO: Navigate to point-engage phase (anti-point lead, first point)
    // Assert: point text visible
    // Assert: three position buttons visible (agree, disagree, unsure)
    // Assert: Submit button visible (disabled until positioned)
  });

  test('after point position submit, sender position reveals with gap', async ({ page: _page }) => {
    // TODO: Position on point (click agree) → Submit
    // Assert: sender's position visible (PositionBadge)
    // Assert: gap/match notification shown
    // Assert: Continue button visible
  });

  // ===========================================================================
  // AC5: Anti-point lead for 2+ visible points
  // ===========================================================================

  test('2+ visible points: first point shown before story', async ({ page: _page }) => {
    // TODO: Navigate to letter with 3 visible points
    // Assert: first phase is point-engage (point card visible, not story card)
    // TODO: Complete point → reveal → Continue
    // Assert: next phase is story-rate (story card visible)
  });

  test('remaining points shown after story rating', async ({ page: _page }) => {
    // TODO: Complete story rating + reveal
    // Assert: Continue leads to remaining-point-engage (point 2)
    // TODO: Complete point 2 → Continue
    // Assert: remaining-point-engage (point 3)
    // TODO: Complete point 3 → Continue
    // Assert: transition phase ("Story N complete")
  });

  // ===========================================================================
  // AC6: D36 — 1 visible point = story first
  // ===========================================================================

  test('1 visible point: story shown first, then point', async ({ page: _page }) => {
    // TODO: Create letter with 1-point story
    // Assert: first phase is story-rate (story card + drawer)
    // TODO: Complete rating → reveal → Continue
    // Assert: next phase is point-engage (point card)
  });

  // ===========================================================================
  // AC7: 0 visible points = story + rate + reveal only
  // ===========================================================================

  test('0 visible points: story → rate → reveal → next story', async ({ page: _page }) => {
    // TODO: Create letter with 0-point story
    // Assert: first phase is story-rate
    // TODO: Complete rating → reveal → Continue
    // Assert: goes to transition (no point phases)
  });

  // ===========================================================================
  // AC8: No "I've read this" gate
  // ===========================================================================

  test('no intermediate "I\'ve read this" button between story and rating', async ({ page: _page }) => {
    // TODO: Navigate to story-rate phase
    // Assert: NO "I've read this story" button anywhere on page
    // Assert: rating Drawer is already present (story + rate are one phase)
  });

  // ===========================================================================
  // AC9: Sequential ritual — forward-only
  // ===========================================================================

  test('cannot go back to previous story or phase', async ({ page: _page }) => {
    // TODO: Complete story 1, advance to story 2
    // Assert: no back button for story navigation
    // Assert: pressing browser back doesn't return to story 1 reading
  });

  // ===========================================================================
  // AC10: Hidden points not shown, not counted for anti-point lead
  // ===========================================================================

  test('hidden points are excluded from the reading flow', async ({ page: _page }) => {
    // TODO: Create letter with 3 points where point 2 is hidden
    // Assert: only 2 point cards shown throughout the flow
    // Assert: hidden point text never appears on page
  });

  // ===========================================================================
  // AC11: Chrome-free (carried from P665)
  // ===========================================================================

  test('reading page has no top nav or bottom nav', async ({ page: _page }) => {
    // TODO: Navigate to letter reading page
    // Assert: no SimpleNavigation (Home, Letters, Events, My Profile)
    // Assert: no BottomNav
  });

  // ===========================================================================
  // AC12: Preview matches reading
  // ===========================================================================

  test('preview page renders identical component structure as reading page', async ({ page: _page }) => {
    // TODO: Log in as sender, navigate to preview
    // Assert: story card (LiveStoryCardExpanded) present
    // Assert: rating Drawer present
    // Assert: same phase flow as reading
  });

  test('preview ratings do not write to database', async ({ page: _page }) => {
    // TODO: Rate a story in preview
    // Query story_verifications table — no new rows for this letter
    // Query letter_point_responses — no new rows
  });
});

// =============================================================================
// BOUNDARY: Empty letter edge cases
// =============================================================================

test.describe('P673: Boundary — edge cases', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let receiver: TestUser;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P673 Edge Sender' });
    receiver = await createTestUser({ name: 'P673 Edge Receiver' });
  });

  test.afterAll(async () => {
    await deleteTestUser(receiver.user.id);
    await deleteTestUser(sender.user.id);
  });

  test('all points hidden behaves like 0-point story', async ({ page: _page }) => {
    // TODO: Create letter with story where all 3 points are hidden
    // Assert: flow is story → rate → reveal → transition (no point phases)
  });

  test('sessionStorage resume handles snapshot count change gracefully', async ({ page: _page }) => {
    // P665 bug: "Story 5 of 4" when snapshot count changed after sessionStorage save
    // TODO: Navigate, save state, change story count, reload
    // Assert: no "Story N of M" where N > M — state resets if mismatch
  });
});
