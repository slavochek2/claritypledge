/**
 * @file p1321-event-rsvps-columns.spec.ts
 * @description P1321 re-audit finding R1: event_rsvps is readable by everyone (the attendee list
 * on a public event page is the product), but the table also carries email-dispatch bookkeeping —
 * provider message ids and send-scheduling timestamps — that no public or signed-in reader needs.
 * Column grants keep the four columns the app renders and withhold the rest.
 *
 * Asserted by MESSAGE, not by "an error occurred": withholding a column makes PostgREST refuse the
 * request with "permission denied". The granted-columns half runs first, so the refusal can never
 * pass because nothing at all is readable (a leak assertion passes most emphatically when the
 * table is dark — docs/audits/p1207-phase1-findings.md).
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const GRANTED = 'id,event_id,profile_id,rsvped_at';
const WITHHELD = [
  'mailgun_message_ids',
  'reminder_scheduled_at',
  'feedback_scheduled_at',
  'reminder_attempted_at',
  'feedback_attempted_at',
  'starting_soon_attempted_at',
];

function anonClient() {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signedInClient() {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({
    email: process.env.TEST_LISTENER_EMAIL!,
    password: process.env.TEST_LISTENER_PASSWORD!,
  });
  expect(error, `sign-in failed: ${error?.message}`).toBeNull();
  return client;
}

for (const role of ['anon', 'authenticated'] as const) {
  test.describe(`P1321 R1: event_rsvps columns as ${role}`, () => {
    test('the attendee-list columns stay readable, and rows are returned', async () => {
      const client = role === 'anon' ? anonClient() : await signedInClient();
      const { data, error } = await client.from('event_rsvps').select(GRANTED).limit(5);
      expect(error, `granted columns must stay readable: ${error?.message}`).toBeNull();
      expect((data ?? []).length, 'control: the table has rows to read').toBeGreaterThan(0);

      const head = await client.from('event_rsvps').select('id', { count: 'exact', head: true });
      expect(head.error, `attendee count must still work: ${head.error?.message}`).toBeNull();
      expect(head.count ?? 0).toBeGreaterThan(0);
    });

    for (const col of WITHHELD) {
      test(`${col} is withheld`, async () => {
        const client = role === 'anon' ? anonClient() : await signedInClient();
        const { error } = await client.from('event_rsvps').select(`id,${col}`).limit(1);
        expect(error?.message ?? '(no error — the column is readable)')
          .toMatch(/permission denied/i);
      });
    }
  });
}
