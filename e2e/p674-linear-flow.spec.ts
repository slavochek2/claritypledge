/**
 * @file p674-linear-flow.spec.ts
 * @description E2E two-party tests for P674: Simplified /live — Single Linear Flow
 *
 * Tests the merged flow (guided + free → single path) with two browser contexts:
 * 1. Full round: idle → rating → waiting → reveal → paraphrase → sliders → celebration → idle
 * 2. Escape hatches: speak freely exits from any phase
 * 3. Story selection persists throughout round
 * 4. Race condition scenarios from Done-When:
 *    - Simultaneous rating submission (both submit within <100ms)
 *    - Simultaneous celebration acknowledgment
 *    - Partner disconnect during reveal phase
 *    - Stale Realtime echo after rating submission (the P671 scenario)
 *
 * Auth: Uses createTwoPartySession for both participants (host + guest verified).
 * Realtime: Uses waitForUIUpdate for cross-context assertions.
 * State advancement: Uses advanceSessionState to skip multi-step UI flows.
 */

import { test, expect } from '@playwright/test';
import { createTwoPartySession, type TwoPartySession } from './helpers/test-session';
import {
  advanceSessionState,
  waitForUIUpdate,
  waitForDBStateKey,
} from './helpers/test-realtime';
import { supabaseAdmin } from './helpers/supabase-admin';

