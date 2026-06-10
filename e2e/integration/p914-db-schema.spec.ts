/**
 * Integration test: P914 — letter RPCs gate in-DB email resolution by relationship scope.
 *
 * Migration: 20260610140000_p914_letter_rpc_scope_gate.sql
 *
 * The security fix: seal_and_send_letter and add_recipient_to_sealed_letter resolve a
 * recipient's email in-DB from a caller-supplied receiver_profile_id. Without the gate,
 * any authenticated user could harvest any profile's email by addressing an arbitrary id.
 * These tests exercise the FAILURE path (gate fires on out-of-scope) — the property that
 * proves the fix — plus the in-scope success path (no regression) and the self-send guard.
 *
 * Relationship edge for "in scope": a prior letter from sender delivered to the in-scope
 * profile (the "letters sent" arm of p878_relationship_scope), seeded directly via admin.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail } from '../helpers/test-user';

const TEST_PASSWORD = 'test-password-12345';

async function makeUserClient(email: string) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
  const tempClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await tempClient.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

test.describe('P914: letter RPCs scope-gate in-DB email resolution', () => {
  let senderId: string;
  let senderEmail: string;
  let senderClient: ReturnType<typeof createClient>;

  let inScopeId: string; // shares a relationship edge with sender
  let inScopeEmail: string;

  let strangerId: string; // no relationship with sender
  let docId: string;

  // Fresh draft letter owned by sender.
  async function newDraft(): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from('clarity_letters')
      .insert({ source_doc_id: docId, sender_id: senderId, mode: 'one-to-one' })
      .select('id')
      .single();
    if (error) throw new Error(`newDraft insert failed: ${error.message}`);
    return (data as { id: string }).id;
  }

  // Sealed letter (empty deliveries) owned by sender — for add_recipient tests.
  async function newSealedLetter(): Promise<string> {
    const letterId = await newDraft();
    const { error } = await senderClient.rpc('seal_and_send_letter', {
      p_letter_id: letterId,
      p_predictions: [],
      p_deliveries: [],
    });
    if (error) throw new Error(`newSealedLetter seal failed: ${error.message}`);
    return letterId;
  }

  test.beforeAll(async () => {
    senderEmail = generateTestEmail();
    const { user: sender } = await createTestUser({ email: senderEmail });
    senderId = sender.id;
    senderClient = await makeUserClient(senderEmail);

    inScopeEmail = generateTestEmail();
    const { user: inScope } = await createTestUser({ email: inScopeEmail });
    inScopeId = inScope.id;

    const strangerEmail = generateTestEmail();
    const { user: stranger } = await createTestUser({ email: strangerEmail });
    strangerId = stranger.id;

    const { data: doc, error: docError } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'P914 scope-gate test doc', owner_id: senderId })
      .select('id')
      .single();
    if (docError) throw new Error(`clarity_docs insert failed: ${docError.message}`);
    docId = (doc as { id: string }).id;

    // Seed the sender→inScope relationship edge: a prior letter from sender delivered to
    // inScope's profile. This is the "letters sent" arm of p878_relationship_scope.
    const { data: priorLetter, error: priorErr } = await supabaseAdmin
      .from('clarity_letters')
      .insert({ source_doc_id: docId, sender_id: senderId, mode: 'one-to-one' })
      .select('id')
      .single();
    if (priorErr) throw new Error(`prior letter insert failed: ${priorErr.message}`);
    const { error: delErr } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({ letter_id: (priorLetter as { id: string }).id, receiver_profile_id: inScopeId });
    if (delErr) throw new Error(`prior delivery insert failed: ${delErr.message}`);
  });

  test.afterAll(async () => {
    if (senderId) await supabaseAdmin.from('clarity_letters').delete().eq('sender_id', senderId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    for (const id of [senderId, inScopeId, strangerId]) {
      if (id) await supabaseAdmin.auth.admin.deleteUser(id);
    }
  });

  test('seal: out-of-scope receiver_profile_id is rejected (email-harvest gate fires)', async () => {
    const letterId = await newDraft();
    const { error } = await senderClient.rpc('seal_and_send_letter', {
      p_letter_id: letterId,
      p_predictions: [],
      p_deliveries: [{ receiver_profile_id: strangerId }],
    });
    expect(error?.message ?? '', 'gate must reject an out-of-scope profile_id').toMatch(/relationship scope/i);

    // Transaction rolled back — letter stays draft, no delivery, no email leaked.
    const { data: l } = await supabaseAdmin
      .from('clarity_letters').select('status').eq('id', letterId).single();
    expect((l as { status: string } | null)?.status).toBe('draft');
    const { count } = await supabaseAdmin
      .from('letter_deliveries').select('*', { count: 'exact', head: true }).eq('letter_id', letterId);
    expect(count).toBe(0);
  });

  test('seal: in-scope receiver_profile_id succeeds and resolves email in-DB', async () => {
    const letterId = await newDraft();
    const { data, error } = await senderClient.rpc('seal_and_send_letter', {
      p_letter_id: letterId,
      p_predictions: [],
      p_deliveries: [{ receiver_profile_id: inScopeId }],
    });
    expect(error?.message ?? null, 'in-scope send must not be blocked').toBeNull();
    expect(data).toBe(true);

    const { data: d, error: dErr } = await supabaseAdmin
      .from('letter_deliveries')
      .select('receiver_profile_id, receiver_email')
      .eq('letter_id', letterId)
      .single();
    expect(dErr?.message ?? null).toBeNull();
    expect((d as { receiver_profile_id: string }).receiver_profile_id).toBe(inScopeId);
    expect((d as { receiver_email: string }).receiver_email).toBe(inScopeEmail);
  });

  test('seal: self receiver_profile_id still blocked (regression)', async () => {
    const letterId = await newDraft();
    const { error } = await senderClient.rpc('seal_and_send_letter', {
      p_letter_id: letterId,
      p_predictions: [],
      p_deliveries: [{ receiver_profile_id: senderId }],
    });
    expect(error?.message ?? '', 'self-send guard must fire before the scope gate').toMatch(/yourself/i);
  });

  test('add_recipient: out-of-scope receiver_profile_id is rejected (gate fires)', async () => {
    const letterId = await newSealedLetter();
    const { error } = await senderClient.rpc('add_recipient_to_sealed_letter', {
      p_letter_id: letterId,
      p_receiver_profile_id: strangerId,
    });
    expect(error?.message ?? '', 'gate must reject an out-of-scope profile_id').toMatch(/relationship scope/i);
  });

  test('add_recipient: in-scope receiver_profile_id succeeds', async () => {
    const letterId = await newSealedLetter();
    const { data, error } = await senderClient.rpc('add_recipient_to_sealed_letter', {
      p_letter_id: letterId,
      p_receiver_profile_id: inScopeId,
    });
    expect(error?.message ?? null, 'in-scope add must not be blocked').toBeNull();
    expect(typeof data).toBe('string'); // returns the new delivery id
  });
});
