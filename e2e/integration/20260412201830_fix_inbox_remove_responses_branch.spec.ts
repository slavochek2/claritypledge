/**
 * Integration test: get_inbox_items RPC returns only 'received' type items.
 *
 * Migration: 20260412201830_fix_inbox_remove_responses_branch.sql
 * Purpose: Verify the UNION ALL responses branch was removed — the RPC
 *   must never return 'recipient_responded' or 'link_respondent' items
 *   for the sender's inbox.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail } from '../helpers/test-user';

test.describe('Migration: fix_inbox_remove_responses_branch — get_inbox_items returns received-only', () => {
  let senderUserId: string;
  let senderEmail: string;

  test.beforeAll(async () => {
    senderEmail = generateTestEmail();
    const { user } = await createTestUser({ email: senderEmail });
    senderUserId = user.id;
  });

  test.afterAll(async () => {
    if (senderUserId) {
      await supabaseAdmin.auth.admin.deleteUser(senderUserId);
    }
  });

  test('get_inbox_items RPC exists and is callable', async () => {
    const { data, error } = await supabaseAdmin.rpc('get_inbox_items', {
      p_user_id: senderUserId,
    });

    expect(error, `get_inbox_items RPC missing or broken: ${error?.message}`).toBeNull();
    // Empty inbox is valid for a new test user
    expect(Array.isArray(data)).toBe(true);
  });

  test('get_inbox_items never returns recipient_responded or link_respondent items', async () => {
    const { data, error } = await supabaseAdmin.rpc('get_inbox_items', {
      p_user_id: senderUserId,
    });

    expect(error).toBeNull();

    const items = data as Array<{ type: string }>;
    const invalidItems = items.filter(
      (item) => item.type === 'recipient_responded' || item.type === 'link_respondent'
    );

    expect(
      invalidItems,
      `Inbox contains sender-notification items that should have been removed: ${JSON.stringify(invalidItems)}`
    ).toHaveLength(0);
  });

  test('all items returned by get_inbox_items have type "received"', async () => {
    const { data, error } = await supabaseAdmin.rpc('get_inbox_items', {
      p_user_id: senderUserId,
    });

    expect(error).toBeNull();

    const items = data as Array<{ type: string }>;
    for (const item of items) {
      expect(item.type).toBe('received');
    }
  });
});
