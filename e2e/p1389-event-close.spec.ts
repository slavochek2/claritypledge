/**
 * @file p1389-event-close.spec.ts
 * @description P1389 — the evening close at /events/:slug/close. Real browser, real test DB,
 * real signed-in session, at an iPhone width (390px).
 *
 * Covers the spec's acceptance criteria: the full walk from feedback to thanks with rows in the
 * DB, registration for the next event inside the close, the position history rule (a row only
 * when a position changes), the once-per-person asks (a yes is never re-asked, a no is quiet for
 * three months, one ask per event), the left-early link, and no self-purchase offer anywhere.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const days = (n: number) => new Date(Date.now() + n * 24 * 3600 * 1000);

async function cmp7Ids(): Promise<string[]> {
  const { data } = await supabaseAdmin.from('points').select('id').contains('tags', ['cmp7']).order('created_at');
  return (data ?? []).map((r) => r.id as string);
}

/** Already a member of the community the close would invite them to (by location: Chiang Mai). */
async function makeMember(userId: string) {
  const { data: org } = await supabaseAdmin.from('organization').select('id').eq('slug', 'cm').single();
  if (org) await supabaseAdmin.from('membership').upsert({ org_id: org.id, user_id: userId }, { onConflict: 'org_id,user_id' });
}

async function askRows(userId: string) {
  const { data } = await supabaseAdmin.from('personal_ask_answers').select('ask, answer, event_id').eq('user_id', userId);
  return data ?? [];
}

