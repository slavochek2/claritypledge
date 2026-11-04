/**
 * P1604 (founder, 2026-11-04): thread title and chat header show a moment in ONE format: the viewer's own locale and zone.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { sessionThreadTitle } from '@/app/data/session-thread-title';
import { ConversationHeader } from '@/app/pages/chat/ConversationHeader';
import { viewerShortDate, viewerTime } from '@/lib/viewer-time';

const BODY = 'session|2026-11-03T14:05:00Z|1';

describe('one time format: the viewer\'s own, the same as the chat header', () => {
  it('the title\'s time and date are the viewer-locale formatters, nothing fixed to a region', () => {
    const title = sessionThreadTitle(BODY) as string;
    expect(title).toContain(viewerTime('2026-11-03T14:05:00Z'));
    expect(title).toContain(viewerShortDate('2026-11-03T14:05:00Z'));
  });

  it('follows the viewer: a 12-hour locale reads 12-hour, a 24-hour one 24-hour (the same instant)', () => {
    expect(viewerTime('2026-11-03T14:05:00Z', { locale: 'en-US', timeZone: 'UTC' })).toMatch(/2:05\s?PM/);
    expect(viewerTime('2026-11-03T14:05:00Z', { locale: 'de-DE', timeZone: 'UTC' })).toBe('14:05');
    expect(sessionThreadTitle(BODY, { locale: 'en-US', timeZone: 'UTC' })).toMatch(/2:05\s?PM/);
    expect(sessionThreadTitle(BODY, { locale: 'de-DE', timeZone: 'UTC' })).toContain('14:05');
  });

  it('the chat header shows the event time with that same formatter', () => {
    const chat = { conversationId: 'c', kind: 'event', title: null, other: null, org: null,
      event: { id: 'e1', slug: 's', title: 'Night', datetime: '2026-11-03T14:05:00Z' } } as never;
    render(<MemoryRouter><ConversationHeader chat={chat} blocked={false}
      actions={{ onBack: () => undefined, onArchive: () => undefined, onMarkUnread: () => undefined, onBlock: () => undefined,
        onUnblock: () => undefined, onRename: () => undefined }} /></MemoryRouter>);
    const time = viewerTime('2026-11-03T14:05:00Z');
    expect(screen.getByText((t) => t.includes(time))).toBeTruthy();
  });
});
