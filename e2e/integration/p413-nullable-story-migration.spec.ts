/**
 * @file p413-nullable-story-migration.spec.ts
 * @description Integration test: P413 migration makes story_id and version_id nullable
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: schema-level checks (bypasses RLS — proves columns exist + allow NULL)
 * - user-scoped JWT client: RLS check (authenticated users can create verifications without story_id)
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../../src/lib/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, generateTestEmail } from '../helpers/test-user';

test.describe('Migration: P413 — story_id and version_id nullable on story_verifications', () => {
  let speakerId: string;
  let listenerId: string;
  let speakerEmail: string;
  let listenerEmail: string;
  const insertedIds: string[] = [];

  test.beforeAll(async () => {
    speakerEmail = generateTestEmail();
    listenerEmail = generateTestEmail();
    const speaker = await createTestUser({ email: speakerEmail });
    const listener = await createTestUser({ email: listenerEmail });
    speakerId = speaker.user.id;
    listenerId = listener.user.id;
  });

  test.afterAll(async () => {
    // Delete verifications first (FK deps), then users
    if (insertedIds.length > 0) {
      await supabaseAdmin.from('story_verifications').delete().in('id', insertedIds);
    }
    if (speakerId) await deleteTestUser(speakerId);
    if (listenerId) await deleteTestUser(listenerId);
  });

  // ── 1. Schema: story_id is nullable ─────────────────────────────────────
  test('story_id column accepts NULL (migration applied)', async () => {
    const { error } = await supabaseAdmin
      .from('story_verifications')
      .select('story_id')
      .is('story_id', null)
      .limit(1);

    expect(error, `story_id not nullable: ${error?.message}. Run: supabase db push`).toBeNull();
  });

  // ── 2. Schema: version_id is nullable ───────────────────────────────────
  test('version_id column accepts NULL (migration applied)', async () => {
    const { error } = await supabaseAdmin
      .from('story_verifications')
      .select('version_id')
      .is('version_id', null)
      .limit(1);

    expect(error, `version_id not nullable: ${error?.message}. Run: supabase db push`).toBeNull();
  });

  // ── 3. Admin insert: no story_id, no version_id — succeeds ──────────────
  test('can insert story_verification without story_id or version_id (service role)', async () => {
    const { data, error } = await supabaseAdmin
      .from('story_verifications')
      .insert({
        story_id: null,
        version_id: null,
        speaker_id: speakerId,
        listener_id: listenerId,
        speaker_rating: 7,
        listener_rating: 8,
      })
      .select('id, story_id, version_id')
      .single();

    if (data?.id) insertedIds.push(data.id);

    expect(error, `Insert without story_id failed: ${error?.message}`).toBeNull();
    expect(data?.story_id).toBeNull();
    expect(data?.version_id).toBeNull();
  });

  // ── 4. Trigger: no-story insert increments verification_session_count ────
  test('inserting without story_id increments verification_session_count for listener', async () => {
    const { data: before } = await supabaseAdmin
      .from('profiles')
      .select('verification_session_count')
      .eq('id', listenerId)
      .single();
    const countBefore = before?.verification_session_count ?? 0;

    const { data, error } = await supabaseAdmin
      .from('story_verifications')
      .insert({
        story_id: null,
        version_id: null,
        speaker_id: speakerId,
        listener_id: listenerId,
        speaker_rating: 6,
        listener_rating: 7,
      })
      .select('id')
      .single();

    if (data?.id) insertedIds.push(data.id);
    expect(error).toBeNull();

    const { data: after } = await supabaseAdmin
      .from('profiles')
      .select('verification_session_count')
      .eq('id', listenerId)
      .single();

    expect(after?.verification_session_count).toBe(countBefore + 1);
  });

  // ── 5. RLS: authenticated user can insert without story_id ───────────────
  test('authenticated user can insert story_verification without story_id (RLS check)', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: speakerEmail,
      password: 'test-password-12345',
    });
    expect(signInError).toBeNull();

    const userClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    const { data, error } = await userClient
      .from('story_verifications')
      .insert({
        story_id: null,
        version_id: null,
        speaker_id: speakerId,
        listener_id: listenerId,
        speaker_rating: 8,
        listener_rating: 9,
      })
      .select('id')
      .single();

    if (data?.id) insertedIds.push(data.id);

    expect(error, `RLS blocked insert without story_id: ${error?.message}`).toBeNull();
    expect(data?.id).toBeTruthy();
  });
});
