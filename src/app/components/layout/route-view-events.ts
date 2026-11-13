/**
 * P1669: the named view event for a route, derived from the path in one place so the pages that
 * real people use most (feed, groups, chats, event prepare and RSVP confirm) can enter a funnel.
 *
 * Properties carry public slugs only, cleaned to a safe set so a hand-typed URL cannot put free
 * text into analytics. Chat routes carry nothing: the conversation id is returned as `viewKey`,
 * which marks a new view (switching chats fires again) and is never sent.
 */
import { parseChatRoute } from '@/app/pages/chat/chat-route';

export interface RouteViewEvent {
  event: string;
  props?: Record<string, string>;
  viewKey?: string;
}

const cleanSlug = (raw: string): string => {
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    /* keep the raw segment */
  }
  return value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
};

/**
 * Known limit: an event fires for the route, before the page loads its data, so a group or event
 * slug that does not exist still counts as a view. Chats are signed-in only, so a signed-out visit
 * (redirected to sign in) never counts as one.
 */
export function viewEventFor(pathname: string, opts: { signedIn: boolean }): RouteViewEvent | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/feed') return { event: 'feed_viewed' };

  const group = path.match(/^\/groups\/([^/]+)(\/join)?$/);
  if (group) {
    const slug = cleanSlug(group[1] ?? '');
    if (!slug) return null;
    // The join page view is the funnel step before the existing `org_joined` (a completed join).
    return { event: group[2] ? 'group_join_viewed' : 'group_viewed', props: { org_slug: slug } };
  }

  if (path === '/chats') return opts.signedIn ? { event: 'chats_viewed' } : null;
  const { conversationId } = parseChatRoute(path);
  if (conversationId) return opts.signedIn ? { event: 'chat_opened', viewKey: conversationId } : null;

  const step = path.match(/^\/events\/([^/]+)\/(prepare|confirm)$/);
  if (step) {
    const slug = cleanSlug(step[1] ?? '');
    if (!slug) return null;
    return { event: step[2] === 'prepare' ? 'event_prepare_viewed' : 'event_rsvp_confirm_viewed', props: { event_slug: slug } };
  }
  return null;
}
