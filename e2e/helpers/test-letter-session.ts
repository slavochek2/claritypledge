/**
 * @file test-letter-session.ts
 *
 * E2E Test Helper: Letter-sourced /live session fixture (P703)
 *
 * Composes existing helpers (test-letter, test-story, test-session) to create
 * a complete fixture for P703 tests:
 * - A sealed letter from author to listener
 * - A story_verifications row (letter-sourced baseline ratings)
 * - A clarity_sessions row with source_letter_id, source_story_id, target_listener_id
 * - An open clarity_live_invites row for the listener
 *
 * REUSES (no duplication):
 * - createTestUser / deleteTestUser from test-user.ts
 * - createTestLetter / sealTestLetter / deleteTestLetter from test-letter.ts
 * - createTestStory / deleteTestStory from test-story.ts
 * - supabaseAdmin for direct DB inserts
 *
 * NET-NEW (only in this file):
 * - createLetterSessionFixture() — orchestrates the above into a single fixture
 * - deleteLetterSessionFixture() — tears down in correct dependency order
 * - seedLetterVerificationRow() — inserts a story_verifications row for the letter baseline
 *
 * CLEANUP ORDER (dependency graph):
 *   invites (FK → sessions) → sessions (FK → letters, stories) → letters → stories → docs
 *
 * FIXME(generate-tests): The `clarity_sessions` insert below uses `source_story_id` and
 * `target_listener_id` which are the new columns added by the P703 migration.
 * If the migration hasn't been applied, this helper will throw on insert.
 */

import { supabaseAdmin } from './supabase-admin';
import { createTestStory, deleteTestStory } from './test-story';
import {
  createTestLetter,
  createTestDelivery,
  createTestStorySnapshot,
  createTestPrediction,
  sealTestLetter,
  deleteTestLetter,
} from './test-letter';
import type { TestUser } from './test-user';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LetterSessionFixture {
  /** clarity_sessions row id */
  sessionId: string;
  /** clarity_sessions room code — use to navigate to /live/<code> */
  sessionCode: string;
  /** clarity_live_invites row id */
  inviteId: string;
  /** clarity_letters row id */
  letterId: string;
  /** letter_deliveries row id — use with ?delivery= param for sender's results page */
  deliveryId: string;
  /** stories row id */
  storyId: string;
  /** clarity_docs row id (owned by author) */
  docId: string;
  /** Author's profile id */
  authorId: string;
  /** Listener's profile id */
  listenerId: string;
}

// ─── Session code generator (matches prod alphabet) ──────────────────────────

const SESSION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateSessionCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += SESSION_CODE_ALPHABET[Math.floor(Math.random() * SESSION_CODE_ALPHABET.length)];
  }
  return code; // Must be exactly 6 chars — extractCodeFromInput() rejects anything else
}

// ─── seedLetterVerificationRow ────────────────────────────────────────────────

/**
 * Seeds a story_verifications row representing the letter's baseline predictions.
 * Per P581/D26: letters write source='letter' rows with speaker_rating (sender prediction)
 * and listener_rating (receiver self-assessment).
 *
 * Returns the inserted row id for cleanup.
 */
