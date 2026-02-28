/**
 * @file p453-db-schema.spec.ts
 * @description Integration tests for P453: creator self-sign guard in accept_agreement RPC.
 *
 * P453 tightened accept_agreement to add `AND creator_profile_id != p_partner_id`,
 * preventing a creator from accepting their own invitation with their own user ID.
 *
 * Full accept_agreement tests (valid token, invalid token, RLS) are in p443-db-schema.spec.ts.
 * This file covers the P453-specific creator guard assertion.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../../src/lib/supabase-admin';
import { createTestUser, deleteTestUser } from '../helpers/test-user';

test.describe('P453: accept_agreement creator self-sign guard', () => {
  let creatorId: string;
  let partnerEmail: string;

  test.beforeAll(async () => {
    const creator = await createTestUser({ name: 'P453-int Creator' });
    creatorId = creator.user.id;
    partnerEmail = `p453-partner-${Date.now()}@example.com`;
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('clarity_agreements').delete().eq('creator_profile_id', creatorId);
    await deleteTestUser(creatorId);
  });

  test('creator cannot self-sign their own agreement via accept_agreement RPC', async () => {
    const token = crypto.randomUUID();
    const { data: row, error: insertErr } = await supabaseAdmin
      .from('clarity_agreements')
      .insert({
        creator_profile_id: creatorId,
        partner_email: partnerEmail,
        invitation_token: token,
        status: 'pending',
        visibility: 'private',
        terms_text: 'Test terms for P453 creator guard',
      })
      .select('id')
      .single();

    expect(insertErr).toBeNull();
    const agreementId = row!.id;

    try {
      // Creator tries to sign with their own profile ID — must be blocked
      const { data, error } = await supabaseAdmin.rpc('accept_agreement', {
        p_agreement_id: agreementId,
        p_token: token,
        p_partner_id: creatorId, // Same as creator_profile_id — should fail
      });

      expect(error).toBeNull();
      expect(data).toBe(false); // Guard: creator_profile_id != p_partner_id

      const { data: unchanged } = await supabaseAdmin
        .from('clarity_agreements')
        .select('status')
        .eq('id', agreementId)
        .single();
      expect(unchanged?.status).toBe('pending');
    } finally {
      await supabaseAdmin.from('clarity_agreements').delete().eq('id', agreementId);
    }
  });
});
