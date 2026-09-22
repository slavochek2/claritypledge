/**
 * P1352: event descriptions may now carry an image line. Everywhere the description leaves the
 * page as plain text (calendar exports, share cards), that line must not show as raw markdown.
 */
import { describe, it, expect } from 'vitest';
import { eventExcerpt } from '../../api/og';
import { getGoogleCalendarUrl, getOutlookUrl, getOffice365Url, stripImageMarkdown } from '@/app/prototypes/events/utils';

const IMG = '![The ikigai diagram](https://x.supabase.co/storage/v1/object/public/event-banners/descriptions/a.jpg)';
const event = {
  id: 'e1', title: 'T', slug: 's', location: 'L',
  startDate: new Date('2026-09-29T11:00:00Z'), endDate: new Date('2026-09-29T13:30:00Z'),
  description: `Before the picture.\n\n${IMG}\n\nAfter the picture.`,
};

describe('P1352 calendar text drops image markdown', () => {
  it('stripImageMarkdown removes the image and keeps the surrounding text', () => {
    const out = stripImageMarkdown(event.description);
    expect(out).not.toContain('![');
    expect(out).not.toContain('supabase.co');
    expect(out).toContain('Before the picture.');
    expect(out).toContain('After the picture.');
  });

  it.each([
    ['Google', getGoogleCalendarUrl],
    ['Outlook', getOutlookUrl],
    ['Office 365', getOffice365Url],
  ])('%s calendar link carries no image markdown', (_name, fn) => {
    const decoded = decodeURIComponent(fn(event as never).replace(/\+/g, ' '));
    expect(decoded).not.toContain('![');
    expect(decoded).toContain('After the picture.');
  });

  it('leaves ordinary links alone', () => {
    expect(stripImageMarkdown('See [the stories](https://claritypledge.com/stake/x).')).toBe('See [the stories](https://claritypledge.com/stake/x).');
  });
});

describe('P1352 share-card text drops image markdown', () => {
  it('eventExcerpt keeps the words and drops the image URL', () => {
    const out = eventExcerpt(`${IMG}\n\nThe search for professional meaning.`);
    expect(out).not.toContain('supabase.co');
    expect(out).not.toContain('!');
    expect(out).toContain('The search for professional meaning.');
  });
});
