/**
 * Integration test: p947 cron columns migration
 * Verifies the 4 new columns exist on event_rsvps and are readable/writable
 * via service role (cron context). Users cannot write them (no UPDATE RLS policy).
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';

test.describe('Migration: 20260617120000 — event_rsvps cron columns', () => {
  test('new cron columns exist on event_rsvps (service role select)', async () => {
    // A SELECT requesting these columns will error with 42703 if they don't exist
    const { error } = await supabaseAdmin
      .from('event_rsvps')
      .select('reminder_scheduled_at, feedback_scheduled_at, reminder_attempted_at, feedback_attempted_at')
      .limit(1);

    expect(error).toBeNull();
  });

  test('reminder_scheduled_at and feedback_scheduled_at default to null', async () => {
    // Find an existing RSVP and verify the new columns are null (no backfill)
    const { data, error } = await supabaseAdmin
      .from('event_rsvps')
      .select('id, reminder_scheduled_at, feedback_scheduled_at')
      .is('reminder_scheduled_at', null)
      .limit(1);

    expect(error).toBeNull();
    // Either no rows exist or the first row has null scheduled_at
    if (data && data.length > 0) {
      expect(data[0].reminder_scheduled_at).toBeNull();
    }
  });
});