async function seedLetterVerificationRow(opts: {
  storyId: string;
  speakerProfileId: string;
  listenerProfileId: string;
  speakerRating?: number;
  listenerRating?: number;
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('story_verifications')
    .insert({
      story_id: opts.storyId,
      speaker_id: opts.speakerProfileId,
      listener_id: opts.listenerProfileId,
      speaker_rating: opts.speakerRating ?? 7,
      listener_rating: opts.listenerRating ?? 4,
      source: 'letter',
      verified: false,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Failed to seed letter verification row: ${error?.message}`);
  return data.id;
}

// ─── createLetterSessionFixture ───────────────────────────────────────────────

/**
 * Creates a complete P703 test fixture:
 * 1. Seals a letter from author → listener (with one story, one prediction)
 * 2. Inserts a story_verifications row (letter baseline ratings)
 * 3. Creates a clarity_sessions row with source_letter_id, source_story_id, target_listener_id
 * 4. Creates an open clarity_live_invites row for listener
 *
 * Use in beforeAll; call deleteLetterSessionFixture in afterAll.
 */
export async function createLetterSessionFixture(
  author: TestUser,
  listener: TestUser,
  opts: {
    speakerRating?: number;
    listenerRating?: number;
  } = {}
): Promise<LetterSessionFixture> {
  console.log(`[test-letter-session] Creating P703 fixture: author=${author.user.id}, listener=${listener.user.id}`);

  // 1. Create a clarity_docs owned by author
  const { data: doc, error: docError } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ title: `P703 Test Doc ${Date.now()}`, owner_id: author.user.id })
    .select('id')
    .single();
  if (docError || !doc) throw new Error(`Failed to create test doc: ${docError?.message}`);

  // 2. Create a story authored by author
  const story = await createTestStory(author.user.id, {
    title: `P703 Test Story ${Date.now()}`,
    summary: 'A story used for letter-sourced /live testing',
  });

  // 3. Create and seal the letter (with snapshot + prediction)
  // Fetch the auto-created story_versions row (trigger fires on story INSERT)
  const { data: version, error: versionError } = await supabaseAdmin
    .from('story_versions')
    .select('id')
    .eq('story_id', story.id)
    .order('version_number', { ascending: true })
    .limit(1)
    .single();
  if (versionError || !version) throw new Error(`Failed to fetch story version: ${versionError?.message}`);

  const letter = await createTestLetter(author.user.id, doc.id, { mode: 'one-to-one' });
  await createTestStorySnapshot(letter.id, story.id, version.id, { position: 0 });
  const delivery = await createTestDelivery(letter.id, {
    receiverEmail: listener.email,
    receiverProfileId: listener.user.id,
    status: 'completed',
  });
  await createTestPrediction(letter.id, story.id, opts.speakerRating ?? 7, delivery.id);
  await sealTestLetter(letter.id);

  // 4. Seed story_verifications baseline row
  await seedLetterVerificationRow({
    storyId: story.id,
    speakerProfileId: author.user.id,
    listenerProfileId: listener.user.id,
    speakerRating: opts.speakerRating ?? 7,
    listenerRating: opts.listenerRating ?? 4,
  });

  // 5. Create the clarity_sessions row (letter-sourced)
  // Pre-write the bootstrap state so both parties see explain-back phase immediately.
  // In production, bootstrapLetterSourcedSession() writes this from handleCreate().
  // Fixture bypasses handleCreate, so we write the equivalent state directly.
  const bootstrapLiveState = {
    checksCount: 0,
    ratingPhase: 'explain-back',
    checkerRating: opts.speakerRating ?? 7,
    responderRating: opts.listenerRating ?? 4,
    checkerIsCreator: true,
    checkerSubmitted: true,
    responderSubmitted: true,
    selectedStoryId: story.id,
  };
  const sessionCode = generateSessionCode();
  const { data: session, error: sessionError } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code: sessionCode,
      creator_name: author.name,
      creator_profile_id: author.user.id,
      source_letter_id: letter.id,
      source_story_id: story.id,
      target_listener_id: listener.user.id,
      live_state: bootstrapLiveState,
      last_activity_at: new Date().toISOString(),
    })
    .select('id, code')
    .single();
  if (sessionError || !session) throw new Error(`Failed to create letter-sourced session: ${sessionError?.message}`);

  // 6. Create the open invite for listener
  const { data: invite, error: inviteError } = await supabaseAdmin
    .from('clarity_live_invites')
    .insert({ session_id: session.id, target_user_id: listener.user.id })
    .select('id')
    .single();
  if (inviteError || !invite) throw new Error(`Failed to create invite: ${inviteError?.message}`);

  console.log(`[test-letter-session] Fixture created: session=${session.code}, invite=${invite.id}`);

  return {
    sessionId: session.id,
    sessionCode: session.code,
    inviteId: invite.id,
    letterId: letter.id,
    deliveryId: delivery.id,
    storyId: story.id,
    docId: doc.id,
    authorId: author.user.id,
    listenerId: listener.user.id,
  };
}

// ─── deleteLetterSessionFixture ───────────────────────────────────────────────

/**
 * Deletes a P703 fixture in correct dependency order.
 *
 * Order:
 * 1. Invites (FK → sessions) — cascade from session delete handles this, but explicit is safer
 * 2. Sessions (FK → letters, stories)
 * 3. story_verifications rows for the story (source='letter')
 * 4. Letter (cascade: deliveries, snapshots, predictions via ON DELETE CASCADE)
 * 5. Story
 * 6. Doc
 *
 * Note: user cleanup is the test's responsibility — this helper only cleans fixture rows.
 */
export async function deleteLetterSessionFixture(fixture: LetterSessionFixture): Promise<void> {
  console.log(`[test-letter-session] Deleting P703 fixture: session=${fixture.sessionCode}`);

  // 1. Delete invite explicitly (also cascades from session delete, but belt-and-braces)
  await supabaseAdmin
    .from('clarity_live_invites')
    .delete()
    .eq('id', fixture.inviteId);

  // 2. Delete session (FK cascade removes any remaining invites)
  await supabaseAdmin
    .from('clarity_sessions')
    .delete()
    .eq('id', fixture.sessionId);

  // 3. Delete story_verifications for this story (source='letter')
  await supabaseAdmin
    .from('story_verifications')
    .delete()
    .eq('story_id', fixture.storyId)
    .eq('source', 'letter');

  // 4. Delete letter (CASCADE handles deliveries, snapshots, predictions)
  await deleteTestLetter(fixture.letterId);

  // 5. Delete story
  await deleteTestStory(fixture.storyId);

  // 6. Delete doc
  await supabaseAdmin
    .from('clarity_docs')
    .delete()
    .eq('id', fixture.docId);

  console.log(`[test-letter-session] P703 fixture deleted.`);
}
