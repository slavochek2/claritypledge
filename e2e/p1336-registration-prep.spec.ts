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

/** P1386: a returning person (all videos done, no positions) walked to the mic question. */
async function toMicQuestion(page: Page, ev: TestEvent, u: TestUser) {
  await seedAllPartsDone(u.user.id);
  await setTestSession(page, u.email);
  await page.goto(`/events/${ev.slug}/prepare`);
  await page.getByRole('button', { name: 'Start now' }).click();
  await page.getByRole('button', { name: 'Opt out' }).click();
  await page.getByRole('button', { name: 'No, continue' }).click();
  await page.getByRole('button', { name: 'Skip and proceed' }).click();
  await expect(page.getByRole('heading', { name: /Are you open to be one of six volunteers/ })).toBeVisible();
}

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
    // P1387 (founder, 2026-10-02): one subtitle under the question, not four sentences.
    await expect(page.getByTestId('prep-why')).toHaveText('Our events have a special structure. A short preparation makes the discussions more meaningful.');
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
    // P1387 (founder, 2026-10-02): who asks and the question sit in the drawer, next to 0-10 — a small
    // avatar + "{host} · Your event host", and the question in the host's own voice.
    await expect(page.getByTestId('rating-host')).toContainText('P1336 E2E Host · Your event host');
    await expect(page.getByText('How much do you think you understand my intended meaning behind this principle?')).toBeVisible();
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
    await expect(page.getByRole('heading', { name: 'Do you have a microphone to bring?' })).toBeVisible();
    await expect(page.getByTestId('mic-why')).toContainText('louder than the people around you');
    await page.getByRole('button', { name: 'No, I need one' }).click();
    await expect(page.getByRole('heading', { name: 'What does your phone plug into?' })).toBeVisible();
    await page.getByRole('button', { name: /^USB-C/ }).click();

    // End
    await expect(page.getByRole('heading', { name: 'Thank you for preparing' })).toBeVisible();
    // UAT 2026-10-01: the title says it — no status badge on the end screen. P1387 (2026-10-02):
    // the app menus stay hidden here; the pinned Back to the event is the way on.
    await expect(page.getByTestId('end-card')).toBeVisible();
    await expect(page.getByTestId('prep-status')).toHaveCount(0);
    await expect(page).toHaveURL(/[?&]done=1/);
    await expect(page.getByRole('button', { name: 'Back to the event' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tools' })).toHaveCount(0); // no app menu on the last step
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
    // In the room, "prepared" is not a line under Back; and since P1386 no one sees prepared marks
    // in the room — this registrant prepared and sees none.
    await page.goto(`/events/${ev.slug}/meet`);
    await expect(page.getByTestId('room-roster-item').first()).toBeVisible();
    await expect(page.getByTestId('prep-room-banner')).toHaveCount(0);
    await expect(page.getByTestId('prep-mark-prepared')).toHaveCount(0);
    // P1386: the room is projected, so even the host sees no marks there; they live on the event page.
    await setTestSession(page, host.email);
    await page.goto(`/events/${ev.slug}/meet`);
    await expect(page.getByTestId('room-roster-item').first()).toBeVisible();
    await expect(page.getByTestId('prep-marks')).toHaveCount(0);
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

  test('P1386 mic question: own mic → one question, saved own + confirmed, end note', async ({ page }) => {
    const ev = await prepEvent(host);
    events.push(ev);
    const u = await registrant('P1386 Own Mic', ev);
    await page.setViewportSize({ width: 320, height: 640 });
    await toMicQuestion(page, ev, u);
    await page.getByRole('button', { name: 'Yes, sure' }).click();
    await expect(page.getByRole('heading', { name: 'Do you have a microphone to bring?' })).toBeVisible();
    await page.getByRole('button', { name: "Yes, I'll bring my own" }).click();
    await expect(page.getByRole('heading', { name: 'Thank you for preparing' })).toBeVisible();
    await expect(page.getByTestId('volunteer-note')).toHaveText("You're a recording volunteer. Please bring your own microphone.");
    expect(await prepRow(ev.id, u.user.id)).toMatchObject({ mic_setup: 'own', research_state: 'confirmed' });
  });

  test('P1386 mic question: Lightning is eligible (no recording place), Back goes Q2 → Q1 → opt-in, answer can change', async ({ page, browser }) => {
    const ev = await prepEvent(host);
    events.push(ev);
    const u = await registrant('P1386 Lightning', ev);
    await page.setViewportSize({ width: 320, height: 640 });
    await toMicQuestion(page, ev, u);
    await expect(page.getByTestId('places-left')).toHaveText('6 of 6 volunteer places left');
    await page.getByRole('button', { name: 'Yes, sure' }).click();
    await page.getByRole('button', { name: 'No, I need one' }).click();
    await expect(page.getByRole('button', { name: /^USB-C/ })).toContainText('iPhone 15 and newer');
    await expect(page.getByRole('button', { name: /^Lightning/ })).toContainText('iPhone 14 and older');
    await page.getByRole('button', { name: /^Lightning/ }).click();
    await expect(page.getByTestId('mic-no-lend-note')).toContainText("We don't have Lightning microphones yet");
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect.poll(async () => (await prepRow(ev.id, u.user.id))?.mic_setup).toBe('lightning');
    expect(await prepRow(ev.id, u.user.id)).toMatchObject({ research_state: 'eligible' });

    // Back: Q2 → Q1 → the opt-in screen. The Lightning person has taken no place.
    await page.getByTestId('header-back').click();
    await expect(page.getByRole('heading', { name: 'Do you have a microphone to bring?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'No, I need one' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('header-back').click();
    await expect(page.getByRole('heading', { name: /Are you open to be one of six volunteers/ })).toBeVisible();
    await expect(page.getByTestId('places-left')).toHaveText('6 of 6 volunteer places left');

    // Change the answer: now USB-C → confirmed, and that person DOES take a place.
    await page.getByRole('button', { name: 'Yes, sure' }).click();
    await page.getByRole('button', { name: 'No, I need one' }).click();
    await page.getByRole('button', { name: /^USB-C/ }).click();
    await expect(page.getByRole('heading', { name: 'Thank you for preparing' })).toBeVisible();
    await expect(page.getByTestId('volunteer-note')).toHaveText("You're a recording volunteer. We'll bring a USB-C mic for you.");
    expect(await prepRow(ev.id, u.user.id)).toMatchObject({ mic_setup: 'usbc', research_state: 'confirmed' });

    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    const v = await registrant('P1386 Observer', ev);
    await toMicQuestion(other, ev, v);
    await expect(other.getByTestId('places-left')).toHaveText('5 of 6 volunteer places left');
    await ctx.close();
  });

  test('P1386 mic question: Something else is eligible with its own note and end line', async ({ page }) => {
    const ev = await prepEvent(host);
    events.push(ev);
    const u = await registrant('P1386 Other Plug', ev);
    await toMicQuestion(page, ev, u);
    await page.getByRole('button', { name: 'Yes, sure' }).click();
    await page.getByRole('button', { name: 'No, I need one' }).click();
    await page.getByRole('button', { name: /^Something else/ }).click();
    await expect(page.getByTestId('mic-no-lend-note')).toContainText('We may not be able to lend you a microphone for that');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you for preparing' })).toBeVisible();
    await expect(page.getByTestId('volunteer-note')).toHaveText("You're a recording volunteer. We'll tell you if we can lend you a microphone.");
    expect(await prepRow(ev.id, u.user.id)).toMatchObject({ mic_setup: 'other', research_state: 'eligible' });
  });

  test('P1386 host marks by mic kind: C / L / ? letters, one grey mic for own, the packing line', async ({ page }) => {
    const ev = await prepEvent(host);
    events.push(ev);
    const done = new Date().toISOString();
    const consent = { research_consented_at: done, research_policy_version: 'p1336-research-v1' };
    const kinds: Array<[string, string, 'confirmed' | 'eligible']> = [
      ['Kind Usbc', 'usbc', 'confirmed'], ['Kind Lightning', 'lightning', 'eligible'],
      ['Kind Other', 'other', 'eligible'], ['Kind Own', 'own', 'confirmed'],
    ];
    for (const [name, mic, state] of kinds) {
      const u = await registrant(name, ev);
      const { error } = await supabaseAdmin.from('event_preparations').insert({ event_id: ev.id, profile_id: u.user.id, research_state: state, mic_setup: mic, ...consent });
      if (error) throw error;
    }
    await setTestSession(page, host.email);
    await page.goto(`/events/${ev.slug}`);
    await expect(page.getByTestId('prep-mic-line')).toHaveText('Bring 1 USB-C mic, 1 Lightning mic · 1 needs another kind of mic');
    await expect(page.getByTestId('prep-mark-mic-usbc')).toHaveCount(1);
    await expect(page.getByTestId('prep-mark-mic-lightning')).toHaveCount(1);
    await expect(page.getByTestId('prep-mark-mic-other')).toHaveCount(1);
    await expect(page.getByTestId('prep-mark-mic-own')).toHaveCount(1);
    await expect(page.getByTestId('prep-mark-letter')).toHaveCount(3);
    expect((await page.getByTestId('prep-mark-letter').allTextContents()).sort()).toEqual(['?', 'C', 'L']);
    await page.getByTestId('prep-mark-mic-lightning').click();
    await expect(page.getByTestId('prep-mark-note')).toHaveText('Needs a Lightning mic');
    // The room shows no marks, even to the host.
    await page.goto(`/events/${ev.slug}/meet`);
    await expect(page.getByTestId('prep-marks')).toHaveCount(0);
  });

  test('P1386 host marks: ✓ / 🎙 in Participants with hints, mic line, no Preparation card; non-host sees none', async ({ page }) => {
    const ev = events[0]!;
    await setTestSession(page, host.email);
    await page.goto(`/events/${ev.slug}`);
    await expect(page.getByTestId('prep-host-list')).toHaveCount(0);
    await expect(page.getByTestId('prep-mic-line')).toHaveText('Bring 1 USB-C mic');
    const mic = page.getByTestId('prep-mark-mic-usbc');
    await expect(mic).toHaveCount(1);
    await mic.click();
    await expect(page.getByTestId('prep-mark-note')).toHaveText('Needs a USB-C mic');

    const other = await registrant('P1386 Onlooker', ev);
    await setTestSession(page, other.email);
    await page.goto(`/events/${ev.slug}`);
    await expect(page.getByText('P1386 Onlooker').first()).toBeVisible();
    await expect(page.getByTestId('prep-marks')).toHaveCount(0);
    await expect(page.getByTestId('prep-mic-line')).toHaveCount(0);
  });
});
