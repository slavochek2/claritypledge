/**
 * @file p1336-registration-prep.spec.ts
 * @description P1336 — registering carries the preparation. Real browser, real test DB,
 * real signed-in session (setTestSession), at 320px for the new-registrant walk.
 *
 * Covers: screen 0 states (question / remind / in progress / prepared), the full new-registrant
 * walk 0 → End with DB-persisted answers, DB-backed resume after reload, the returning person's
 * shorter plan ("Step k of {remaining}"), answered statements skipped on a later visit, the
 * room gate (Prepare now / Join without preparing, no dialog) and banner, prep off = the old
 * confirmation, and the host list.
 */
import { test, expect, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const inTwoDays = () => new Date(Date.now() + 2 * 24 * 3600 * 1000);

async function prepEvent(host: TestUser, opts: { tag?: string | null; enabled?: boolean } = {}): Promise<TestEvent> {
  const ev = await createTestEvent(host.user.id, inTwoDays(), {
    title: 'Clarity Night #98: AI and Your Ikigai. P1336 test',
    location: 'Test venue, Chiang Mai',
  });
  const { error } = await supabaseAdmin
    .from('events')
    .update({ preparation_enabled: opts.enabled ?? true, statement_tag: opts.tag === undefined ? 'ikigai1' : opts.tag })
    .eq('id', ev.id);
  if (error) throw error;
  return ev;
}

async function prepRow(eventId: string, profileId: string) {
  const { data } = await supabaseAdmin.from('event_preparations').select('*').eq('event_id', eventId).eq('profile_id', profileId).maybeSingle();
  return data;
}

async function seedAllPartsDone(profileId: string) {
  const at = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  await supabaseAdmin.from('person_prep_parts').upsert(
    ['intro_video', 'cognitive_video', 'principle_intro', 'cmp7'].map((part) => ({
      profile_id: profileId, part, content_version: 1, completed_at: at,
    })),
    { onConflict: 'profile_id,part' },
  );
}

async function tagPointIds(tag: string): Promise<string[]> {
  const { data } = await supabaseAdmin.from('points').select('id').contains('tags', [tag]).order('created_at');
  return (data ?? []).map((r) => r.id as string);
}

const continueWithoutVideo = (page: Page) => page.getByRole('button', { name: 'Continue without video' }).click();

test.describe('P1336 registration preparation', () => {
  let host: TestUser;
  const users: TestUser[] = [];
  const events: TestEvent[] = [];

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1336 E2E Host' });
  });

  test.afterAll(async () => {
    for (const e of events) await deleteTestEvent(e.id);
    for (const u of [host, ...users]) if (u?.user?.id) {
      await supabaseAdmin.from('point_positions').delete().eq('user_id', u.user.id);
      await deleteTestUser(u.user.id);
    }
  });

  async function registrant(name: string, ev: TestEvent): Promise<TestUser> {
    const u = await createTestUser({ name });
    users.push(u);
    await rsvpToEvent(ev.id, u.user.id);
    return u;
  }

  test('smoke: screen 0 loads with the why, the minutes question and both actions; no console errors', async ({ page }) => {
    const ev = await prepEvent(host);
    events.push(ev);
    const u = await registrant('P1336 Smoke', ev);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 320, height: 640 });
    await setTestSession(page, u.email);
    await page.goto(`/events/${ev.slug}/confirm`);

    await expect(page.getByTestId('registered-card')).toContainText("You're Registered!");
    await expect(page.getByTestId('prep-why')).toContainText('Our events are different');
    await expect(page.getByTestId('prep-question')).toHaveText(/^Do you have \d+ minutes to prepare for the event\?$/);
    await expect(page.getByRole('button', { name: 'Prepare now' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remind me by email' })).toBeVisible();
    await expect(page.getByText(/how did you hear/i)).toHaveCount(0);
    await expect(page.getByText(/0 of 6/)).toHaveCount(0);
    // No auto-redirect away from the question.
    await page.waitForTimeout(11_000);
    await expect(page).toHaveURL(new RegExp(`/events/${ev.slug}/confirm`));
    expect(errors).toEqual([]);
  });

  test('Remind me by email records the choice and shows the confirmation', async ({ page }) => {
    const ev = events[0]!;
    const u = await registrant('P1336 Remind', ev);
    await setTestSession(page, u.email);
    await page.goto(`/events/${ev.slug}/confirm`);
    await page.getByRole('button', { name: 'Remind me by email' }).click();
    await expect(page.getByTestId('reminder-confirmation')).toHaveText("✓ We'll email you a reminder");
    await expect.poll(async () => (await prepRow(ev.id, u.user.id))?.prep_choice).toBe('remind');
  });

  test('new registrant at 320px walks 0 → End; answers persist; resume is DB-backed', async ({ page, browser }) => {
    const ev = events[0]!;
    const u = await registrant('P1336 Walker', ev);
    // One cmp7 point already answered → on this first visit the step still lists the rest.
    const cmp7 = await tagPointIds('cmp7');
    await supabaseAdmin.from('point_positions').insert({ point_id: cmp7[0], user_id: u.user.id, position: 'agree' });

    await page.setViewportSize({ width: 320, height: 640 });
    await setTestSession(page, u.email);
    await page.goto(`/events/${ev.slug}/confirm`);
    await expect(page.getByTestId('prep-question')).toHaveAttribute('data-ready', 'true');
    const minutesText = await page.getByTestId('prep-question').textContent();
    const minutes = Number(minutesText!.match(/(\d+) minutes/)![1]);
    await page.getByRole('button', { name: 'Prepare now' }).click();

    // Plan: 6 steps, rows sum to the promised minutes.
    await expect(page.getByRole('heading', { name: 'Your preparation' })).toBeVisible();
    await expect(page.getByTestId('plan-summary')).toContainText('6 steps');
    const rows = await page.getByTestId('agenda').locator('li span.tabular-nums').allTextContents();
    expect(rows).toHaveLength(6);
    expect(rows.reduce((s, r) => s + Number(r.replace(' min', '')), 0)).toBe(minutes);
    await expect(page.getByTestId('agenda-step-5')).toContainText('Set your positions on 6 points about “AI and Your Ikigai”');
    // Immersive while in progress: no app menu.
    await expect(page.getByRole('button', { name: 'Tools' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Start now' }).click();

    // Step 1
    await expect(page.getByTestId('step-header')).toContainText('Step 1 of 6');
    await expect(page.getByRole('heading', { name: 'How this event is different' })).toBeVisible();
    await expect(page.getByTestId('welcome-intro')).toHaveText('In our events, we reward revealing gaps in cognitive understanding.');
    await page.getByRole('button', { name: 'Read the transcript' }).click();
    await expect(page.getByRole('button', { name: 'Hide the transcript' })).toBeVisible();
    await continueWithoutVideo(page);

    // Step 2 — then reload: resume lands on the same step (DB-backed, not localStorage).
    await expect(page.getByTestId('step-header')).toContainText('Step 2 of 6');
    await expect(page.getByRole('heading', { name: 'What is cognitive understanding?' })).toBeVisible();
    await expect.poll(async () => (await prepRow(ev.id, u.user.id))?.current_step).toBe('story');

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await setTestSession(otherPage, u.email);
    await otherPage.goto(`/events/${ev.slug}/confirm`);
    await expect(otherPage.getByTestId('prep-progress')).toHaveText('1 of 6 steps done');
    await expect(otherPage.getByTestId('prep-status')).toHaveText('1 of 6 steps');
    await otherPage.getByRole('button', { name: 'Continue your preparation' }).click();
    await expect(otherPage.getByRole('heading', { name: 'What is cognitive understanding?' })).toBeVisible();
    await other.close();

    await continueWithoutVideo(page);

    // Step 3a → 3b → 3c → 3d
    await expect(page.getByRole('heading', { name: 'Introducing the Clarity Meeting Principle' })).toBeVisible();
    await continueWithoutVideo(page);
    await expect(page.getByTestId('principle-decision-question')).toHaveText('Do you want to follow this principle with the attendees at the event?');
    await page.getByRole('button', { name: 'Opt in' }).click();
    await expect(page.getByTestId('try-it-now')).toContainText("Thank you for opting in. You promised that anybody at the event can ask you a specific question, right? Let's try it now, to show how it works.");
    await expect(page.getByTestId('host-caption')).toContainText('P1336 E2E Host');
    await page.getByRole('button', { name: 'Try it now' }).click();
    await expect(page.getByTestId('rating-context')).toHaveText('Thanks for trying it. Here is the question:');
    await expect(page.getByText("How much do you think you understand P1336's intended meaning behind this principle?")).toBeVisible();
    await page.getByRole('button', { name: 'Rate 7' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    // Step 4 (cmp7): first visit shows the 6 unanswered cards; skip.
    await expect(page.getByRole('heading', { name: 'What is your value perception of the Clarity Meeting Principle?' })).toBeVisible();
    await expect(page.getByTestId('answered-count')).toContainText('0 of 6 answered');
    await page.getByRole('button', { name: 'Skip and proceed' }).click();

    // Step 5 — Back within the session shows the same cmp7 cards, then forward again.
    await expect(page.getByRole('heading', { name: /Set your positions on 6 points about “AI and Your Ikigai”/ })).toBeVisible();
    await page.getByTestId('header-back').click();
    await expect(page.getByRole('heading', { name: 'What is your value perception of the Clarity Meeting Principle?' })).toBeVisible();
    await expect(page.getByTestId('answered-count')).toContainText('0 of 6 answered');
    await page.getByRole('button', { name: 'Skip and proceed' }).click();
    await expect(page.getByRole('heading', { name: /Set your positions on 6 points/ })).toBeVisible();
    await page.getByRole('button', { name: 'Skip and proceed' }).click();

    // Step 6a → 6b
    await expect(page.getByRole('heading', { name: /Are you open to be one of six volunteers/ })).toBeVisible();
    await expect(page.getByTestId('places-left')).toHaveText('6 of 6 volunteer places left');
    await page.getByTestId('learn-more').click();
    await expect(page.getByTestId('research-dialog')).toContainText('Clarity Pledge, as a research programme, reads the conversation transcripts');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Yes, sure' }).click();
    await expect(page.getByRole('heading', { name: 'Does your phone have a USB-C port?' })).toBeVisible();
    await expect(page.getByTestId('mic-why')).toContainText('louder than the people around you');
    await page.getByRole('button', { name: 'Yes, USB-C' }).click();

    // End
    await expect(page.getByRole('heading', { name: 'Thank you for preparing' })).toBeVisible();
    // UAT 2026-10-01: the title says it — no status badge on the end screen; the app menus return.
    await expect(page.getByTestId('end-card')).toBeVisible();
    await expect(page.getByTestId('prep-status')).toHaveCount(0);
    await expect(page).toHaveURL(/[?&]done=1/);
    await expect(page.getByRole('button', { name: 'Back to the event' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tools' })).toBeVisible(); // the app menu is back
    // Experts read as people ("Simon Sinek"), not account names ("Agent · Simon Sinek").
    await expect(page.getByTestId('end-stories')).toContainText('Our AI agents predicted how');
    await expect(page.getByTestId('end-stories')).not.toContainText('Agent ·');
    await expect(page.getByRole('button', { name: 'Read their stories' })).toBeVisible();
    await expect(page.getByTestId('volunteer-note')).toHaveText("You're a recording volunteer. We'll bring a USB-C mic for you.");

    await expect.poll(async () => (await prepRow(ev.id, u.user.id))?.completed_at).not.toBeNull();
    const row = await prepRow(ev.id, u.user.id);
    expect(row).toMatchObject({
      opted_in: true, principle_rating: 7, research_state: 'confirmed', mic_setup: 'usbc',
      research_policy_version: 'p1336-research-v1', prep_choice: 'now',
    });
    expect(row!.research_consented_at).not.toBeNull();
    const { data: parts } = await supabaseAdmin.from('person_prep_parts').select('part, completed_at, skipped_at').eq('profile_id', u.user.id);
    // Every video was skipped and cmp7 was skipped → none of them is completed.
    expect((parts ?? []).filter((p) => p.completed_at)).toHaveLength(0);
    expect((parts ?? []).filter((p) => p.skipped_at).map((p) => p.part).sort()).toEqual(['cmp7', 'cognitive_video', 'intro_video', 'principle_intro']);

    // Screen 0 now reads Prepared ✓, no prep block.
    await page.goto(`/events/${ev.slug}/confirm`);
    await expect(page.getByTestId('prep-status')).toHaveText('Prepared ✓');
    await expect(page.getByTestId('prep-block')).toHaveCount(0);
  });

  test('opted out → "No, continue" stores no 0-10', async ({ page }) => {
    const ev = events[0]!;
    const u = await registrant('P1336 Opt-out', ev);
    await seedAllPartsDone(u.user.id);
    await setTestSession(page, u.email);
    await page.goto(`/events/${ev.slug}/prepare`);
    await page.getByRole('button', { name: 'Start now' }).click();
    await page.getByRole('button', { name: 'Opt out' }).click();
    await expect(page.getByTestId('opt-out-ask')).toContainText("Thank you. It's completely okay to opt out.");
    await page.getByRole('button', { name: 'No, continue' }).click();
    await expect(page.getByRole('heading', { name: /Set your positions/ })).toBeVisible();
    await expect.poll(async () => (await prepRow(ev.id, u.user.id))?.current_step).toBe('stake');
    expect(await prepRow(ev.id, u.user.id)).toMatchObject({ opted_in: false, principle_rating: null });
  });

  test('returning person: plan is decision + positions + research; header "Step k of 3"; answered cards hidden', async ({ page }) => {
    const ev = await prepEvent(host);
    events.push(ev);
    const u = await registrant('P1336 Returning', ev);
    await seedAllPartsDone(u.user.id);
    const ikigai = await tagPointIds('ikigai1');
    await supabaseAdmin.from('point_positions').insert(ikigai.slice(0, 2).map((id) => ({ point_id: id, user_id: u.user.id, position: 'agree' })));

    await setTestSession(page, u.email);
    await page.goto(`/events/${ev.slug}/prepare`);
    await expect(page.getByRole('heading', { name: 'Your preparation' })).toBeVisible();
    await expect(page.getByTestId('plan-summary')).toContainText('3 steps');
    await expect(page.getByTestId('agenda')).toContainText('Decide about your participation in a new social norm');
    await expect(page.getByTestId('agenda')).not.toContainText('See how this event is different');
    await page.getByRole('button', { name: 'Start now' }).click();
    await expect(page.getByTestId('step-header')).toContainText('Step 1 of 3');
    // No 3a intro screen: straight to the decision.
    await expect(page.getByTestId('principle-decision-question')).toBeVisible();
    await page.getByRole('button', { name: 'Opt in' }).click();
    await page.getByRole('button', { name: 'Try it now' }).click();
    await page.getByRole('button', { name: 'Rate 9' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByTestId('step-header')).toContainText('Step 2 of 3');
    await expect(page.getByTestId('answered-count')).toContainText('0 of 4 answered');
  });

  test('event without a statement tag: no positions step', async ({ page }) => {
    const ev = await prepEvent(host, { tag: null });
    events.push(ev);
    const u = await registrant('P1336 No tag', ev);
    await setTestSession(page, u.email);
    await page.goto(`/events/${ev.slug}/prepare`);
    await expect(page.getByRole('heading', { name: 'Your preparation' })).toBeVisible();
    await expect(page.getByTestId('plan-summary')).toContainText('5 steps');
    await expect(page.getByTestId('agenda')).not.toContainText('Set your positions');
  });

  test('room gate: Prepare now / Join without preparing (no dialog); banner keeps prep reachable', async ({ page }) => {
    const ev = events[1]!;
    const u = await registrant('P1336 Room', ev);
    await setTestSession(page, u.email);
    await page.goto(`/events/${ev.slug}/room`);
    await expect(page.getByTestId('prep-room-gate')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Prepare now' })).toBeVisible();
    await expect(page.getByTestId('prep-room-skip-consequence')).toHaveText(
      "You'll miss the shared definitions and the meeting principle. You can catch up any time.",
    );
    await page.getByRole('button', { name: 'Join the room without preparing' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/events/${ev.slug}/(ready|meet)`));
    await expect(page.getByTestId('prep-room-banner-cta')).toHaveText('Start your preparation');
    await page.getByTestId('prep-room-banner-cta').click();
    await expect(page).toHaveURL(new RegExp(`/events/${ev.slug}/prepare\\?from=room`));
  });

  test('prep opened from the room ends on "Join the room"', async ({ page }) => {
    const ev = events[1]!;
    const u = await registrant('P1336 Room End', ev);
    await seedAllPartsDone(u.user.id);
    await setTestSession(page, u.email);
    await page.goto(`/events/${ev.slug}/prepare?from=room`);
    await page.getByRole('button', { name: 'Start now' }).click();
    await page.getByRole('button', { name: 'Opt out' }).click();
    await page.getByRole('button', { name: 'No, continue' }).click();
    await page.getByRole('button', { name: 'Skip and proceed' }).click();
    await page.getByRole('button', { name: 'No, thanks' }).click();
    await expect(page.getByTestId('end-join-room')).toBeVisible();
    await page.getByRole('button', { name: 'Join the room' }).click();
    // Prepared → the gate does not stop them.
    await expect(page).toHaveURL(new RegExp(`/events/${ev.slug}/(ready|meet)`));
    // UAT 2026-10-01: in the room, "prepared" is the roster row's check mark, not a line under Back.
    await page.goto(`/events/${ev.slug}/meet`);
    await expect(page.getByTestId('room-roster-prepared').first()).toBeVisible();
    await expect(page.getByTestId('prep-room-banner')).toHaveCount(0);
    // A tap (not a long-press) explains the check.
    await page.getByTestId('room-roster-prepared').first().click();
    await expect(page.getByTestId('room-roster-prepared-note')).toHaveText('Prepared for the event');
  });

  test('plan: the back arrow leaves the preparation (opened directly → the event page)', async ({ page }) => {
    const ev = events[0]!;
    const u = await registrant('P1336 Plan Back', ev);
    await setTestSession(page, u.email);
    await page.goto(`/events/${ev.slug}/prepare`);
    await expect(page.getByTestId('agenda')).toBeVisible();
    await expect(page.getByTestId('step-name')).toHaveText('Preparation');
    await page.getByTestId('header-back').click();
    await expect(page).toHaveURL(new RegExp(`/events/${ev.slug}$`));
  });

  test('preparation off: the old confirmation, no prep block, no room gate', async ({ page }) => {
    const ev = await prepEvent(host, { enabled: false });
    events.push(ev);
    const u = await registrant('P1336 Off', ev);
    await setTestSession(page, u.email);
    await page.goto(`/events/${ev.slug}/confirm`);
    await expect(page.getByRole('heading', { name: "You're Registered!" })).toBeVisible();
    await expect(page.getByRole('button', { name: /View Event Details/ })).toBeVisible();
    await expect(page.getByTestId('prep-block')).toHaveCount(0);
    await page.goto(`/events/${ev.slug}/room`);
    await expect(page).toHaveURL(new RegExp(`/events/${ev.slug}/(ready|meet)`));
    await expect(page.getByTestId('prep-room-gate')).toHaveCount(0);
  });

  test('create form: Preparation defaults by series (Clarity Night on, hike off); host can override', async ({ page }) => {
    await setTestSession(page, host.email);
    await page.goto('/events/new');
    const box = page.getByTestId('prep-enabled');
    await page.locator('#title').fill('Clarity Night #7: Something');
    await expect(box).toHaveAttribute('data-state', 'checked');
    await expect(page.getByTestId('prep-statement-tag')).toBeVisible();
    await page.locator('#title').fill('Sunday hike to the waterfall');
    await expect(box).toHaveAttribute('data-state', 'unchecked');
    await box.click();
    await page.locator('#title').fill('Sunday hike, longer route');
    await expect(box).toHaveAttribute('data-state', 'checked'); // touched: no longer follows the title
  });

  test('host list: per-person prep state, opt-in + score, volunteer; host excluded', async ({ page }) => {
    const ev = events[0]!;
    await setTestSession(page, host.email);
    await page.goto(`/events/${ev.slug}`);
    const list = page.getByTestId('prep-host-list');
    await expect(list).toBeVisible();
    await expect(page.getByTestId('prep-host-summary')).toContainText('1 volunteer · 1 USB-C mic needed');
    await expect(list).toContainText('P1336 Walker');
    await expect(list).toContainText('Opted in · understood at 7/10');
    await expect(list).toContainText('Volunteer · USB-C mic to bring');
    await expect(list).toContainText('Chose remind');
    await expect(list).not.toContainText('P1336 E2E Host');
  });
});
