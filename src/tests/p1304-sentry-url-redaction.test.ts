/**
 * P1304 Canary — Sentry attaches the page URL to events and navigation
 * breadcrumbs. On /live/:code that URL carries the room code, a bearer
 * capability. The composed beforeSend must redact the code segment (redaction,
 * not dropping — the P883/P990 ruling against message-filter DROPS does not apply).
 */
import { describe, it, expect } from 'vitest';
import type { ErrorEvent } from '@sentry/react';
import { sentryBeforeBreadcrumb, sentryBeforeSend } from '@/lib/sentry-filters';

const CODE = 'QX7K2M';

function liveEvent(): ErrorEvent {
  return {
    type: undefined,
    message: 'boom',
    request: { url: `https://claritypledge.com/live/${CODE}?returnTo=%2Fevents` },
    breadcrumbs: [
      { category: 'navigation', data: { from: '/events', to: `/live/${CODE}` } },
      { category: 'fetch', data: { url: `https://claritypledge.com/live/${CODE}` } },
    ],
    exception: { values: [{ type: 'Error', value: 'boom' }] },
  } as ErrorEvent;
}

describe('P1304: Sentry events carry no room code in URLs', () => {
  it('redacts the code from request.url and breadcrumb URLs', () => {
    const out = sentryBeforeSend(liveEvent());
    expect(out).not.toBeNull();
    expect(JSON.stringify(out)).not.toContain(CODE);
    expect(out?.request?.url).toContain('/live/');
  });

  it('redacts the transcribe room code, including inside an encoded login redirect', () => {
    const event = {
      request: { url: `https://claritypledge.com/login?redirect=%2Ftranscribe%2F${CODE}` },
      breadcrumbs: [{ category: 'navigation', data: { from: `/transcribe/${CODE}`, to: '/login' } }],
    } as ErrorEvent;
    expect(JSON.stringify(sentryBeforeSend(event))).not.toContain(CODE);
  });

  it('never throws on a cyclic breadcrumb and keeps non-plain values intact', () => {
    const data: Record<string, unknown> = { to: `/live/${CODE}`, at: new Date(0) };
    data.self = data;
    const out = sentryBeforeBreadcrumb({ category: 'navigation', data });
    expect(out.data?.to).toBe('/live/[code]');
    expect(out.data?.at).toBeInstanceOf(Date);
  });

  it('leaves non-/live URLs untouched', () => {
    const event = { request: { url: 'https://claritypledge.com/events/QX7K2M' } } as ErrorEvent;
    expect(sentryBeforeSend(event)?.request?.url).toBe('https://claritypledge.com/events/QX7K2M');
  });
});
