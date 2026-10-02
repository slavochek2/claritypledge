/**
 * @file p1380-live-send.spec.ts
 * @description P1380 LIVE check on the TEST project: real emails through Mailgun.
 * Opt-in only (sends real mail): P1380_LIVE=1 CRON_SECRET=… npx playwright test --project=integration e2e/integration/p1380-live-send.spec.ts
 *
 *   - registering (send-event-emails, real user JWT) → a confirmation with a Prepare now ticket
 *   - the cron job (dispatch-event-emails, x-cron-secret) → the starting-soon email for an event
 *     30 min out, scheduled at start−15, with a real Mailgun id; and the prep-aware 24h reminder
 *   - every send is in email_send_log with status 'sent'
 * This is the evidence the code review's HIGH (starting-soon skipped when no reminder is due)
 * is fixed: the starting-soon event below has NO reminder or feedback due.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const LIVE = process.env.P1380_LIVE === '1';
const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const MAILGUN_ID = /^<.+@.+>$|^SENT_NO_ID$/;

test.describe('P1380 live send (test project)', () => {
  test.skip(!LIVE, 'opt-in: sends real email');
  test.describe.configure({ mode: 'serial', timeout: 120_000 });
  let host: TestUser;
  let anna: TestUser;
  const eventIds: string[] = [];

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1380 Live Host' });
    anna = await createTestUser({ name: 'P1380 Live Anna' });
  });
  test.afterAll(async () => {
    // email_send_log rows reference the profile; remove them before the users.
    for (const u of [host, anna]) if (u?.user?.id) await supabaseAdmin.from('email_send_log').delete().eq('profile_id', u.user.id);
    for (const id of eventIds) await supabaseAdmin.from('events').delete().eq('id', id);
    for (const u of [host, anna]) if (u?.user?.id) await deleteTestUser(u.user.id);
  });

  async function newEvent(minutesAhead: number, title: string): Promise<string> {
    const { data, error } = await supabaseAdmin.from('events').insert({
      slug: `p1380-live-${Date.now()}-${minutesAhead}`,
      title,
      description: 'P1380 live send test',
      datetime: new Date(Date.now() + minutesAhead * 60_000).toISOString(),
      duration_minutes: 120,
      timezone: 'Asia/Bangkok',
      location: 'Zuzalu library, 4Seas Nimman, Chiang Mai',
      host_id: host.user.id,
      status: 'upcoming',
      preparation_enabled: true,
    }).select('id').single();
    expect(error).toBeNull();
    eventIds.push(data!.id);
    return data!.id;
  }

  test('register → confirmation sent with a Prepare now ticket', async () => {
    const eventId = await newEvent(30, 'P1380 live: starting soon');
    const { error: rErr } = await supabaseAdmin.from('event_rsvps').insert({ event_id: eventId, profile_id: anna.user.id });
    expect(rErr).toBeNull();
    const { data: s } = await supabaseAdmin.auth.signInWithPassword({ email: anna.email, password: TEST_PASSWORD });
    const res = await fetch(`${URL_}/functions/v1/send-event-emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s!.session!.access_token}`, apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rsvp', eventId }),
    });
    await supabaseAdmin.auth.signOut();
    expect(res.status, await res.text()).toBe(200);

    const { data: log } = await supabaseAdmin.from('email_send_log').select('email_type, status, mailgun_message_id').eq('event_id', eventId);
    const conf = log!.find((l) => l.email_type === 'confirmation');
    expect(conf?.status).toBe('sent');
    expect(conf?.mailgun_message_id).toMatch(MAILGUN_ID);
    const { data: rsvp } = await supabaseAdmin.from('event_rsvps').select('id').eq('event_id', eventId).eq('profile_id', anna.user.id).single();
    const { data: tickets } = await supabaseAdmin.from('event_email_links').select('purpose').eq('rsvp_id', rsvp!.id);
    expect(tickets!.map((t) => t.purpose)).toContain('prepare');
    // Registered 30 min before start: the starting-soon email went at once, too.
    const soon = log!.find((l) => l.email_type === 'starting_soon');
    expect(soon?.status).toBe('sent');
    console.log('LIVE confirmation:', conf?.mailgun_message_id, 'starting_soon (late RSVP):', soon?.mailgun_message_id);
  });

  test('cron job → starting-soon for an event 30 min out, with no reminder due; prep reminder for tomorrow', async () => {
    const soonId = await newEvent(35, 'P1380 live: cron starting soon');
    // Starts 24h10m from now, so its reminder (start − 24h) is 10 min ahead: due on this tick.
    const tomorrowMin = 24 * 60 + 10;
    const tomorrowId = await newEvent(tomorrowMin, 'P1380 live: tomorrow');
    const reminderAt = new Date(Date.now() + tomorrowMin * 60_000 - 24 * 3600e3).toISOString();
    await supabaseAdmin.from('event_rsvps').insert([
      { event_id: soonId, profile_id: anna.user.id },
      { event_id: tomorrowId, profile_id: anna.user.id, reminder_scheduled_at: reminderAt },
    ]);

    const res = await fetch(`${URL_}/functions/v1/dispatch-event-emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'x-cron-secret': process.env.CRON_SECRET!, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = await res.text();
    expect(res.status, body).toBe(200);
    console.log('LIVE dispatch:', body);

    const { data: soonRow } = await supabaseAdmin.from('event_rsvps').select('mailgun_message_ids').eq('event_id', soonId).single();
    expect((soonRow!.mailgun_message_ids as Record<string, string>).starting_soon).toMatch(MAILGUN_ID);
    const { data: soonLog } = await supabaseAdmin.from('email_send_log').select('status').eq('event_id', soonId).eq('email_type', 'starting_soon');
    expect(soonLog!.map((l) => l.status)).toEqual(['sent']);

    const { data: remLog } = await supabaseAdmin.from('email_send_log').select('status, mailgun_message_id').eq('event_id', tomorrowId).eq('email_type', 'reminder');
    expect(remLog!.map((l) => l.status)).toEqual(['sent']);
    console.log('LIVE starting_soon (cron):', (soonRow!.mailgun_message_ids as Record<string, string>).starting_soon, 'reminder:', remLog![0].mailgun_message_id);

    // A second tick sends nothing more (atomic claim).
    await fetch(`${URL_}/functions/v1/dispatch-event-emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'x-cron-secret': process.env.CRON_SECRET!, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const { data: again } = await supabaseAdmin.from('email_send_log').select('id').eq('event_id', soonId).eq('email_type', 'starting_soon');
    expect(again!.length).toBe(1);
  });
});
