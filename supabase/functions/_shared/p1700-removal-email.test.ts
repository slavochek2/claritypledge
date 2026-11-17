// Deno test: run with `deno test --config supabase/functions/deno.json --allow-env supabase/functions/_shared/p1700-removal-email.test.ts`
// P1700: the removal email's copy (features/p1700_removed_attendee_notice.md, UI Contract).
import { assert, assertEquals, assertFalse, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { type EventRow } from './email-helpers.ts';
import { buildRemoval } from './removal-email.ts';

const event: EventRow = {
  id: 'e1',
  title: 'Sales Mastermind <test>',
  datetime: '2026-11-20T11:30:00Z',
  duration_minutes: 120,
  timezone: 'Asia/Bangkok',
  location: 'Somewhere',
  description: null,
  slug: 'sales-mastermind',
  host_id: 'h',
};

Deno.test('subject names the event', () => {
  assertEquals(buildRemoval(event, 'Ann Lee').subject, 'Your registration for Sales Mastermind <test> was cancelled');
});

Deno.test('greets by first name in both parts, and says the registration was removed', () => {
  const { html, text } = buildRemoval(event, 'Ann Lee');
  assertStringIncludes(text, 'Hi Ann,');
  assertStringIncludes(html, 'Hi Ann,');
  assertStringIncludes(text, 'has cancelled your registration, so you are no longer on the guest list.');
  assertStringIncludes(text, '— Clarity Pledge');
});

Deno.test('no name: the shared greeting ("Hi,") in both parts', () => {
  const { html, text } = buildRemoval(event, null);
  assert(text.startsWith('Hi,'));
  assertStringIncludes(html, 'Hi,');
});

Deno.test('the event title is escaped in the HTML', () => {
  const { html } = buildRemoval(event, 'Ann');
  assertStringIncludes(html, 'Sales Mastermind &lt;test&gt;');
  assertFalse(html.includes('Mastermind <test>'));
});

Deno.test('never promises a reply reaches the host (the events mailbox sets no Reply-To)', () => {
  const { html, text } = buildRemoval(event, 'Ann');
  assertFalse(/reply/i.test(text));
  assertFalse(/reply/i.test(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').match(/has cancelled your registration[^.]*\./)?.[0] ?? ''));
});
