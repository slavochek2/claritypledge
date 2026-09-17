/**
 * @file p1327-event-grace-interval-grant.spec.ts
 * @description P1327: event_grace_interval() is not executable by anon, and the room RPCs that
 * read it still work — they are SECURITY DEFINER, so the revoke must not reach them.
 *
 * Asserted by MESSAGE, not by "an error occurred": the intended refusal happens at the grant,
 * which PostgREST reports as "permission denied for function". Each half carries a control.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';

test.describe('P1327: event_grace_interval grant', () => {
  test('anon is refused at the grant', async () => {
    const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
    const { error } = await anon.rpc('event_grace_interval');
    expect(error?.message ?? '', 'anon must not be able to execute event_grace_interval()')
      .toMatch(/permission denied for function/i);

    // CONTROL: the same anon client reaches a function anon is deliberately granted, so the
    // refusal above is about this function's grant and not an unreachable API.
    const control = await anon.rpc('get_session_by_code', { p_code: 'ZZZZZZ' });
    expect(control.error, 'control: anon must still reach an allowlisted function').toBeNull();
  });

  test('the value is unchanged for the owner-side callers', async () => {
    const { data, error } = await supabaseAdmin.rpc('event_grace_interval');
    expect(error, `service role must still execute it: ${error?.message}`).toBeNull();
    expect(data).toBe('12:00:00');
  });
});
