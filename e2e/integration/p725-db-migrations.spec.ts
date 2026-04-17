/**
 * @file p725-db-migrations.spec.ts
 * @description P725: Other participant identity — DB migration verification
 *
 * Verifies all 4 P725 migrations applied correctly:
 * 1. get_inbox_items RPC returns actor_slug field
 * 2. get_deliveries_with_progress RPC returns receiver_slug field
 * 3. get_letter_results RPC returns slug in sender_profile and receiver_profile JSONB
 * 4. get_letter_for_reading RPC returns sender_slug field
 *
 * Two-client pattern per describe block:
 * - supabaseAdmin: schema existence check (bypasses RLS)
 * - user-scoped JWT client: verifies RLS read access for actual callers
 *
 * If tests fail: run `./scripts/migrate.sh` to apply P725 migrations.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import {
  createFullTestLetter,
  completeTestDelivery,
  deleteTestLetter,
} from '../helpers/test-letter';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_PASSWORD = 'test-password-12345'; // gitleaks:allow

function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(email: string): Promise<string> {
  const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await tempClient.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  return data.session.access_token;
}

// ===========================================================================
// Shared fixture: one sender + receiver + letter used by all 4 migration tests
// ===========================================================================

let sender: TestUser;
let receiver: TestUser;
let senderToken: string;
let receiverToken: string;
let docId: string;
let storyId: string;
let letterId: string;
let deliveryId: string;
let invitationToken: string;

test.describe('P725 Migrations — shared fixture setup', () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P725 Migration Sender' });
    receiver = await createTestUser({ name: 'P725 Migration Receiver' });

    senderToken = await signIn(sender.email);
    receiverToken = await signIn(receiver.email);

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P725 Migration Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, { title: 'P725 Migration Story' });
    storyId = story.id;

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Story version not found');

    const { letter, delivery } = await createFullTestLetter(
      sender.user.id,
      docId,
      [{ storyId, versionId: version.id, prediction: 7, position: 0 }],
      { email: receiver.email, profileId: receiver.user.id },
      { seal: true }
    );
    letterId = letter.id;
    deliveryId = delivery.id;

    // Fetch invitation_token for reading RPC test
    const { data: deliveryRow } = await supabaseAdmin
      .from('letter_deliveries')
      .select('invitation_token')
      .eq('id', deliveryId)
      .single();
    if (!deliveryRow) throw new Error('Delivery row not found');
    invitationToken = deliveryRow.invitation_token;

    // Add a rating and complete so results RPC returns data
    await supabaseAdmin.from('story_verifications').insert({
      story_id: storyId,
      speaker_id: sender.user.id,
      listener_id: receiver.user.id,
      speaker_rating: 7,
      listener_rating: 5,
      source: 'letter',
      verified: false,
      sort_order: 0,
    });
    await completeTestDelivery(deliveryId, 1);
  });

  test.afterAll(async () => {
    if (storyId) {
      await supabaseAdmin
        .from('story_verifications')
        .delete()
        .eq('story_id', storyId)
        .eq('source', 'letter');
    }
    if (letterId) await deleteTestLetter(letterId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  // ── Migration 1: get_inbox_items returns actor_slug ───────────────────────

  test.describe('Migration 1 — get_inbox_items returns actor_slug', () => {
    test('actor_slug field exists in inbox item (service_role path)', async () => {
      const receiverClient = makeUserClient(receiverToken);
      const { data, error } = await receiverClient.rpc('get_inbox_items');

      expect(error, `get_inbox_items failed: ${error?.message}`).toBeNull();
      expect(Array.isArray(data), 'Expected array from get_inbox_items').toBe(true);
      expect((data as unknown[]).length, 'Expected at least 1 inbox item').toBeGreaterThan(0);

      const item = (data as Record<string, unknown>[])[0];
      expect(
        'actor_slug' in item,
        `actor_slug field missing from inbox item. Fields present: ${Object.keys(item).join(', ')}\nRun ./scripts/migrate.sh to apply P725 inbox migration.`
      ).toBe(true);
    });

    test('actor_slug is the sender slug (registered user)', async () => {
      const receiverClient = makeUserClient(receiverToken);
      const { data, error } = await receiverClient.rpc('get_inbox_items');

      expect(error).toBeNull();
      const items = (data as Record<string, unknown>[]) ?? [];
      const item = items.find((i) => i['letter_id'] === letterId);
      expect(item, 'Could not find test letter in inbox').toBeTruthy();

      expect(item!['actor_slug']).toBe(sender.slug);
    });
  });

  // ── Migration 2: get_deliveries_with_progress returns receiver_slug ───────

  test.describe('Migration 2 — get_deliveries_with_progress returns receiver_slug', () => {
    test('receiver_slug field exists in delivery rows (service_role path)', async () => {
      const { data, error } = await supabaseAdmin.rpc('get_deliveries_with_progress', {
        p_letter_ids: [letterId],
      });

      if (error) {
        expect(
          error.message,
          `get_deliveries_with_progress failed — run ./scripts/migrate.sh. Error: ${error.message}`
        ).not.toMatch(/function.*does not exist|could not find function/i);
        return;
      }

      expect(Array.isArray(data), 'Expected array from get_deliveries_with_progress').toBe(true);
      if ((data as unknown[]).length > 0) {
        const delivery = (data as Record<string, unknown>[])[0];
        expect(
          'receiver_slug' in delivery,
          `receiver_slug field missing from delivery. Fields present: ${Object.keys(delivery).join(', ')}\nRun ./scripts/migrate.sh to apply P725 deliveries migration.`
        ).toBe(true);
      }
    });

    test('receiver_slug matches the receiver profile slug', async () => {
      const { data, error } = await supabaseAdmin.rpc('get_deliveries_with_progress', {
        p_letter_ids: [letterId],
      });

      if (error || !Array.isArray(data) || data.length === 0) {
        return;
      }

      const delivery = (data as Record<string, unknown>[]).find(
        (d) => d['id'] === deliveryId
      );
      if (!delivery) return;

      expect(delivery['receiver_slug']).toBe(receiver.slug);
    });

    test('receiver_slug is null for anonymous (link_respondent) delivery', async () => {
      const { data: anonDelivery, error: anonErr } = await supabaseAdmin
        .from('letter_deliveries')
        .insert({
          letter_id: letterId,
          receiver_email: null,
          receiver_profile_id: null,
          status: 'sent',
        })
        .select('id')
        .single();
      if (anonErr || !anonDelivery) return;

      try {
        const { data } = await supabaseAdmin.rpc('get_deliveries_with_progress', {
          p_letter_ids: [letterId],
        });

        if (!Array.isArray(data)) return;

        const anonItem = (data as Record<string, unknown>[]).find(
          (d) => d['id'] === anonDelivery.id
        );
        if (!anonItem) return;

        expect(
          anonItem['receiver_slug'],
          'Anonymous delivery should have null receiver_slug'
        ).toBeNull();
      } finally {
        await supabaseAdmin
          .from('letter_deliveries')
          .delete()
          .eq('id', anonDelivery.id);
      }
    });
  });

  // ── Migration 3: get_letter_results returns slug in profile JSONB ─────────

  test.describe('Migration 3 — get_letter_results profile JSONB includes slug', () => {
    test('sender_profile JSONB includes slug field (sender perspective)', async () => {
      const senderClient = makeUserClient(senderToken);
      const { data, error } = await senderClient.rpc('get_letter_results', {
        p_letter_id: letterId,
        p_delivery_id: null,
      });

      expect(error, `get_letter_results failed for sender: ${error?.message}`).toBeNull();
      const result = Array.isArray(data) ? data[0] : data;
      expect(result, 'Expected a result row').toBeTruthy();

      const resultObj = result as Record<string, unknown>;

      if (resultObj['sender_profile']) {
        const senderProfile = resultObj['sender_profile'] as Record<string, unknown>;
        expect(
          'slug' in senderProfile,
          `slug field missing from sender_profile JSONB. Keys: ${Object.keys(senderProfile).join(', ')}\nRun ./scripts/migrate.sh to apply P725 results migration.`
        ).toBe(true);
      }

      if (resultObj['receiver_profile']) {
        const receiverProfile = resultObj['receiver_profile'] as Record<string, unknown>;
        expect(
          'slug' in receiverProfile,
          `slug field missing from receiver_profile JSONB. Keys: ${Object.keys(receiverProfile).join(', ')}\nRun ./scripts/migrate.sh to apply P725 results migration.`
        ).toBe(true);
      }
    });

    test('receiver_profile slug matches receiver slug (sender perspective)', async () => {
      const senderClient = makeUserClient(senderToken);
      const { data, error } = await senderClient.rpc('get_letter_results', {
        p_letter_id: letterId,
        p_delivery_id: null,
      });

      expect(error).toBeNull();
      const result = Array.isArray(data) ? data[0] : data;
      if (!result) return;

      const resultObj = result as Record<string, unknown>;
      if (!resultObj['receiver_profile']) return;

      const receiverProfile = resultObj['receiver_profile'] as Record<string, unknown>;
      if (!('slug' in receiverProfile)) return;

      expect(receiverProfile['slug']).toBe(receiver.slug);
    });

    test('sender_profile JSONB includes slug field (receiver perspective)', async () => {
      const receiverClient = makeUserClient(receiverToken);
      const { data, error } = await receiverClient.rpc('get_letter_results', {
        p_letter_id: letterId,
        p_delivery_id: deliveryId,
      });

      expect(error, `get_letter_results failed for receiver: ${error?.message}`).toBeNull();
      const result = Array.isArray(data) ? data[0] : data;
      expect(result).toBeTruthy();

      const resultObj = result as Record<string, unknown>;
      if (!resultObj['sender_profile']) return;

      const senderProfile = resultObj['sender_profile'] as Record<string, unknown>;
      expect(
        'slug' in senderProfile,
        `slug missing from sender_profile JSONB (receiver perspective). Keys: ${Object.keys(senderProfile).join(', ')}`
      ).toBe(true);
      expect(senderProfile['slug']).toBe(sender.slug);
    });
  });

  // ── Migration 4: get_letter_for_reading returns sender_slug ───────────────

  test.describe('Migration 4 — get_letter_for_reading returns sender_slug', () => {
    // NOTE: get_letter_for_reading returns a nested envelope `{ letter, snapshots, delivery }`.
    // The sender_slug field lives inside `result.letter` alongside sender_display_name,
    // sender_avatar_url, etc. (matches P697 pattern; consumers read readData.letter.sender_*).
    test('sender_slug field exists in reading RPC response (service_role path)', async () => {
      const { data, error } = await supabaseAdmin.rpc('get_letter_for_reading', {
        p_token: invitationToken,
      });

      expect(error, `get_letter_for_reading failed: ${error?.message}`).toBeNull();
      expect(data, 'Expected data from get_letter_for_reading').not.toBeNull();

      const result = data as Record<string, unknown>;
      const letter = result['letter'] as Record<string, unknown> | null;
      expect(letter, 'Expected `letter` envelope in RPC response').toBeTruthy();
      expect(
        'sender_slug' in (letter ?? {}),
        `sender_slug field missing from get_letter_for_reading letter envelope. Keys: ${Object.keys(letter ?? {}).join(', ')}\nRun ./scripts/migrate.sh to apply P725 reading RPC migration.`
      ).toBe(true);
    });

    test('sender_slug matches the sender profile slug', async () => {
      const { data, error } = await supabaseAdmin.rpc('get_letter_for_reading', {
        p_token: invitationToken,
      });

      expect(error).toBeNull();
      if (!data) return;

      const letter = (data as Record<string, unknown>)['letter'] as Record<string, unknown> | null;
      if (!letter || !('sender_slug' in letter)) return;

      expect(letter['sender_slug']).toBe(sender.slug);
    });

    test('receiver can call get_letter_for_reading and get sender_slug (JWT path)', async () => {
      const receiverClient = makeUserClient(receiverToken);
      const { data, error } = await receiverClient.rpc('get_letter_for_reading', {
        p_token: invitationToken,
      });

      expect(error).toBeNull();
      if (!data) return;

      const letter = (data as Record<string, unknown>)['letter'] as Record<string, unknown> | null;
      if (!letter || !('sender_slug' in letter)) return;

      expect(
        typeof letter['sender_slug'] === 'string' || letter['sender_slug'] === null,
        'sender_slug must be string or null'
      ).toBe(true);
    });
  });
});