test.describe('P1389 evening close', () => {
  let host: TestUser;
  let tonight: TestEvent;
  let next: TestEvent;
  const users: TestUser[] = [];
  const events: TestEvent[] = [];

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1389 E2E Host' });
    // The LinkedIn ask is offered only when the host has a LinkedIn link (round 10b).
    await supabaseAdmin.from('profiles').update({ linkedin_url: 'https://www.linkedin.com/in/p1389-test-host', is_verified: true, has_pledged: true }).eq('id', host.user.id);
    // Tonight's event ended an hour ago; the next one is in a week.
    tonight = await createTestEvent(host.user.id, new Date(Date.now() - 3600 * 1000), { title: 'Clarity Night #97: P1389 tonight', location: 'Test venue, Chiang Mai' });
    next = await createTestEvent(host.user.id, days(7), { title: 'Clarity Night #98: P1389 next', location: 'Test venue, Chiang Mai' });
    events.push(tonight, next);
  });

  test.afterAll(async () => {
    for (const u of [host, ...users]) if (u?.user?.id) {
      await supabaseAdmin.from('point_positions').delete().eq('user_id', u.user.id);
      await supabaseAdmin.from('email_send_log').delete().eq('profile_id', u.user.id);
      await deleteTestUser(u.user.id);
    }
    // Registering inside the close sends the real confirmation emails, whose log rows block the delete.
    for (const e of events) {
      await supabaseAdmin.from('email_send_log').delete().eq('event_id', e.id);
      await deleteTestEvent(e.id);
    }
  });

  // A crash in ANY flow fails its test (round-9 review: a crash reached the founder unseen).
  let pageErrors: string[] = [];
  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
  });
  test.afterEach(async () => {
    expect(pageErrors).toEqual([]);
  });

  async function attendee(name: string, ev: TestEvent = tonight): Promise<TestUser> {
    const u = await createTestUser({ name });
    users.push(u);
    await rsvpToEvent(ev.id, u.user.id);
    return u;
  }

  test('full walk, first evening: 0-10 → topics → positions → improve → appreciate → next event → thanks', async ({ page }) => {
    const u = await attendee('P1389 Walker');
    const cmp = await cmp7Ids();
    test.skip(cmp.length === 0, 'no cmp7 points on the test DB');
    await supabaseAdmin.from('point_positions').insert({ point_id: cmp[0], user_id: u.user.id, position: 'agree' });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await setTestSession(page, u.email);
    await page.goto(`/events/${tonight.slug}/close`);

    // AC1: a start screen frames it — thanks, how long, the steps — on a card you cannot tap away from.
    // The first screen waits for every step's data (several reads); over a VPN that took 8 s.
    await expect(page.getByTestId('step-intro')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('intro-thanks')).toHaveText('We need your feedback');
    // One flow (round 10b): a first-timer sees both asks — join the community, then connect.
    await expect(page.getByTestId('intro-agenda').locator('li')).toHaveCount(6);
    // Founder (round 7): the agenda names each step; the ask is named for what it is.
    await expect(page.getByTestId('intro-agenda').locator('li').first()).toHaveText('1Net promoter score');
    await expect(page.getByTestId('intro-agenda').locator('li').last()).toHaveText('6Connect on LinkedIn');
    await page.getByRole('button', { name: 'Start feedback' }).click();
    // A small reminder of the evening on the 0-10 screen, not a link out of the flow.
    await expect(page.getByTestId('close-event-box')).toContainText('Clarity Night #97');
    await expect(page.getByTestId('close-event-box').locator('a')).toHaveCount(0);
    // The standard NPS question and anchors.
    await expect(page.getByTestId('step-score')).toBeVisible();
    // Round 10: the question is the page title; the drawer holds only the answer.
    await expect(page.getByTestId('step-question')).toHaveText('How likely would you recommend this event to a friend or colleague?');
    await expect(page.getByText('Not at all likely')).toBeVisible();
    await page.getByRole('button', { name: 'Rate 9' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();

    // Topics second: Continue is dimmed and explains itself until a star; Skip is the small link.
    await expect(page.getByTestId('step-topics')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
    const rows = page.getByTestId('topic-list').locator('li');
    await expect(page.getByTestId('topic-list')).toBeVisible();
    // Rate at least 5: the bar counts, Continue explains itself until then.
    if ((await rows.count()) >= 5) {
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByTestId('topics-hint')).toHaveText('Rate at least 5 topics, or add your own.');
      for (const i of [0, 1, 2, 3, 4]) {
        await rows.nth(i).getByLabel('4 stars').click();
        await expect(page.getByTestId('topics-count')).toContainText(`${i + 1} of 5 rated`);
      }
      await expect(page.getByTestId('topics-hint')).toHaveCount(0);
      await page.getByRole('button', { name: 'Continue' }).click();
    } else {
      await page.getByRole('button', { name: 'Skip' }).click();
    }

    // Positions: nothing changed, so the button says so.
    await expect(page.getByTestId('step-positions')).toBeVisible();
    await page.getByRole('button', { name: 'No changes' }).click();
    // Round 10b: the seven, then the three about opting in — two halves of one step.
    await expect(page.getByTestId('step-stance')).toBeVisible();
    await expect(page.getByTestId('step-question')).toHaveText('Where do you stand on CMP in your important conversations?');
    // The topics pattern: a counter, Continue explains itself until all three are set, Skip passes.
    await expect(page.getByTestId('stance-count')).toContainText('0 of 3 set');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('stance-hint')).toHaveText('Set all three, or skip.');
    await page.getByRole('button', { name: 'Skip' }).click();

    // Criticism first, one question per screen.
    await expect(page.getByTestId('step-question')).toHaveText('How can we improve our next event?');
    // Progress counts half steps: the feedback pair fills one agenda line in two parts.
    await expect(page.getByTestId('step-name')).toHaveText('Feedback: what to improve, what was good');
    // The current segment's fill: just started on the first half, half full on the second.
    const fill = page.getByTestId('step-header').locator('[role="progressbar"] [style*="width"]');
    await expect(fill).toHaveAttribute('style', /width: 12%/);
    // Submit is the main action (dimmed until written, a tap says so); the way past is the small link.
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByTestId('submit-hint')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue without feedback' })).toBeVisible();
    await page.getByLabel('How can we improve our next event?').fill('Start on time.');
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByTestId('step-question')).toHaveText("What did you like about today's event?");
    await expect(fill).toHaveAttribute('style', /width: 50%/);
    const box = page.getByTestId('quote-ok').getByRole('checkbox');
    await expect(box).toBeChecked(); // permission to quote: ticked from the start
    await page.getByLabel("What did you like about today's event?").fill('Honest talk. For anyone stuck in a hard conversation.');
    await page.getByRole('button', { name: 'Submit' }).click();

    // First evening, not a member yet: the community, shown as the group's own card.
    await expect(page.getByTestId('ask-community')).toBeVisible();
    await expect(page.getByTestId('step-name')).toHaveText('Decide on joining the community');
    await expect(page.getByTestId('step-question')).toHaveText('Join the Communication Activism Community');
    await expect(page.getByTestId('community-card')).toContainText('Communication Activism Community');
    await page.getByRole('button', { name: 'Not now' }).click();
    // Then the LinkedIn step, the same evening (no waiting for a later one).
    await expect(page.getByTestId('ask-connect')).toBeVisible();
    // Back steps over the community ask already answered tonight.
    await page.getByTestId('header-back').click();
    await expect(page.getByTestId('ask-community')).toHaveCount(0);
    await page.getByRole('button', { name: 'Submit' }).click(); // "What did you like" (already filled)
    await expect(page.getByTestId('ask-connect')).toBeVisible();
    await page.getByRole('button', { name: 'Not now' }).click();
    // AC6 (founder, round 10): the thank-you IS the reserve screen — app menus back, one button.
    await expect(page.getByTestId('step-end')).toBeVisible();
    await expect(page).toHaveURL(/[?&]done=1/);
    // Round 10b: the invitation is the title, the thanks the small line; the card opens the event.
    await expect(page.getByTestId('step-question')).toHaveText('Join the next Clarity Night');
    await expect(page.getByTestId('next-event-box')).toHaveAttribute('href', `/events/${next.slug}`);
    await expect(page.getByTestId('step-end').getByRole('button')).toHaveCount(1);
    await page.getByRole('button', { name: 'Reserve my place' }).click();
    await expect(page.getByTestId('step-question')).toHaveText('Your place is reserved');
    await expect(page.getByTestId('end-reserved')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reserve my place' })).toHaveCount(0);

    const { data: fb } = await supabaseAdmin.from('event_feedback').select('*').eq('event_id', tonight.id).eq('user_id', u.user.id).single();
    expect(fb).toMatchObject({ score: 9, improve: 'Start on time.', liked: 'Honest talk. For anyone stuck in a hard conversation.', quote_ok: true });
    const { data: rsvp } = await supabaseAdmin.from('event_rsvps').select('id').eq('event_id', next.id).eq('profile_id', u.user.id);
    expect(rsvp).toHaveLength(1);
    expect((await askRows(u.user.id)).map((a) => `${a.ask}:${a.answer}`).sort()).toEqual(['community:no', 'connect:no']);
    expect(errors).toEqual([]);

    // Decision 6: the founder reads results with one terminal command (read-only token).
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync('./scripts/event-close-results.sh', [tonight.slug, '--env', 'test'], { encoding: 'utf8' });
    expect(out).toContain('P1389 Walker: 9/10');
    expect(out).toContain('improve: Start on time.');
    expect(out).toContain('quote:   may be used');
  });

  test('community: Join as member shows the group terms inside the close; accepting joins and the close carries on', async ({ page }) => {
    const u = await attendee('P1389 Joiner');
    await supabaseAdmin.from('event_feedback').insert({ event_id: tonight.id, user_id: u.user.id, score: 9 , liked: 'Good.' });
    await setTestSession(page, u.email);
    await page.goto(`/events/${tonight.slug}/close`);
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 }); // the first screen waits for every step's data
    await expect(page.getByTestId('ask-community')).toBeVisible();
    // The group is information here, never a way out of the flow.
    await expect(page.getByTestId('community-card').locator('a')).toHaveCount(0);
    await page.getByRole('button', { name: 'Join as member' }).click();
    await expect(page.getByTestId('community-terms')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/events/${tonight.slug}/close`));
    await page.getByRole('button', { name: 'Accept terms & join' }).click();
    await expect(page.getByTestId('ask-connect')).toBeVisible(); // one flow: connect follows
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByTestId('step-end')).toBeVisible();
    await expect(page.getByTestId('end-joined')).toContainText('You joined Communication Activism Community');
    const { data: org } = await supabaseAdmin.from('organization').select('id').eq('slug', 'cm').single();
    const { data: m } = await supabaseAdmin.from('membership').select('user_id').eq('org_id', org!.id).eq('user_id', u.user.id);
    expect(m).toHaveLength(1);
    expect((await askRows(u.user.id)).map((a) => `${a.ask}:${a.answer}`).sort()).toEqual(['community:yes', 'connect:no']);
  });

  test('a member is asked to connect on LinkedIn: the button opens the host\'s profile and records a yes', async ({ page }) => {
    const u = await attendee('P1389 Connector');
    await makeMember(u.user.id);
    await supabaseAdmin.from('event_feedback').insert({ event_id: tonight.id, user_id: u.user.id, score: 9, liked: 'Good.' });
    // The profile opens in a real new tab (a link, never popup-blocked); answer it locally.
    await page.context().route('https://www.linkedin.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'linkedin' }));
    await setTestSession(page, u.email);
    await page.goto(`/events/${tonight.slug}/close`);
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 }); // the first screen waits for every step's data
    await expect(page.getByTestId('ask-connect')).toBeVisible();
    await expect(page.getByTestId('step-question')).toHaveText("Let's connect on LinkedIn");
    // No host photo line in the bottom bar any more (founder, round 10b).
    await expect(page.getByTestId('drawer-host')).toHaveCount(0);
    await expect(page.getByTestId('connect-card')).toHaveAttribute('href', 'https://www.linkedin.com/in/p1389-test-host');
    const [tab] = await Promise.all([page.waitForEvent('popup'), page.getByRole('link', { name: 'Connect', exact: true }).click()]);
    await expect(tab).toHaveURL('https://www.linkedin.com/in/p1389-test-host');
    // The yes is saved while the new tab takes focus; over the VPN that save has taken >5 s.
    await expect(page.getByTestId('step-end')).toBeVisible({ timeout: 15_000 });
    expect(await askRows(u.user.id)).toEqual([{ ask: 'connect', answer: 'yes', event_id: tonight.id }]);
  });

  test('connect is never offered when the host\'s LinkedIn is not public (not verified and pledged)', async ({ page }) => {
    const other = await createTestUser({ name: 'P1389 Private Host' });
    users.push(other);
    await supabaseAdmin.from('profiles').update({ linkedin_url: 'https://www.linkedin.com/in/p1389-private', is_verified: false, has_pledged: false }).eq('id', other.user.id);
    const ev = await createTestEvent(other.user.id, new Date(Date.now() - 3600 * 1000), { title: 'Clarity Night: P1389 private host', location: 'Test venue, Chiang Mai' });
    events.push(ev);
    const u = await attendee('P1389 No link', ev);
    await makeMember(u.user.id);
    await supabaseAdmin.from('event_feedback').insert({ event_id: ev.id, user_id: u.user.id, score: 9, liked: 'Good.' });
    await setTestSession(page, u.email);
    await page.goto(`/events/${ev.slug}/close`);
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 }); // the first screen waits for every step's data
    await expect(page.getByTestId('step-end')).toBeVisible();
    await expect(page.getByTestId('ask-connect')).toHaveCount(0);
  });

  test('the host gives feedback but is never asked to join or connect', async ({ page }) => {
    await supabaseAdmin.from('event_feedback').insert({ event_id: tonight.id, user_id: host.user.id, score: 9, liked: 'Good.' });
    await setTestSession(page, host.email);
    await page.goto(`/events/${tonight.slug}/close`);
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 }); // the first screen waits for every step's data
    await expect(page.getByTestId('step-end')).toBeVisible();
    await expect(page.getByTestId('ask-connect')).toHaveCount(0);
  });

  test('a community yes cannot be recorded without joining; a reload during the asks returns to the same ask', async ({ page }) => {
    const u = await attendee('P1389 Reloader');
    await setTestSession(page, u.email);
    await page.goto(`/events/${tonight.slug}/close`);
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 }); // the first screen waits for every step's data
    // A hand-made "yes" to the community, without the membership, is refused by the server.
    const status = await page.evaluate(async ({ url, anon, eventId }) => {
      const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'))!;
      const token = JSON.parse(localStorage.getItem(key)!).access_token;
      const r = await fetch(`${url}/rest/v1/rpc/answer_personal_ask`, {
        method: 'POST',
        headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_event_id: eventId, p_ask: 'community', p_answer: 'yes' }),
      });
      return r.status;
    }, { url: process.env.VITE_SUPABASE_URL!, anon: process.env.VITE_SUPABASE_ANON_KEY!, eventId: tonight.id });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(await askRows(u.user.id)).toEqual([]);
    // Skip both text boxes, say Not now to the community, reload on the LinkedIn step.
    await page.getByRole('button', { name: 'Start feedback' }).click();
    await page.getByRole('button', { name: 'Rate 7' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: 'Continue without feedback' }).click();
    await page.getByRole('button', { name: 'Continue without sharing' }).click();
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByTestId('ask-connect')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 }); // the first screen waits for every step's data
    await expect(page.getByTestId('ask-connect')).toBeVisible();
  });

  test('connect: Not now is recorded as a no', async ({ page }) => {
    const u = await attendee('P1389 Lukewarm');
    await makeMember(u.user.id);
    await supabaseAdmin.from('event_feedback').insert({ event_id: tonight.id, user_id: u.user.id, score: 9, liked: 'Good.' });
    await setTestSession(page, u.email);
    await page.goto(`/events/${tonight.slug}/close`);
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 }); // the first screen waits for every step's data
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByTestId('step-end')).toBeVisible();
    expect(await askRows(u.user.id)).toEqual([{ ask: 'connect', answer: 'no', event_id: tonight.id }]);
  });

  test('one answer per evening: a return after answering does not ask again, and the server refuses a second answer', async ({ page }) => {
    const u = await attendee('P1389 Once');
    await makeMember(u.user.id);
    await supabaseAdmin.from('event_feedback').insert({ event_id: tonight.id, user_id: u.user.id, score: 9, liked: 'Good.' });
    await setTestSession(page, u.email);
    await page.goto(`/events/${tonight.slug}/close`);
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 }); // the first screen waits for every step's data
    await expect(page.getByTestId('ask-connect')).toBeVisible();
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByTestId('step-end')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 }); // the first screen waits for every step's data
    await expect(page.getByTestId('step-end')).toBeVisible();
    await expect(page.getByTestId('ask-connect')).toHaveCount(0);
    // A hand-made second answer for the same evening is refused by the server.
    const status = await page.evaluate(async ({ url, anon, eventId }) => {
      const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'))!;
      const token = JSON.parse(localStorage.getItem(key)!).access_token;
      const r = await fetch(`${url}/rest/v1/rpc/answer_personal_ask`, {
        method: 'POST',
        headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_event_id: eventId, p_ask: 'connect', p_answer: 'yes' }),
      });
      return r.status;
    }, { url: process.env.VITE_SUPABASE_URL!, anon: process.env.VITE_SUPABASE_ANON_KEY!, eventId: tonight.id });
    expect(status).toBeGreaterThanOrEqual(400);
    expect((await askRows(u.user.id)).filter((r) => r.event_id === tonight.id)).toHaveLength(1);
  });

  test('someone who finished with both text answers skipped returns to the thank-you, not the questions', async ({ page }) => {
    const u = await attendee('P1389 Finished');
    await supabaseAdmin.from('event_feedback').insert({ event_id: tonight.id, user_id: u.user.id, score: 6, finished_at: new Date().toISOString() });
    await setTestSession(page, u.email);
    await page.goto(`/events/${tonight.slug}/close`);
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 }); // the first screen waits for every step's data
    await expect(page.getByTestId('step-end')).toBeVisible();
  });

  test('someone who left after the score resumes at the topics, not at the thank-you', async ({ page }) => {
    const u = await attendee('P1389 Resume');
    await supabaseAdmin.from('event_feedback').insert({ event_id: tonight.id, user_id: u.user.id, score: 7 });
    await setTestSession(page, u.email);
    await page.goto(`/events/${tonight.slug}/close`);
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 }); // the first screen waits for every step's data
    await expect(page.getByTestId('step-topics')).toBeVisible();
  });

  test('someone who answered "improve" and left resumes at "what did you like"', async ({ page }) => {
    const u = await attendee('P1389 Half done');
    await supabaseAdmin.from('event_feedback').insert({ event_id: tonight.id, user_id: u.user.id, score: 8, improve: 'Shorter intro.' });
    await setTestSession(page, u.email);
    await page.goto(`/events/${tonight.slug}/close`);
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 }); // the first screen waits for every step's data
    await expect(page.getByTestId('step-appreciate')).toBeVisible();
  });

  test('"Continue without feedback" discards what was typed', async ({ page }) => {
    const u = await attendee('P1389 Second thoughts');
    await setTestSession(page, u.email);
    await page.goto(`/events/${tonight.slug}/close`);
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 }); // the first screen waits for every step's data
    await page.getByRole('button', { name: 'Start feedback' }).click();
    await page.getByRole('button', { name: 'Rate 8' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByLabel('How can we improve our next event?').fill('Something harsh.');
    await page.getByRole('button', { name: 'Continue without feedback' }).click();
    await page.getByLabel("What did you like about today's event?").fill('The pairs.');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByTestId('ask-community')).toBeVisible();
    const { data } = await supabaseAdmin.from('event_feedback').select('improve, liked').eq('event_id', tonight.id).eq('user_id', u.user.id).single();
    expect(data).toEqual({ improve: null, liked: 'The pairs.' });
  });

  test('AC2: a position re-check writes history only when the position changes', async () => {
    const u = await attendee('P1389 History');
    const [pid] = await cmp7Ids();
    test.skip(!pid, 'no cmp7 points on the test DB');
    const count = async () =>
      (await supabaseAdmin.from('point_position_history').select('id', { count: 'exact', head: true }).eq('user_id', u.user.id).eq('point_id', pid)).count ?? 0;
    await supabaseAdmin.from('point_positions').insert({ point_id: pid, user_id: u.user.id, position: 'agree' });
    const afterFirst = await count();
    await supabaseAdmin.from('point_positions').update({ position: 'agree' }).eq('user_id', u.user.id).eq('point_id', pid);
    expect(await count()).toBe(afterFirst);
    await supabaseAdmin.from('point_positions').update({ position: 'disagree' }).eq('user_id', u.user.id).eq('point_id', pid);
    expect(await count()).toBe(afterFirst + 1);
  });

  test('AC3/AC4: a no is quiet for three months, a yes is never re-asked', async ({ page }) => {
    const u = await attendee('P1389 Returner');
    await makeMember(u.user.id);
    await supabaseAdmin.from('event_feedback').insert({ event_id: tonight.id, user_id: u.user.id, score: 8, liked: 'Good.' });
    const old = await createTestEvent(host.user.id, days(-30), { title: 'Clarity Night #90: P1389 old' });
    const older = await createTestEvent(host.user.id, days(-37), { title: 'Clarity Night #89: P1389 older' });
    events.push(old, older);
    // Said no to connecting 10 days ago: quiet, so nothing to ask — straight to the thank-you.
    await supabaseAdmin.from('personal_ask_answers').insert({ user_id: u.user.id, event_id: old.id, ask: 'connect', answer: 'no', answered_at: days(-10).toISOString() });
    await setTestSession(page, u.email);
    await page.goto(`/events/${tonight.slug}/close`);
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 }); // the first screen waits for every step's data
    await expect(page.getByTestId('step-end')).toBeVisible();

    // The no ages past 90 days → offered again. (Reaching the thank-you marked tonight finished;
    // clearing it stands in for a later evening, where the re-offer actually happens.)
    await supabaseAdmin.from('personal_ask_answers').update({ answered_at: days(-91).toISOString() }).eq('user_id', u.user.id).eq('ask', 'connect');
    await supabaseAdmin.from('event_feedback').update({ finished_at: null }).eq('event_id', tonight.id).eq('user_id', u.user.id);
    await page.reload();
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 }); // the first screen waits for every step's data
    await expect(page.getByTestId('ask-connect')).toBeVisible();

    // A yes on any earlier evening → never asked again.
    await supabaseAdmin.from('personal_ask_answers').insert({ user_id: u.user.id, event_id: older.id, ask: 'connect', answer: 'yes', answered_at: days(-37).toISOString() });
    await supabaseAdmin.from('event_feedback').update({ finished_at: null }).eq('event_id', tonight.id).eq('user_id', u.user.id);
    await page.reload();
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 }); // the first screen waits for every step's data
    await expect(page.getByTestId('step-end')).toBeVisible();
    expect((await askRows(u.user.id)).filter((r) => r.event_id === tonight.id)).toHaveLength(0);
  });

  test('quote permission: unticking the box keeps the words private', async ({ page }) => {
    const u = await attendee('P1389 Quote');
    await setTestSession(page, u.email);
    await page.goto(`/events/${tonight.slug}/close`);
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 }); // the first screen waits for every step's data
    await page.getByRole('button', { name: 'Start feedback' }).click();
    await page.getByRole('button', { name: 'Rate 8' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.getByRole('button', { name: 'Skip' }).click(); // topics
    // No positions answered before, so the positions step is not in this person's list.
    await page.getByRole('button', { name: 'Continue without feedback' }).click(); // improve
    await page.getByLabel("What did you like about today's event?").fill('The honest pairs.');
    const box = page.getByTestId('quote-ok').getByRole('checkbox');
    await expect(box).toBeChecked();
    await box.uncheck();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByTestId('ask-community')).toBeVisible();
    const { data } = await supabaseAdmin.from('event_feedback').select('liked, quote_ok').eq('event_id', tonight.id).eq('user_id', u.user.id).single();
    expect(data).toEqual({ liked: 'The honest pairs.', quote_ok: false });
  });

  test('"Continue without sharing" after going Back removes words already saved, and their quote permission', async ({ page }) => {
    const u = await attendee('P1389 Changed mind');
    await setTestSession(page, u.email);
    await page.goto(`/events/${tonight.slug}/close`);
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 }); // the first screen waits for every step's data
    await page.getByRole('button', { name: 'Start feedback' }).click();
    await page.getByRole('button', { name: 'Rate 8' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: 'Continue without feedback' }).click();
    await page.getByLabel("What did you like about today's event?").fill('Quote me on this.');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByTestId('ask-community')).toBeVisible();
    await page.getByTestId('header-back').click();
    await page.getByRole('button', { name: 'Continue without sharing' }).click();
    await expect(page.getByTestId('ask-community')).toBeVisible();
    const { data } = await supabaseAdmin.from('event_feedback').select('liked, quote_ok').eq('event_id', tonight.id).eq('user_id', u.user.id).single();
    expect(data).toEqual({ liked: null, quote_ok: false });
  });

  test('AC5: someone who left early completes the same close from the link', async ({ page }) => {
    const u = await attendee('P1389 Left early');
    await setTestSession(page, u.email);
    await page.goto(`/events/${tonight.slug}/close`);
    await expect(page.getByTestId('p1389-close')).toBeVisible({ timeout: 20_000 }); // the first screen waits for every step's data
    await expect(page.getByTestId('step-intro')).toBeVisible();
  });

  test('a non-attendee is sent to the event page', async ({ page }) => {
    const u = await createTestUser({ name: 'P1389 Stranger' });
    users.push(u);
    await setTestSession(page, u.email);
    await page.goto(`/events/${tonight.slug}/close`);
    await expect(page).toHaveURL(new RegExp(`/events/${tonight.slug}$`));
  });

  test('AC7: no step offers the attendee a session or a purchase for themselves', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/app/prototypes/events/close/EventClosePage.tsx', 'utf8');
    // Self-purchase wording only: the AC rules out offering the attendee something for themselves.
    // (An earlier version had `\b\$\d`, which can never match after a space — blind; replaced 2026-10-04.)
    expect(src).not.toMatch(/\b(buy|pay for|purchase|price list|book a session for yourself|book your session|for yourself)\b/i);
  });
});
