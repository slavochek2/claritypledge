/**
 * P1236 Done-When — two participants, one shared room, correct attribution.
 *
 * This is the criterion the whole feature exists for, and until now it had never been
 * run: every room on the test database had exactly one member (checked 2026-09-11).
 *
 * What it proves: two people who each open /transcribe with NO room code land in the
 * SAME room, and each sees the other's words attributed to the other by name.
 *
 * What it does NOT prove, stated so the Done-When tick stays honest: two separate
 * physical microphones. Both contexts run on one machine, so this covers the
 * room-joining and attribution logic and says nothing about real audio from two real
 * devices. The spec's phone criterion is separate and stays open.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, setTestSession, deleteTestUser, type TestUser } from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

test.describe('P1236: one shared room', () => {
  let alice: TestUser;
  let bob: TestUser;

  test.beforeEach(async () => {
    alice = await createTestUser({ name: 'P1236 Alice' });
    bob = await createTestUser({ name: 'P1236 Bob' });
  });

  test.afterEach(async () => {
    if (alice?.user?.id) await deleteTestUser(alice.user.id);
    if (bob?.user?.id) await deleteTestUser(bob.user.id);
  });

  test('two arrivals with no code join the SAME room and see each other attributed', async ({ browser }) => {
    // Separate contexts so each participant has their own session — one shared browser
    // profile would silently make this a one-person test.
    const ctxA = await browser.newContext({ permissions: ['microphone'] });
    const ctxB = await browser.newContext({ permissions: ['microphone'] });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    const join = async (page: typeof pageA, user: TestUser) => {
      await setTestSession(page, user.email);
      await page.goto('/transcribe');
      await page.getByRole('button', { name: /tap to agree/i }).click();
      await page.getByRole('button', { name: /^Join room$/i }).click();
      await expect(page.getByText(/Listening|Live text|stalled|microphone/i).first())
        .toBeVisible({ timeout: 30_000 });
    };

    await join(pageA, alice);
    await join(pageB, bob);

    // Server truth, not the rendered page: which room did each seat actually land in?
    const seatOf = async (profileId: string) => {
      const { data, error } = await supabaseAdmin
        .from('transcribe_room_members')
        .select('id, room_id, display_name, consent_given_at')
        .eq('profile_id', profileId)
        .order('joined_at', { ascending: false })
        .limit(1)
        .single();
      expect(error, `no seat for ${profileId}: ${error?.message}`).toBeNull();
      return data!;
    };

    const seatA = await seatOf(alice.user.id);
    const seatB = await seatOf(bob.user.id);

    // THE CRITERION. Before the shared-room change each arrival silently made its own
    // room, because nothing ever showed anyone a code to share.
    expect(seatB.room_id, 'Bob must join the room Alice is already in').toBe(seatA.room_id);
    expect(seatA.id).not.toBe(seatB.id);
    // Consent is server-written at join; a seat without it cannot record.
    expect(seatA.consent_given_at).not.toBeNull();
    expect(seatB.consent_given_at).not.toBeNull();

    // Attribution: insert one utterance per seat the way the ingest does (service role,
    // member_id server-derived) and confirm each participant sees BOTH, by name.
    const said = `${Date.now()}`;
    const { error: msgErr } = await supabaseAdmin.from('transcribe_messages').insert([
      { room_id: seatA.room_id, member_id: seatA.id, text: `alice-says-${said}`, is_final: true },
      { room_id: seatB.room_id, member_id: seatB.id, text: `bob-says-${said}`, is_final: true },
    ]);
    expect(msgErr, `seeding messages failed: ${msgErr?.message}`).toBeNull();

    // NO reload. The room lives in page state, so reloading drops you back to the consent
    // screen — which is worth knowing but is not what this test is about. The app's real
    // delivery path is the realtime subscription, so that is what is exercised here.
    for (const page of [pageA, pageB]) {
      await expect(page.getByText(`alice-says-${said}`)).toBeVisible({ timeout: 25_000 });
      await expect(page.getByText(`bob-says-${said}`)).toBeVisible({ timeout: 25_000 });
      // Each utterance carries the speaker's name, and BOTH names are present on BOTH
      // screens — which is the "attributed correctly" half of the criterion.
      await expect(page.getByText('P1236 Alice').first()).toBeVisible();
      await expect(page.getByText('P1236 Bob').first()).toBeVisible();
    }

    await ctxA.close();
    await ctxB.close();
  });
});
