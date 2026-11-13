/**
 * P1669 — named view events for the pages real people use most, derived from the route.
 * The mapping is pure (viewEventFor); the mounted component is tested in
 * p1669-route-view-events.test.tsx with a real router.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { viewEventFor } from '@/app/components/layout/route-view-events';

const IN = { signedIn: true };
const OUT = { signedIn: false };

describe('viewEventFor', () => {
  it.each([
    ['/feed', { event: 'feed_viewed' }],
    ['/feed/', { event: 'feed_viewed' }],
    ['/groups/cm', { event: 'group_viewed', props: { org_slug: 'cm' } }],
    ['/groups/cm/join', { event: 'group_join_viewed', props: { org_slug: 'cm' } }],
    ['/chats', { event: 'chats_viewed' }],
    ['/chats/c/conv-123', { event: 'chat_opened', viewKey: 'conv-123' }],
    ['/chats/c/conv-123/t/root-9', { event: 'chat_opened', viewKey: 'conv-123' }],
    ['/events/cm-hike-0315/prepare', { event: 'event_prepare_viewed', props: { event_slug: 'cm-hike-0315' } }],
    ['/events/cm-hike-0315/confirm', { event: 'event_rsvp_confirm_viewed', props: { event_slug: 'cm-hike-0315' } }],
  ])('%s (signed in) → %o', (path, expected) => {
    expect(viewEventFor(path, IN)).toEqual(expected);
  });

  it.each(['/', '/groups', '/groups/cm/members', '/events/cm-hike-0315', '/events/x/room', '/feed/tag', '/prepare', '/chatsx', '/chats/new', '/chats/c'])(
    '%s has no P1669 view event',
    (path) => {
      expect(viewEventFor(path, IN)).toBeNull();
    },
  );

  it('signed out: chats never count (the visit is redirected to sign in); public pages still do', () => {
    expect(viewEventFor('/chats', OUT)).toBeNull();
    expect(viewEventFor('/chats/c/conv-1', OUT)).toBeNull();
    expect(viewEventFor('/feed', OUT)).toEqual({ event: 'feed_viewed' });
    expect(viewEventFor('/groups/cm', OUT)).toEqual({ event: 'group_viewed', props: { org_slug: 'cm' } });
  });

  it('chat events carry no properties: the conversation id is only a view key', () => {
    const out = viewEventFor('/chats/c/secret-conv/t/secret-root', IN);
    expect(out?.props).toBeUndefined();
    expect(JSON.stringify({ event: out?.event, props: out?.props })).not.toContain('secret');
  });

  it('a hand-typed slug cannot carry free text', () => {
    expect(viewEventFor('/groups/a%20b%3Cscript%3E!x.com', IN)).toEqual({ event: 'group_viewed', props: { org_slug: 'abscriptxcom' } });
    expect(viewEventFor(`/events/${'z'.repeat(200)}/prepare`, IN)?.props?.event_slug).toHaveLength(80);
    expect(viewEventFor('/groups/%40%40', IN)).toBeNull();
  });

  it('a completed group join is the existing org_joined, not a new duplicate event', () => {
    const s = readFileSync('src/app/pages/use-org-join-state.ts', 'utf8');
    expect(s).toContain("analytics.track('org_joined', { org_slug: org.slug");
    expect(s).not.toContain('group_join_completed');
  });

  it('the app shell mounts the route events through AppRouteEffects', () => {
    expect(readFileSync('src/App.tsx', 'utf8')).toContain('<AppRouteEffects />');
  });
});
