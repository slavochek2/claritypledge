/**
 * P778: Integration test — create_letter_delivery_on_open RPC
 *
 * Verifies the migration was applied and the RPC behaves correctly:
 * - Creates a delivery row for an authenticated non-sender reader
 * - Is idempotent (second call returns the same row)
 * - Rejects the sender opening their own letter
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail } from '../helpers/test-user';

test.describe('P778: create_letter_delivery_on_open RPC', () => {
  let senderUserId: string;
  let senderEmail: string;
  let readerUserId: string;
  let readerEmail: string;
  let letterId: string;

  test.beforeAll(async () => {
    senderEmail = generateTestEmail();
    readerEmail = generateTestEmail();

    const { user: sender } = await createTestUser({ email: senderEmail });
    senderUserId = sender.id;

    const { user: reader } = await createTestUser({ email: readerEmail });
    readerUserId = reader.id;

    // Create a sealed one-to-many letter owned by the sender
    const { data: letter, error: letterErr } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        sender_id: senderUserId,
        mode: 'one-to-many',
        status: 'sealed',
      })
      .select('id')
      .single();

    expect(letterErr).toBeNull();
    letterId = letter!.id;
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
    await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    if (senderUserId) await supabaseAdmin.auth.admin.deleteUser(senderUserId);
    if (readerUserId) await supabaseAdmin.auth.admin.deleteUser(readerUserId);
  });

  test('RPC creates a delivery row for authenticated non-sender reader', async () => {
    const { data: signIn, error: signInErr } = await supabaseAdmin.auth.signInWithPassword({
      email: readerEmail,
      password: 'test-password-12345',
    });
    expect(signInErr).toBeNull();

    const readerClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } } }
    );

    const { data, error } = await readerClient.rpc('create_letter_delivery_on_open', {
      p_letter_id: letterId,
    });

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].letter_id).toBe(letterId);
    expect(data[0].receiver_profile_id).toBe(readerUserId);
    expect(data[0].status).toBe('opened');
    expect(data[0].opened_at).not.toBeNull();
  });

  test('RPC is idempotent — second call returns same row', async () => {
    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
      email: readerEmail,
      password: 'test-password-12345',
    });

    const readerClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } } }
    );

    const { data: first } = await readerClient.rpc('create_letter_delivery_on_open', {
      p_letter_id: letterId,
    });
    const { data: second } = await readerClient.rpc('create_letter_delivery_on_open', {
      p_letter_id: letterId,
    });

    expect(first[0].id).toBe(second[0].id);
  });

  test('RPC rejects sender opening their own letter', async () => {
    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
      email: senderEmail,
      password: 'test-password-12345',
    });

    const senderClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } } }
    );

    const { error } = await senderClient.rpc('create_letter_delivery_on_open', {
      p_letter_id: letterId,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain('Sender cannot open their own letter');
  });
});