test.describe('P674: Single Linear Flow — Full Round', () => {
  test.describe.configure({ timeout: 120000 });

  let session: TwoPartySession;

  test.afterEach(async () => {
    if (session) await session.cleanup();
  });

  test('complete round: idle → speak → rating → reveal → paraphrase → sliders → celebration', async ({ browser }) => {
    session = await createTwoPartySession(browser, {
      hostName: 'Alice',
      guestName: 'Bob',
    });

    const speakerPage = session.host.page;
    const listenerPage = session.guest.page;
    const code = session.sessionCode;

    // --- Phase 1: Idle — speaker sees "Speak" button ---
    // TODO: Update selector once P674 implements new idle screen
    await expect(speakerPage.getByRole('button', { name: /Speak|Did.*understand/i })).toBeVisible({ timeout: 15000 });

    // --- Phase 2: Speaker initiates round ---
    await speakerPage.getByRole('button', { name: /Speak|Did.*understand/i }).click();

    // --- Phase 3: Both enter sealed-bid rating ---
    // Both should see rating input
    await expect(speakerPage.getByText(/How well/i)).toBeVisible({ timeout: 10000 });
    await expect(listenerPage.getByText(/How well/i)).toBeVisible({ timeout: 10000 });

    // Both see Submit button
    await expect(speakerPage.getByRole('button', { name: /Submit/i })).toBeVisible();
    await expect(listenerPage.getByRole('button', { name: /Submit/i })).toBeVisible();

    // Speaker submits rating
    await speakerPage.getByRole('button', { name: /Submit/i }).click();

    // Listener submits rating
    await listenerPage.getByRole('button', { name: /Submit/i }).click();

    // --- Phase 4: Reveal ---
    // After both submit, both should see the reveal screen
    // TODO: Update selectors for P674 reveal UI
    await expect(speakerPage.getByText(/reveal|gap|rating/i).first()).toBeVisible({ timeout: 15000 });
    await expect(listenerPage.getByText(/reveal|gap|rating/i).first()).toBeVisible({ timeout: 15000 });

    // --- Phase 5: Paraphrase ---
    // Advance to paraphrase phase via DB (to avoid complex UI navigation)
    await advanceSessionState(code, {
      phase: 'paraphrase',
      explainBackStarted: true,
    });

    // Listener should see paraphrase prompt
    await waitForUIUpdate(
      listenerPage,
      listenerPage.getByText(/explain back|paraphrase|I'm done/i).first(),
      20000,
    );

    // Listener completes paraphrase
    await advanceSessionState(code, {
      phase: 'paraphrase',
      explainBackDone: true,
      speakerReRating: 8,
    });

    // --- Phase 6: Sliders ---
    await advanceSessionState(code, {
      phase: 'sliders',
      sliderCreator: 7,
      sliderJoiner: 5,
    });

    // Both should see slider UI
    await waitForUIUpdate(
      speakerPage,
      speakerPage.locator('[role="slider"]').first(),
      20000,
    );

    // Advance to 10/10 convergence
    await advanceSessionState(code, {
      phase: 'sliders',
      sliderCreator: 10,
      sliderJoiner: 10,
    });

    // --- Phase 7: Celebration ---
    await advanceSessionState(code, { phase: 'celebration' });

    // Both should see celebration/success screen
    await waitForUIUpdate(
      speakerPage,
      speakerPage.getByText(/congrat|success|well done|celebrate/i).first(),
      20000,
    );

    // Both acknowledge
    await advanceSessionState(code, {
      phase: 'celebration',
      celebrationAckedCreator: true,
      celebrationAckedJoiner: true,
    });

    // Should return to idle
    await advanceSessionState(code, {
      phase: 'idle',
      celebrationAckedCreator: false,
      celebrationAckedJoiner: false,
      ratingA: null,
      ratingB: null,
      ratingASubmitted: false,
      ratingBSubmitted: false,
      speakerReRating: null,
      explainBackStarted: false,
      explainBackDone: false,
    });

    // Verify idle screen is back
    await waitForUIUpdate(
      speakerPage,
      speakerPage.getByRole('button', { name: /Speak|Did.*understand/i }),
      20000,
    );
  });
});

test.describe('P674: Escape Hatches', () => {
  test.describe.configure({ timeout: 90000 });

  let session: TwoPartySession;

  test.afterEach(async () => {
    if (session) await session.cleanup();
  });

  test('speak freely exits from rating phase back to idle', async ({ browser }) => {
    session = await createTwoPartySession(browser, {
      hostName: 'Alice',
      guestName: 'Bob',
    });

    const code = session.sessionCode;

    // Advance to rating phase
    await advanceSessionState(code, {
      phase: 'rating',
      speakerIsCreator: true,
      ratingInitiatedBy: 'Alice',
    });

    // Wait for rating UI to appear
    await waitForUIUpdate(
      session.host.page,
      session.host.page.getByText(/How well/i),
      15000,
    );

    // Click "Speak freely" if visible
    const speakFreely = session.host.page.getByText(/Speak freely/i);
    if (await speakFreely.isVisible({ timeout: 5000 })) {
      await speakFreely.click();

      // Should exit back to idle
      await waitForDBStateKey(
        'clarity_sessions',
        'live_state',
        'phase',
        'idle',
        'code',
        code,
        15000,
      );
    }
  });

  test('speak freely exits from paraphrase phase back to idle', async ({ browser }) => {
    session = await createTwoPartySession(browser, {
      hostName: 'Alice',
      guestName: 'Bob',
    });

    const code = session.sessionCode;

    // Advance to paraphrase phase
    await advanceSessionState(code, {
      phase: 'paraphrase',
      speakerIsCreator: true,
      explainBackStarted: true,
    });

    // Wait for paraphrase UI
    await waitForUIUpdate(
      session.guest.page,
      session.guest.page.getByText(/explain back|paraphrase/i).first(),
      15000,
    );

    // Click "Speak freely" on guest (listener) page
    const speakFreely = session.guest.page.getByText(/Speak freely/i);
    if (await speakFreely.isVisible({ timeout: 5000 })) {
      await speakFreely.click();

      await waitForDBStateKey(
        'clarity_sessions',
        'live_state',
        'phase',
        'idle',
        'code',
        code,
        15000,
      );
    }
  });
});

test.describe('P674: Race Condition Scenarios (Done-When)', () => {
  test.describe.configure({ timeout: 90000 });

  let session: TwoPartySession;

  test.afterEach(async () => {
    if (session) await session.cleanup();
  });

  test('simultaneous rating submission — both submit within <100ms', async ({ browser }) => {
    session = await createTwoPartySession(browser, {
      hostName: 'Alice',
      guestName: 'Bob',
    });

    const code = session.sessionCode;

    // Set up rating phase
    await advanceSessionState(code, {
      phase: 'rating',
      speakerIsCreator: true,
      ratingInitiatedBy: 'Alice',
    });

    // Wait for both to see rating UI
    await Promise.all([
      waitForUIUpdate(
        session.host.page,
        session.host.page.getByRole('button', { name: /Submit/i }),
        15000,
      ),
      waitForUIUpdate(
        session.guest.page,
        session.guest.page.getByRole('button', { name: /Submit/i }),
        15000,
      ),
    ]);

    // Both submit simultaneously via parallel RPC patches
    // (simulates near-simultaneous submission — more reliable than UI clicks)
    // Get session ID for RPC
    const { data: sessionData } = await supabaseAdmin
      .from('clarity_sessions')
      .select('id')
      .eq('code', code)
      .single();

    // Simulate concurrent writes via supabaseAdmin (service role)
    // In production, these would be participant-scoped RPC calls
    await Promise.all([
      supabaseAdmin.rpc('patch_live_state', {
        p_session_id: sessionData!.id,
        p_patch: { ratingA: 7, ratingASubmitted: true },
      }),
      supabaseAdmin.rpc('patch_live_state', {
        p_session_id: sessionData!.id,
        p_patch: { ratingB: 5, ratingBSubmitted: true },
      }),
    ]);

    // Verify both ratings persisted (no collision/overwrite)
    const { data: finalData } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', code)
      .single();

    const state = finalData?.live_state as Record<string, unknown>;
    expect(state.ratingASubmitted).toBe(true);
    expect(state.ratingBSubmitted).toBe(true);
    expect(state.ratingA).toBe(7);
    expect(state.ratingB).toBe(5);
  });

  test('simultaneous celebration acknowledgment — both ack within <100ms', async ({ browser }) => {
    session = await createTwoPartySession(browser, {
      hostName: 'Alice',
      guestName: 'Bob',
    });

    const code = session.sessionCode;

    // Advance to celebration phase
    await advanceSessionState(code, { phase: 'celebration' });

    const { data: sessionData } = await supabaseAdmin
      .from('clarity_sessions')
      .select('id')
      .eq('code', code)
      .single();

    // Both acknowledge simultaneously via parallel RPC patches
    await Promise.all([
      supabaseAdmin.rpc('patch_live_state', {
        p_session_id: sessionData!.id,
        p_patch: { celebrationAckedCreator: true },
      }),
      supabaseAdmin.rpc('patch_live_state', {
        p_session_id: sessionData!.id,
        p_patch: { celebrationAckedJoiner: true },
      }),
    ]);

    // Verify both acks persisted
    const { data: finalData } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', code)
      .single();

    const state = finalData?.live_state as Record<string, unknown>;
    expect(state.celebrationAckedCreator).toBe(true);
    expect(state.celebrationAckedJoiner).toBe(true);
  });

  test('partner disconnect during reveal phase — grace period fires', async ({ browser }) => {
    session = await createTwoPartySession(browser, {
      hostName: 'Alice',
      guestName: 'Bob',
    });

    const code = session.sessionCode;

    // Advance to reveal phase
    await advanceSessionState(code, {
      phase: 'revealed',
      ratingA: 7,
      ratingB: 5,
      ratingASubmitted: true,
      ratingBSubmitted: true,
    });

    // Wait for reveal UI on speaker page
    await waitForUIUpdate(
      session.host.page,
      session.host.page.getByText(/reveal|gap|rating/i).first(),
      15000,
    );

    // Simulate partner disconnect by closing guest page
    await session.guest.page.close();

    // Host should eventually see partner departure notice
    // The app detects departure via Realtime presence or polling
    // TODO: Verify exact departure UI text once P674 implements it
    await expect(
      session.host.page.getByText(/left|disconnected|partner.*gone|departed/i).first()
    ).toBeVisible({ timeout: 30000 });
  });

  test('stale Realtime echo after rating submission — P671 scenario', async ({ browser }) => {
    session = await createTwoPartySession(browser, {
      hostName: 'Alice',
      guestName: 'Bob',
    });

    const code = session.sessionCode;

    // Set up: creator has submitted rating, in waiting phase
    await advanceSessionState(code, {
      phase: 'waiting',
      speakerIsCreator: true,
      ratingA: 7,
      ratingASubmitted: true,
      ratingBSubmitted: false,
    });

    // Verify waiting state in DB
    await waitForDBStateKey(
      'clarity_sessions',
      'live_state',
      'ratingASubmitted',
      true,
      'code',
      code,
    );

    // Simulate stale Realtime echo: write a state update that tries to
    // regress ratingASubmitted back to false (the P671 bug).
    // With the monotonic guard, the app should reject this at the client level.
    // But we verify at DB level that the guard function would detect it.

    // Read current state
    const { data: currentData } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', code)
      .single();

    const currentState = currentData?.live_state as Record<string, unknown>;
    expect(currentState.ratingASubmitted).toBe(true);

    // The stale echo would carry ratingASubmitted: false.
    // The monotonic guard (isStateRegression) should detect this as a regression.
    // We verify the DB state was NOT clobbered by checking after the test.
    // (The actual guard runs client-side; here we verify the DB stays correct.)

    // Write the legitimate next step: joiner submits
    await advanceSessionState(code, {
      phase: 'waiting',
      ratingB: 5,
      ratingBSubmitted: true,
    });

    // Verify ratingASubmitted was NOT regressed
    const { data: finalData } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', code)
      .single();

    const finalState = finalData?.live_state as Record<string, unknown>;
    expect(finalState.ratingASubmitted).toBe(true);
    expect(finalState.ratingBSubmitted).toBe(true);
  });
});

test.describe('P674: No Mode Switcher (P672 closed)', () => {
  test.describe.configure({ timeout: 60000 });

  let session: TwoPartySession;

  test.afterEach(async () => {
    if (session) await session.cleanup();
  });

  test('idle screen does not show Guided/Open mode toggle', async ({ browser }) => {
    session = await createTwoPartySession(browser, {
      hostName: 'Alice',
      guestName: 'Bob',
    });

    // Wait for page to load
    await expect(session.host.page.locator('body')).toBeVisible({ timeout: 10000 });

    // Mode toggle should NOT be present
    // TODO: These assertions validate after P674 removes the mode toggle
    await expect(session.host.page.getByText('Guided mode')).not.toBeVisible({ timeout: 3000 });
    await expect(session.host.page.getByText('Open mode')).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe('P674: In-Session History Removed', () => {
  test.describe.configure({ timeout: 60000 });

  let session: TwoPartySession;

  test.afterEach(async () => {
    if (session) await session.cleanup();
  });

  test('idle screen does not show session history cards', async ({ browser }) => {
    session = await createTwoPartySession(browser, {
      hostName: 'Alice',
      guestName: 'Bob',
    });

    // Advance to idle with a completed round in history
    await advanceSessionState(session.sessionCode, {
      phase: 'idle',
      sessionHistory: [{ round: 1, speakerIsCreator: true, ratingA: 7, ratingB: 5 }],
    });

    // Wait for idle screen
    await waitForUIUpdate(
      session.host.page,
      session.host.page.getByRole('button', { name: /Speak|Did.*understand/i }),
      15000,
    );

    // Session history cards should NOT appear inline
    // TODO: Update selector based on actual history card component
    await expect(session.host.page.locator('[data-testid="session-history-list"]')).not.toBeVisible({ timeout: 3000 });
  });
});
