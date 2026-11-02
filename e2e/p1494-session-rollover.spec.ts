/**
 * P1494: when an abandoned guest seat is taken over, the room continues as a NEW session under the
 * same code. The creator's open page must follow it (and show the new guest, not the old one),
 * driven by the app's own delivery (1s poll / realtime) — no page.reload().
 *
 * The takeover itself is the server call the join flow makes (claim_joiner_seat) as a signed-in
 * newcomer; the page under test is the creator's.
 */
import { test, expect, type Browser } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { getTestAuthContext } from './helpers/auth-context';
import { supabaseAdmin } from './helpers/supabase-admin';
import { mockMicPermission } from './helpers/test-realtime';
import { dismissTermsDialog } from './helpers/test-session';
import { TEST_PASSWORD } from './helpers/test-user';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * 32)]).join('');

test.describe('P1494: creator page follows a seat takeover', () => {
  test.setTimeout(120_000);

  test('creator page shows the new guest, never the previous one, after the seat is taken over', async ({ browser }: { browser: Browser }) => {
    const OLD_GUEST = 'Oldguest';
    const NEW_GUEST = 'Newguest';
    const PRIOR_STATE = { checksCount: 0, sessionHistory: [{ title: 'SENTINEL p1494 prior', type: 'point', partnerName: OLD_GUEST }] };
    // The live view names the partner only inside the Speak control: "Did <partner> understand you?"
    const speakFor = (who: string) => new RegExp(`Did ${who} understand you`);
    const code = makeCode();
    const hostAuth = await getTestAuthContext('host', browser, { name: 'P1494 Host' });
    const newcomerAuth = await getTestAuthContext('host', browser, { name: 'P1494 Newcomer' });
    const ids: string[] = [];

    try {
      // An anonymous guest holds the seat and is present; the creator's page is open on it.
      const now = new Date().toISOString();
      const { data: room, error } = await supabaseAdmin.from('clarity_sessions').insert({
        code, creator_name: 'P1494 Host', creator_profile_id: hostAuth.user.user.id,
        joiner_name: OLD_GUEST, joiner_seat_claimed_at: now, joiner_last_seen_at: now,
        joiner_seat_secret: crypto.randomUUID(),
        live_state: PRIOR_STATE,
        last_activity_at: now,
      }).select('id').single();
      expect(error, error?.message).toBeNull();
      ids.push(room!.id as string);

      const hostPage = await hostAuth.context.newPage();
      await mockMicPermission(hostPage);
      await hostPage.goto(`/live/${code}?skipMicCheck=true`);
      await dismissTermsDialog(hostPage);
      await expect(hostPage.getByRole('button', { name: speakFor(OLD_GUEST) })).toBeVisible({ timeout: 20_000 });

      // The guest goes quiet past the inactivity window; a newcomer takes the seat.
      const stale = new Date(Date.now() - 16 * 60_000).toISOString();
      await supabaseAdmin.from('clarity_sessions').update({ joiner_seat_claimed_at: stale, joiner_last_seen_at: stale }).eq('id', room!.id);

      const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({ email: newcomerAuth.user.email, password: TEST_PASSWORD });
      expect(signInError).toBeNull();
      await supabaseAdmin.auth.signOut();
      const asNewcomer = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const claimed = await asNewcomer.rpc('claim_joiner_seat', { p_code: code, p_joiner_name: NEW_GUEST });
      expect(claimed.error, claimed.error?.message).toBeNull();
      const newId = (Array.isArray(claimed.data) ? claimed.data[0] : claimed.data).id as string;
      expect(newId).not.toBe(room!.id);
      ids.push(newId);

      // The creator's page follows: the control now names the new guest, via the app's own poll, with no reload.
      await expect(hostPage.getByRole('button', { name: speakFor(NEW_GUEST) })).toBeVisible({ timeout: 30_000 });
      await expect(hostPage.getByRole('button', { name: speakFor(OLD_GUEST) })).toHaveCount(0);

      // ...and it is really bound to the new row: its next write lands there and never on the finished one.
      const newBefore = JSON.stringify((await supabaseAdmin.from('clarity_sessions').select('live_state').eq('id', newId).single()).data?.live_state);
      await hostPage.getByTestId('start-check').filter({ visible: true }).first().click();
      await expect.poll(async () => JSON.stringify((await supabaseAdmin.from('clarity_sessions').select('live_state').eq('id', newId).single()).data?.live_state), { timeout: 20_000 }).not.toBe(newBefore);
      const oldAfter = (await supabaseAdmin.from('clarity_sessions').select('live_state').eq('id', room!.id).single()).data?.live_state;
      expect(oldAfter, 'the finished conversation was written to after the rollover').toEqual(PRIOR_STATE);
      expect(JSON.stringify((await supabaseAdmin.from('clarity_sessions').select('live_state').eq('id', newId).single()).data?.live_state)).not.toContain('SENTINEL p1494 prior');
    } finally {
      if (ids.length) {
        await supabaseAdmin.from('clarity_live_turns').delete().in('session_id', ids);
        await supabaseAdmin.from('clarity_sessions').delete().in('id', ids);
      }
      await newcomerAuth.cleanup();
      await hostAuth.cleanup();
    }
  });
});
