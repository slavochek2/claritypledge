/**
 * @file p1194-event-group-chat.test.tsx
 * @description P1194 — the event group chat link is a button for registered
 * attendees and absent (not hidden) for everyone else.
 *
 * The RLS half follows the p1149-messages-rls convention: vitest here runs with a
 * stubbed Supabase URL and no live credentials, so the database gate is proven by
 * asserting the migration's policy SQL and by proving no client read path can
 * substitute a caller-side check for it.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyGroupChat, validateGroupChatUrl } from '@/app/prototypes/events/group-chat-utils';
import { GroupChatBlock } from '@/app/prototypes/events/components/GroupChatBlock';

const R = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const MIGRATION = R('supabase/migrations/20260831120000_p1193_event_private_info.sql');
const SERVICE = R('src/app/data/events-service-real.ts');
const DETAIL = R('src/app/prototypes/events/components/EventDetail.tsx');

const SELECT_POLICY = MIGRATION.slice(
  MIGRATION.indexOf('CREATE POLICY "Private info visible to host and registered attendees"'),
  MIGRATION.indexOf('CREATE POLICY "Hosts can create private info for their events"')
);

describe('classifyGroupChat', () => {
  it('names the app so an attendee knows what is about to open', () => {
    expect(classifyGroupChat('https://chat.whatsapp.com/LE3vZpemno4F9gh0FODt1m').label).toBe('Join WhatsApp group');
    expect(classifyGroupChat('https://t.me/+abc123').label).toBe('Join Telegram group');
    expect(classifyGroupChat('https://signal.group/#abc').label).toBe('Join Signal group');
    expect(classifyGroupChat('https://discord.gg/abc').label).toBe('Join Discord server');
  });

  it('falls back to a neutral label for an unknown host, never to a wrong app name', () => {
    expect(classifyGroupChat('https://example.com/group').label).toBe('Join group chat');
    expect(classifyGroupChat('').label).toBe('Join group chat');
  });

  it('matches on host, not on the string appearing anywhere in the URL', () => {
    // A path or query that merely mentions the provider must not claim it.
    expect(classifyGroupChat('https://evil.example/?next=chat.whatsapp.com').provider).toBe('other');
  });
});

describe('validateGroupChatUrl', () => {
  it('accepts an empty value — the field is optional', () => {
    expect(validateGroupChatUrl('')).toBeNull();
    expect(validateGroupChatUrl('   ')).toBeNull();
  });

  it('rejects a link without a scheme rather than silently building one', () => {
    expect(validateGroupChatUrl('chat.whatsapp.com/abc')).toMatch(/https:\/\//);
  });

  it('rejects a javascript: URL', () => {
    expect(validateGroupChatUrl('javascript:alert(1)')).not.toBeNull();
  });
});

describe('GroupChatBlock', () => {
  it('renders the join button when the service returned a URL', () => {
    render(<GroupChatBlock url="https://chat.whatsapp.com/abc" />);
    const link = screen.getByTestId('group-chat-link');
    expect(link).toHaveAttribute('href', 'https://chat.whatsapp.com/abc');
    expect(link).toHaveTextContent('Join WhatsApp group');
  });

  it('renders nothing at all when there is no URL and no locked state asked for', () => {
    const { container } = render(<GroupChatBlock url={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the reason to register — never a link — in the locked state', () => {
    render(<GroupChatBlock url={null} showLockedState />);
    expect(screen.getByTestId('group-chat-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('group-chat-link')).toBeNull();
  });

  it('drops a non-http scheme rather than rendering it as an href', () => {
    const { container } = render(<GroupChatBlock url={'javascript:alert(1)'} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('P1194 RLS: event_private_info is not publicly readable', () => {
  it('RLS is enabled before any policy is declared', () => {
    const rlsIdx = MIGRATION.indexOf('ALTER TABLE public.event_private_info ENABLE ROW LEVEL SECURITY');
    expect(rlsIdx).toBeGreaterThan(-1);
    expect(MIGRATION.indexOf('CREATE POLICY')).toBeGreaterThan(rlsIdx);
  });

  it('the SELECT policy is not USING (true) and requires host or RSVP', () => {
    expect(SELECT_POLICY).not.toMatch(/USING\s*\(\s*true\s*\)/);
    expect(SELECT_POLICY).toMatch(/events/);
    expect(SELECT_POLICY).toMatch(/event_rsvps/);
    expect(SELECT_POLICY).toMatch(/auth\.uid\(\)/);
  });

  it('the SELECT policy scopes both branches to the row being read, not to any event', () => {
    expect(SELECT_POLICY).toMatch(/e\.id = event_private_info\.event_id/);
    expect(SELECT_POLICY).toMatch(/r\.event_id = event_private_info\.event_id/);
  });

  it('the UPDATE policy carries a WITH CHECK — a host must not repoint a row at another event', () => {
    const updatePolicy = MIGRATION.slice(
      MIGRATION.indexOf('CREATE POLICY "Hosts can update private info for their events"'),
      MIGRATION.indexOf('CREATE POLICY "Hosts can delete private info for their events"')
    );
    expect(updatePolicy).toMatch(/WITH CHECK/);
  });

  it('the has_group_chat flag is maintained by trigger, not by the client', () => {
    expect(MIGRATION).toMatch(/CREATE TRIGGER trg_sync_event_has_group_chat/);
    expect(MIGRATION).toMatch(/SET search_path = ''/);
    // The client never writes the public flag.
    expect(SERVICE).not.toMatch(/has_group_chat:/);
  });
});

describe('P1194: the URL never reaches an unauthorized client', () => {
  it('the group chat is fetched from its own table, never joined onto a public events query', () => {
    expect(SERVICE).toMatch(/from\('event_private_info'\)/);

    // Every mention of the column must sit under an event_private_info query.
    // Walking back to the nearest preceding table name is stricter than a split:
    // it catches the column being smuggled into a select on any other table.
    const tableRefs = [...SERVICE.matchAll(/from\('(\w+)'\)/g)];
    for (const hit of SERVICE.matchAll(/group_chat_url/g)) {
      const preceding = tableRefs.filter(t => t.index! < hit.index!).pop();
      expect(preceding?.[1]).toBe('event_private_info');
    }
  });

  it('the read path has no caller-side authorization branch standing in for RLS', () => {
    const accessor = SERVICE.slice(
      SERVICE.indexOf('async getEventGroupChatUrl'),
      SERVICE.indexOf('isEventFull(event: EventWithHost)')
    );
    expect(accessor).toMatch(/event_private_info/);
    // No isUserRsvpd / host_id comparison here: a caller-side check would imply the
    // value had already been fetched and was merely being withheld.
    expect(accessor).not.toMatch(/isUserRsvpd|host_id/);
  });

  it('a failed group chat write is reported, never swallowed under a success toast', () => {
    const update = SERVICE.slice(
      SERVICE.indexOf('async updateEvent'),
      SERVICE.indexOf('async cancelEvent')
    );
    // The boolean must be consumed. Discarding it tells the host "saved" for a
    // link that never persisted.
    expect(update).toMatch(/const wrote = await upsertGroupChatUrl/);
    expect(update).toMatch(/if \(!wrote\)/);
  });

  it('the event page only asks for the link once the viewer is host or registered', () => {
    expect(DETAIL).toMatch(/if \(!eventId \|\| \(!isRsvpd && !isHostOfEvent\)\)/);
  });
});
