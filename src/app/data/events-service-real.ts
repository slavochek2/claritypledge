import type { EventsService, CreateEventInput, UpdateEventInput } from './events-service.interface';
import type { EventWithHost, EventAttendee, EventPracticeRoom, SeriesContent, PersonRef } from '@/app/types';
import { supabase } from '@/lib/supabase';
import { invokeEventEmails } from '@/lib/event-emails';
import { extractBannerKeywords, fetchUnsplashBanner, generateAIBanner } from '@/app/prototypes/events/banner-utils';
import { logDbError, throwDbError } from './db-error-logger';
import { clientHoldsUser, ensureClientSessionFor, isAnonymousRlsDenial, SessionMismatchError } from '@/lib/session-guard';
import { earCountOf } from './ear-count';
import { slugifyName } from './api';

// `status` is NOT auto-managed (no trigger, no cron — intentional).
// `datetime` is the source of truth for past/upcoming via the grace-period pattern below.
// `status` is only authoritative for the `cancelled` state.

// P494: Events stay in "upcoming" for this many hours after their start time.
// Covers running events, latecomers, and post-event registrations.
//
// P1256: 5 → 12. Two problems, one number.
//
// (a) 5h was shorter than the events we actually run. The 2026-09-06 hike was a
//     4h walk that ran long; the list dropped it out of "upcoming" at 14:00 while
//     the group was still on the trail. A hike can occupy most of a day, and the
//     event should stay live for the whole of it.
//
// (b) It was not the only clock. EventDetail computed its own `isPast` from
//     `datetime + durationMinutes`, closing RSVP at 13:00 — an hour BEFORE the
//     same event left the "upcoming" list. Two surfaces, two answers, on the same
//     event. EventDetail now reads this constant too, so there is exactly one
//     definition of "this event is over" in the product. `durationMinutes` keeps
//     its real job there: the displayed time range and the calendar export.
//
// Measured from the start time, not from start+duration, deliberately: the list
// query is a SQL `.gte('datetime', cutoff)` and cannot add a per-row duration
// without a computed column. One rule both surfaces can evaluate beats a more
// precise rule only one of them can.
/** P1403 amendment: map a joined reviewer profile to a PersonRef (null join → no avatar). */
function toReviewAuthor(
  raw: { name: string | null; slug: string | null; avatar_color: string | null; avatar_url: string | null; has_pledged: boolean | null; ears_count: number | null }
    | { name: string | null; slug: string | null; avatar_color: string | null; avatar_url: string | null; has_pledged: boolean | null; ears_count: number | null }[]
    | null,
  fallbackName: string,
): PersonRef | undefined {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row) return undefined;
  return {
    name: row.name || fallbackName,
    slug: row.slug ?? undefined,
    avatarColor: row.avatar_color ?? undefined,
    avatarUrl: row.avatar_url,
    hasPledged: row.has_pledged ?? false,
    earCount: earCountOf(row),
  };
}

export const EVENT_GRACE_HOURS = 12;

/** Returns an ISO string for `now - EVENT_GRACE_HOURS`. */
function getGraceCutoff(): string {
  return new Date(Date.now() - EVENT_GRACE_HOURS * 60 * 60 * 1000).toISOString();
}

// Debug logging - only in development
const DEBUG = import.meta.env.DEV;
// eslint-disable-next-line no-console -- gated by DEBUG (import.meta.env.DEV); dev-only diagnostic (P1200)
const log = (...args: unknown[]) => DEBUG && console.log('[events-service-real]', ...args);

// Database row type with joined host profile
interface DbEventWithHost {
  id: string;
  slug: string;
  title: string;
  description: string;
  datetime: string;
  duration_minutes: number;
  timezone: string;
  location: string;
  host_id: string;
  max_attendees: number | null;
  created_at: string;
  status: 'upcoming' | 'completed' | 'cancelled';
  banner_url: string | null;
  /** P1354: phone-optimised banner variant. Read-only from the app's side. */
  banner_mobile_url?: string | null;
  /** P1179: JSONB [{tag, label?}] — extra Links-menu entries, [] on every row by default. */
  links: { tag: string; label?: string }[] | null;
  has_group_chat?: boolean | null;
  /** P1336 */
  preparation_enabled?: boolean | null;
  statement_tag?: string | null;
  research_places?: number | null;
  /** P1403: read-only from the app's side — written by publish-run / service role. */
  series_slug?: string | null;
  hike_details?: unknown;
  route_geojson?: unknown;
  host: {
    id: string;
    full_name: string | null;
    slug: string | null;
    headline: string | null;
    avatar_color: string | null;
    avatar_url: string | null;
    has_pledged: boolean | null; // P118: Host pledge status
    ears_count: number | null; // P940: distinct stories host was rated on
  } | null;
}

// Database row type for RSVPs with joined profile
interface DbRsvpWithProfile {
  profile_id: string;
  profile: {
    id: string;
    full_name: string | null;
    slug: string | null;
    avatar_color: string | null;
    avatar_url: string | null;
    has_pledged: boolean | null;
    ears_count: number | null;
  } | null;
}

/**
 * P1194: write the group chat link into the RLS-gated side table.
 *
 * An empty string means "the host cleared the field" — the row is deleted
 * rather than left holding an empty value, so `getEventGroupChatUrl` has one
 * shape for "no group chat" instead of two. Returns false on failure; callers
 * decide whether that is fatal (it is not, for create — the event already exists).
 */
async function upsertGroupChatUrl(eventId: string, url: string | null | undefined): Promise<boolean> {
  const value = (url ?? '').trim();

  if (!value) {
    const { error } = await supabase
      .from('event_private_info')
      .delete()
      .eq('event_id', eventId);
    if (error) {
      logDbError('upsertGroupChatUrl:delete', error);
      return false;
    }
    return true;
  }

  const { error } = await supabase
    .from('event_private_info')
    .upsert({ event_id: eventId, group_chat_url: value, updated_at: new Date().toISOString() }, { onConflict: 'event_id' });

  if (error) {
    logDbError('upsertGroupChatUrl:upsert', error);
    return false;
  }
  return true;
}

/**
 * Transform database row (snake_case) to application type (camelCase)
 */
function mapEventFromDb(row: DbEventWithHost): EventWithHost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    datetime: row.datetime,
    durationMinutes: row.duration_minutes,
    timezone: row.timezone,
    location: row.location,
    hostId: row.host_id,
    maxAttendees: row.max_attendees ?? undefined,
    createdAt: row.created_at,
    status: row.status,
    // Host info from joined profile
    hostName: row.host?.full_name ?? 'Unknown',
    hostSlug: row.host?.slug ?? '',
    hostRole: row.host?.headline ?? undefined,
    hostAvatarColor: row.host?.avatar_color ?? '#3B82F6',
    hostAvatarUrl: row.host?.avatar_url ?? undefined,
    hostHasPledged: row.host?.has_pledged ?? false, // P118: Host pledge status
    hostEarCount: earCountOf(row.host), // P940: distinct stories host was rated on
    bannerUrl: row.banner_url ?? undefined,
    // P1354: read-only. Deliberately absent from updateEvent's UpdateEventInput mapping below —
    // adding a write path there would make isBannerOnly's key-count check fire the
    // attendee "event updated" email for a cosmetic phone-banner change.
    bannerMobileUrl: row.banner_mobile_url ?? undefined,
    // P1179: the column defaults to [] in the DB, but a row read before the
    // migration lands (or a select that omits it) must still render the five
    // standard entries rather than crash the room's menu.
    links: Array.isArray(row.links) ? row.links : [],
    hasGroupChat: row.has_group_chat ?? false, // P1194
    preparationEnabled: row.preparation_enabled ?? false, // P1336
    statementTag: row.statement_tag ?? undefined,
    researchPlaces: row.research_places ?? 6,
    // P1403: read-only, like bannerMobileUrl — deliberately absent from updateEvent's mapping.
    seriesSlug: row.series_slug ?? undefined,
    hikeDetails: row.hike_details ?? undefined,
    routeGeojson: row.route_geojson ?? undefined,
    // Attendees fetched separately - components should call getEventAttendees()
    attendees: [],
    attendeeCount: 0,
  };
}

/**
 * Generate URL-friendly slug from title and date
 */
// P986: Unicode-aware fallback used when slugifyName() can't romanize the
// title (e.g. all-emoji). Folds diacritics and keeps letters/numbers of any
// script, so a non-Latin title survives here rather than collapsing to "".
function asciiFallbackSlug(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining marks
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// P986: romanizes the title via P985's slugifyName (e.g. 这是一个活动 → "zhe-shi-yi-ge-huo-dong")
// so non-Latin event titles keep a readable slug instead of dropping to "".
export async function generateSlug(title: string): Promise<string> {
  const dateStr = new Date().toISOString().split('T')[0];
  const romanized = await slugifyName(title);
  const titleSlug = romanized || asciiFallbackSlug(title);
  const randomSuffix = Math.random().toString(36).slice(2, 6);
  return `${titleSlug}-${dateStr}-${randomSuffix}`;
}

export const realEventsService: EventsService = {
  async getUpcomingEvents(orgId?: string): Promise<EventWithHost[]> {
    log(' getUpcomingEvents', orgId ?? '(unscoped)');

    const graceCutoff = getGraceCutoff();
    // P1060: the org filter is applied CONDITIONALLY and last. Omitting orgId must
    // add no `.eq` at all — the standalone /events list stays unfiltered, which is
    // the ALLOWED path the spec's gate-7c risk exists to protect.
    let query = supabase
      .from('events')
      .select(`
        *,
        host:profiles!events_host_id_fkey (
          id,
          full_name:name,
          slug,
          headline:role,
          avatar_color,
          avatar_url,
          has_pledged,
          ears_count
        )
      `)
      .gte('datetime', graceCutoff)
      .in('status', ['upcoming', 'cancelled'])  // Include cancelled future events
      .order('datetime', { ascending: true });

    if (orgId) query = query.eq('org_id', orgId);

    const { data, error } = await query;

    if (error) {
      logDbError('getUpcomingEvents', error);
      return [];
    }

    // Fetch attendee counts for all events
    const events = (data as DbEventWithHost[]).map(mapEventFromDb);

    // Get attendee counts in batch
    const eventIds = events.map(e => e.id);
    if (eventIds.length > 0) {
      // P1366: `profile_id` rides along ONLY to tell whether the host has an RSVP row of their
      // own (a display input for `displayGoingCount`). The count itself is unchanged: every row.
      const { data: rsvpCounts } = await supabase
        .from('event_rsvps')
        .select('event_id, profile_id')
        .in('event_id', eventIds);

      if (rsvpCounts) {
        const countMap = rsvpCounts.reduce((acc, rsvp) => {
          acc[rsvp.event_id] = (acc[rsvp.event_id] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        events.forEach(event => {
          event.attendeeCount = countMap[event.id] || 0;
          event.hostHasRsvp = rsvpCounts.some(
            (rsvp) => rsvp.event_id === event.id && rsvp.profile_id === event.hostId,
          );
        });
      }
    }

    return events;
  },

  async getPastEvents(orgId?: string): Promise<EventWithHost[]> {
    log(' getPastEvents', orgId ?? '(unscoped)');

    const graceCutoff = getGraceCutoff();
    // Past events: completed status OR (cancelled/upcoming AND past grace cutoff)
    // Grace cutoff = now - 5 hours, so recently-started events stay in "upcoming"
    // P1060: same conditional org filter as getUpcomingEvents — see the note there.
    let query = supabase
      .from('events')
      .select(`
        *,
        host:profiles!events_host_id_fkey (
          id,
          full_name:name,
          slug,
          headline:role,
          avatar_color,
          avatar_url,
          has_pledged,
          ears_count
        )
      `)
      .or(`status.eq.completed,and(status.eq.cancelled,datetime.lt.${graceCutoff}),and(status.eq.upcoming,datetime.lt.${graceCutoff})`)
      .order('datetime', { ascending: false });

    if (orgId) query = query.eq('org_id', orgId);

    const { data, error } = await query;

    if (error) {
      logDbError('getPastEvents', error);
      return [];
    }

    const events = (data as DbEventWithHost[]).map(mapEventFromDb);

    // Fetch attendee counts in batch (same as getUpcomingEvents)
    const eventIds = events.map(e => e.id);
    if (eventIds.length > 0) {
      // P1366: `profile_id` rides along ONLY to tell whether the host has an RSVP row of their
      // own (a display input for `displayGoingCount`). The count itself is unchanged: every row.
      const { data: rsvpCounts } = await supabase
        .from('event_rsvps')
        .select('event_id, profile_id')
        .in('event_id', eventIds);

      if (rsvpCounts) {
        const countMap = rsvpCounts.reduce((acc, rsvp) => {
          acc[rsvp.event_id] = (acc[rsvp.event_id] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        events.forEach(event => {
          event.attendeeCount = countMap[event.id] || 0;
          event.hostHasRsvp = rsvpCounts.some(
            (rsvp) => rsvp.event_id === event.id && rsvp.profile_id === event.hostId,
          );
        });
      }
    }

    return events;
  },

  async getEventBySlug(slug: string): Promise<EventWithHost | null> {
    log(' getEventBySlug:', slug);

    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        host:profiles!events_host_id_fkey (
          id,
          full_name:name,
          slug,
          headline:role,
          avatar_color,
          avatar_url,
          has_pledged,
          ears_count
        )
      `)
      .eq('slug', slug)
      .single();

    if (error || !data) {
      log(' getEventBySlug not found:', slug);
      return null;
    }

    const event = mapEventFromDb(data as DbEventWithHost);

    // Fetch attendees for this single event
    const attendees = await this.getEventAttendees(event.id);
    event.attendees = attendees;
    event.attendeeCount = attendees.length;

    return event;
  },

  async getEventAttendees(eventId: string): Promise<EventAttendee[]> {
    log(' getEventAttendees:', eventId);

    const { data, error } = await supabase
      .from('event_rsvps')
      .select(`
        profile_id,
        profile:profiles!event_rsvps_profile_id_fkey (
          id,
          full_name:name,
          slug,
          avatar_color,
          avatar_url,
          has_pledged,
          ears_count
        )
      `)
      .eq('event_id', eventId);

    if (error || !data) {
      logDbError('getEventAttendees', error);
      return [];
    }

    return (data as DbRsvpWithProfile[]).map(rsvp => ({
      profileId: rsvp.profile_id,
      name: rsvp.profile?.full_name ?? 'Unknown',
      slug: rsvp.profile?.slug ?? '',
      avatarColor: rsvp.profile?.avatar_color ?? '#3B82F6',
      avatarUrl: rsvp.profile?.avatar_url ?? undefined,
      hasPledged: rsvp.profile?.has_pledged ?? false,
      earCount: earCountOf(rsvp.profile),
    }));
  },

  async isUserRsvpd(eventId: string, profileId: string): Promise<boolean> {
    log(' isUserRsvpd:', { eventId, profileId });

    // maybeSingle() returns null (not 406) when 0 rows — avoids console noise
    const { data, error } = await supabase
      .from('event_rsvps')
      .select('id')
      .eq('event_id', eventId)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (error) {
      return false;
    }

    return !!data;
  },

  async getEventGroupChatUrl(eventId: string): Promise<string | null> {
    log(' getEventGroupChatUrl:', eventId);

    // No caller-side authorization check here on purpose. RLS on
    // event_private_info returns zero rows to anyone who is neither the host
    // nor an RSVP'd attendee, so an unauthorized caller gets null from the
    // database rather than a value this code declined to render (P1194).
    const { data, error } = await supabase
      .from('event_private_info')
      .select('group_chat_url')
      .eq('event_id', eventId)
      .maybeSingle();

    if (error) {
      logDbError('getEventGroupChatUrl', error);
      return null;
    }

    return data?.group_chat_url ?? null;
  },

  // P1403: the organising community for the hike page's "Organized by" line. Two flat
  // queries, same as the footer note below (src.md: no nested selects).
  async getEventOrganizer(eventId: string): Promise<{ name: string; slug: string } | null> {
    const { data: ev, error: evError } = await supabase
      .from('events')
      .select('org_id')
      .eq('id', eventId)
      .maybeSingle();
    if (evError) {
      logDbError('getEventOrganizer(event)', evError);
      return null;
    }
    if (!ev?.org_id) return null;
    const { data: org, error: orgError } = await supabase
      .from('organization')
      .select('name, slug')
      .eq('id', ev.org_id)
      .maybeSingle();
    if (orgError) {
      logDbError('getEventOrganizer(org)', orgError);
      return null;
    }
    return org?.name && org?.slug ? { name: org.name, slug: org.slug } : null;
  },

  // P1264: the organiser's standing note, rendered as the last block on the event
  // page. Two flat queries rather than a nested select — src.md bans nested selects
  // against PostgREST as unreliable, and this runs once per page view.
  async getEventOrgFooterNote(eventId: string): Promise<string | null> {
    log(' getEventOrgFooterNote:', eventId);

    const { data: ev, error: evError } = await supabase
      .from('events')
      .select('org_id')
      .eq('id', eventId)
      .maybeSingle();

    if (evError) {
      logDbError('getEventOrgFooterNote(event)', evError);
      return null;
    }
    if (!ev?.org_id) return null;

    const { data: org, error: orgError } = await supabase
      .from('organization')
      .select('event_footer_note')
      .eq('id', ev.org_id)
      .maybeSingle();

    if (orgError) {
      logDbError('getEventOrgFooterNote(org)', orgError);
      return null;
    }

    const note = org?.event_footer_note;
    // Whitespace-only is "unset" as far as the render path is concerned, so a note
    // cleared to spaces cannot produce an empty bordered block.
    return note && note.trim().length > 0 ? note : null;
  },

  // P1403: series-level reviews + photos. Public tables (RLS SELECT for anon), so this
  // is fetched regardless of auth or RSVP state. Two flat queries, no nested select.
  // A failed query yields an empty list: its section hides, the page still renders.
  async getSeriesContent(seriesSlug: string): Promise<SeriesContent> {
    log(' getSeriesContent:', seriesSlug);
    const [reviewsRes, photosRes] = await Promise.all([
      supabase
        .from('series_reviews')
        .select(`
          id, quote, author_name, author_profile_path, sort_order,
          author:profiles!series_reviews_author_profile_id_fkey (name, slug, avatar_color, avatar_url, has_pledged, ears_count)
        `)
        .eq('series_slug', seriesSlug)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('series_photos')
        .select('id, storage_url, alt, credit, sort_order')
        .eq('series_slug', seriesSlug)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ]);

    if (reviewsRes.error) logDbError('getSeriesContent(reviews)', reviewsRes.error);
    if (photosRes.error) logDbError('getSeriesContent(photos)', photosRes.error);

    type AuthorRow = {
      name: string | null; slug: string | null; avatar_color: string | null;
      avatar_url: string | null; has_pledged: boolean | null; ears_count: number | null;
    };
    type ReviewRow = {
      id: string; quote: string; author_name: string; author_profile_path: string | null;
      author: AuthorRow | AuthorRow[] | null;
    };
    type PhotoRow = { id: string; storage_url: string; alt: string; credit: string | null };

    return {
      reviews: ((reviewsRes.data ?? []) as ReviewRow[]).map(r => ({
        id: r.id,
        quote: r.quote,
        authorName: r.author_name,
        authorProfilePath: r.author_profile_path ?? undefined,
        author: toReviewAuthor(r.author, r.author_name),
      })),
      photos: ((photosRes.data ?? []) as PhotoRow[]).map(p => ({
        id: p.id,
        storageUrl: p.storage_url,
        alt: p.alt,
        credit: p.credit ?? undefined,
      })),
    };
  },

  isEventFull(event: EventWithHost): boolean {
    if (!event.maxAttendees) return false;
    return (event.attendeeCount ?? 0) >= event.maxAttendees;
  },

  getSpotsRemaining(event: EventWithHost): number | null {
    if (!event.maxAttendees) return null;
    return Math.max(0, event.maxAttendees - (event.attendeeCount ?? 0));
  },

  async createEvent(data: CreateEventInput): Promise<EventWithHost | null> {
    log(' createEvent:', data.title);

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      log('ERROR: createEvent: No authenticated user');
      return null;
    }

    const slug = await generateSlug(data.title);

    const { data: created, error } = await supabase
      .from('events')
      .insert({
        slug,
        title: data.title,
        description: data.description,
        datetime: data.datetime,
        duration_minutes: data.durationMinutes,
        timezone: data.timezone,
        location: data.location,
        host_id: user.id,
        max_attendees: data.maxAttendees ?? null,
        // P1060: explicit null, never omitted — an absent key and a null both store
        // NULL, but writing it makes the standalone case visible at the call site.
        // The DB trigger rejects a non-null org_id the host does not organize.
        org_id: data.orgId ?? null,
        // P1336: the series default is decided by the form; absent = the column default (off).
        ...(data.preparationEnabled !== undefined ? { preparation_enabled: data.preparationEnabled } : {}),
        ...(data.statementTag !== undefined ? { statement_tag: data.statementTag || null } : {}),
      })
      .select(`
        *,
        host:profiles!events_host_id_fkey (
          id,
          full_name:name,
          slug,
          headline:role,
          avatar_color,
          avatar_url,
          has_pledged,
          ears_count
        )
      `)
      .single();

    if (error || !created) {
      logDbError('createEvent', error);
      return null;
    }

    const event = mapEventFromDb(created as DbEventWithHost);

    // P1194: private details live in their own RLS-gated table, so this is a
    // second write. The event itself already exists and must not be thrown away —
    // but the host typed a link and has to learn it did not save, so the failure
    // rides back on the event rather than being swallowed (updateEvent returns
    // false for the same reason; here there is a created event to hand back).
    if (data.groupChatUrl !== undefined) {
      const wrote = await upsertGroupChatUrl(event.id, data.groupChatUrl);
      if (!wrote) {
        log('ERROR: createEvent: event created but group chat link did not persist');
        event.groupChatWriteFailed = true;
      }
    }

    // Fire-and-forget: generate banner in background so user navigates immediately
    void (async () => {
      let bannerUrl: string | null = null;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (token) {
          bannerUrl = await generateAIBanner('event', event.id, token);
        }
      } catch {
        // AI generation failed silently
      }

      if (!bannerUrl) {
        const keywords = extractBannerKeywords(data.title);
        if (keywords) {
          try {
            bannerUrl = await fetchUnsplashBanner(keywords);
          } catch {
            // Unsplash also failed silently
          }
        }
      }

      if (bannerUrl) {
        await supabase.from('events').update({ banner_url: bannerUrl }).eq('id', event.id);
      }
    })();

    return event;
  },

  async updateEvent(eventId: string, data: UpdateEventInput): Promise<boolean> {
    log(' updateEvent:', eventId);

    // Get current user - must be authenticated and be the host
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      log('ERROR: updateEvent: No authenticated user');
      return false;
    }

    // Map camelCase to snake_case for DB
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.datetime !== undefined) updateData.datetime = data.datetime;
    if (data.durationMinutes !== undefined) updateData.duration_minutes = data.durationMinutes;
    if (data.timezone !== undefined) updateData.timezone = data.timezone;
    if (data.location !== undefined) updateData.location = data.location;
    if (data.maxAttendees !== undefined) updateData.max_attendees = data.maxAttendees;
    if ('bannerUrl' in data) updateData.banner_url = data.bannerUrl ?? null;
    if (data.preparationEnabled !== undefined) updateData.preparation_enabled = data.preparationEnabled; // P1336
    if (data.statementTag !== undefined) updateData.statement_tag = data.statementTag || null; // P1336

    // Only allow update if user is the host (authorization check)
    const { error, data: updated } = await supabase
      .from('events')
      .update(updateData)
      .eq('id', eventId)
      .eq('host_id', user.id)
      .select('id');

    if (error) {
      logDbError('updateEvent', error);
      return false;
    }

    // If no rows updated, user wasn't the host or event not found
    if (!updated || updated.length === 0) {
      log('ERROR: updateEvent: User is not the host or event not found');
      return false;
    }

    // P1194: the group chat link is not a column on events — write it separately,
    // and only after the host check above has passed. A failure here must NOT be
    // swallowed: the host would be told "Event updated successfully" while the
    // link they just typed never persisted, and would close the tab believing it
    // had. Reporting failure is honest and the retry is idempotent.
    if (data.groupChatUrl !== undefined) {
      const wrote = await upsertGroupChatUrl(eventId, data.groupChatUrl);
      if (!wrote) {
        log('ERROR: updateEvent: event saved but group chat link did not persist');
        return false;
      }
    }

    // Fire-and-forget: send update emails — skip for banner-only changes
    // P1336: preparation settings change nothing an attendee was told, so they mail nobody either.
    const SILENT_KEYS = ['banner_url', 'preparation_enabled', 'statement_tag'];
    const isBannerOnly = Object.keys(updateData).length > 0 && Object.keys(updateData).every(k => SILENT_KEYS.includes(k));
    if (!isBannerOnly) {
      invokeEventEmails('update', eventId);
    }

    return true;
  },

  async cancelEvent(eventId: string): Promise<boolean> {
    log(' cancelEvent:', eventId);

    // Get current user - must be authenticated and be the host
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      log('ERROR: cancelEvent: No authenticated user');
      return false;
    }

    // Only allow cancel if user is the host (authorization check)
    const { error, data: updated } = await supabase
      .from('events')
      .update({ status: 'cancelled' })
      .eq('id', eventId)
      .eq('host_id', user.id)
      .select('id');

    if (error) {
      logDbError('cancelEvent', error);
      return false;
    }

    // If no rows updated, user wasn't the host or event not found
    if (!updated || updated.length === 0) {
      log('ERROR: cancelEvent: User is not the host or event not found');
      return false;
    }

    // Fire-and-forget: cancel scheduled emails and notify all attendees
    invokeEventEmails('cancel', eventId);

    return true;
  },

  async uncancelEvent(eventId: string): Promise<boolean> {
    log(' uncancelEvent:', eventId);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      log('ERROR: uncancelEvent: No authenticated user');
      return false;
    }

    const { error, data: updated } = await supabase
      .from('events')
      .update({ status: 'upcoming' })
      .eq('id', eventId)
      .eq('host_id', user.id)
      .select('id');

    if (error) {
      logDbError('uncancelEvent', error);
      return false;
    }

    if (!updated || updated.length === 0) {
      log('ERROR: uncancelEvent: User is not the host or event not found');
      return false;
    }

    // Fire-and-forget: send re-announcement to all attendees
    invokeEventEmails('uncancel', eventId);

    return true;
  },

  async rsvpToEvent(eventId: string, profileId: string): Promise<boolean> {
    log(' rsvpToEvent:', { eventId, profileId });


    // KNOWN LIMITATION: Capacity check is not fully atomic with insert.
    // Under high concurrent load, it's possible for two RSVPs to both pass
    // the capacity check and both insert, exceeding max_attendees by 1.
    // For MVP traffic levels this is acceptable. For production scale,
    // consider using a database trigger or stored procedure.
    // See: code review 2026-01-19
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, max_attendees, status')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      log('ERROR: rsvpToEvent: Event not found');
      return false;
    }

    // Don't allow RSVP to cancelled events
    if (event.status === 'cancelled') {
      log(' rsvpToEvent: Event is cancelled');
      return false;
    }

    // Check capacity if max_attendees is set
    if (event.max_attendees) {
      const { count, error: countError } = await supabase
        .from('event_rsvps')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId);

      if (countError) {
        logDbError('rsvpToEvent.count', countError);
        return false;
      }

      if ((count ?? 0) >= event.max_attendees) {
        log(' rsvpToEvent: Event is full');
        return false;
      }
    }

    // P1441: never insert as anyone but `profileId` — an anonymous insert fails RLS and reads to
    // the person as "event full". Checked right before the insert (not before the reads above),
    // and the server's 401 answer is mapped too, since the session can still vanish in between.
    // The caller turns SessionMismatchError into "please sign in again".
    if ((await ensureClientSessionFor(profileId)) !== 'ok') throw new SessionMismatchError(profileId);

    // Insert RSVP
    const { error, status } = await supabase
      .from('event_rsvps')
      .insert({
        event_id: eventId,
        profile_id: profileId,
      });

    if (isAnonymousRlsDenial(error, status)) throw new SessionMismatchError(profileId);

    if (error) {
      // P897: 23505 = unique violation (already RSVP'd). That is an expected,
      // user-recoverable case — a double-click race or a re-invoke on stale
      // state — so it must be classified BEFORE logDbError, not after. Logging
      // first shipped a Sentry error event for every duplicate. Mirrors the
      // guards in badge-service-real.ts:62 and stories-service-real.ts:613.
      // Return value stays `false` (pinned by events-service-real.test.ts);
      // only the Sentry report is suppressed.
      if (error.code !== '23505') {
        logDbError('rsvpToEvent', error);
      }
      return false;
    }

    // Fire-and-forget: send confirmation + schedule reminder and feedback emails
    invokeEventEmails('rsvp', eventId, profileId);

    return true;
  },

  async cancelRsvp(eventId: string, profileId: string): Promise<boolean> {
    log(' cancelRsvp:', { eventId, profileId });

    // P1441: never report "cancelled" unless the row is gone. An anonymous DELETE is not an error —
    // RLS filters it to zero rows — so the old code returned true while the seat stayed booked.
    if ((await ensureClientSessionFor(profileId)) !== 'ok') throw new SessionMismatchError(profileId);

    const { data, error, status } = await supabase
      .from('event_rsvps')
      .delete()
      .eq('event_id', eventId)
      .eq('profile_id', profileId)
      .select('id');

    // Same server verdict as rsvpToEvent. Today anon holds DELETE, so an anonymous cancel shows
    // up as zero rows (below); this keeps it right if that grant is ever revoked.
    if (isAnonymousRlsDenial(error, status)) throw new SessionMismatchError(profileId);

    if (error) {
      logDbError('cancelRsvp', error);
      return false;
    }

    if (!data || data.length === 0) {
      // Zero rows because the session vanished after the check reads as "sign in again". Checked
      // without a re-sync: a repaired session here would still leave this delete un-retried.
      if (!(await clientHoldsUser(profileId))) throw new SessionMismatchError(profileId);
      // Still signed in, so zero rows means there was nothing to delete (a double tap, another
      // tab). Report "cancelled" only once a read confirms the row is gone — event_rsvps is
      // readable by everyone, so this read is true whatever the session.
      const { data: still, error: readError } = await supabase
        .from('event_rsvps')
        .select('id')
        .eq('event_id', eventId)
        .eq('profile_id', profileId)
        .maybeSingle();
      return !readError && !still;
    }

    return true;
  },

  // P62: Dashboard queries

  async getUserNextEvent(profileId: string): Promise<EventWithHost | null> {
    log(' getUserNextEvent:', profileId);

    const graceCutoff = getGraceCutoff();

    // First, get event IDs where user is RSVP'd
    const { data: rsvps, error: rsvpError } = await supabase
      .from('event_rsvps')
      .select('event_id')
      .eq('profile_id', profileId);

    if (rsvpError) {
      logDbError('getUserNextEvent', rsvpError);
      return null;
    }

    const rsvpEventIds = rsvps?.map(r => r.event_id) || [];

    // Get the next upcoming event where user is attending or hosting
    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        host:profiles!events_host_id_fkey (
          id,
          full_name:name,
          slug,
          headline:role,
          avatar_color,
          avatar_url,
          has_pledged,
          ears_count
        )
      `)
      .gte('datetime', graceCutoff)
      .eq('status', 'upcoming')
      .or(`host_id.eq.${profileId}${rsvpEventIds.length > 0 ? `,id.in.(${rsvpEventIds.join(',')})` : ''}`)
      .order('datetime', { ascending: true })
      .limit(1)
      .single();

    if (error || !data) {
      log(' getUserNextEvent: No upcoming event found');
      return null;
    }

    const event = mapEventFromDb(data as DbEventWithHost);

    // Fetch attendees
    const attendees = await this.getEventAttendees(event.id);
    event.attendees = attendees;
    event.attendeeCount = attendees.length;

    return event;
  },

  async getPeopleFromEvent(eventId: string, excludeProfileId: string): Promise<EventAttendee[]> {
    log(' getPeopleFromEvent:', { eventId, excludeProfileId });

    // Get event to include host
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select(`
        host_id,
        host:profiles!events_host_id_fkey (
          id,
          full_name:name,
          slug,
          avatar_color,
          avatar_url,
          has_pledged,
          ears_count
        )
      `)
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      logDbError('getPeopleFromEvent', eventError);
      return [];
    }

    // Get attendees excluding the current user
    const { data: rsvps, error: rsvpError } = await supabase
      .from('event_rsvps')
      .select(`
        profile_id,
        profile:profiles!event_rsvps_profile_id_fkey (
          id,
          full_name:name,
          slug,
          avatar_color,
          avatar_url,
          has_pledged,
          ears_count
        )
      `)
      .eq('event_id', eventId)
      .neq('profile_id', excludeProfileId);

    if (rsvpError) {
      logDbError('getPeopleFromEvent.rsvp', rsvpError);
      return [];
    }

    const attendees: EventAttendee[] = (rsvps as DbRsvpWithProfile[]).map(rsvp => ({
      profileId: rsvp.profile_id,
      name: rsvp.profile?.full_name ?? 'Unknown',
      slug: rsvp.profile?.slug ?? '',
      avatarColor: rsvp.profile?.avatar_color ?? '#3B82F6',
      avatarUrl: rsvp.profile?.avatar_url ?? undefined,
      hasPledged: rsvp.profile?.has_pledged ?? false,
      earCount: earCountOf(rsvp.profile),
    }));

    // Include host if they're not the excluded user
    const eventWithHost = event as { host_id: string; host: { id: string; full_name: string | null; slug: string | null; avatar_color: string | null; avatar_url: string | null; has_pledged: boolean | null; ears_count: number | null } | null };
    if (eventWithHost.host_id !== excludeProfileId && eventWithHost.host) {
      attendees.unshift({
        profileId: eventWithHost.host_id,
        name: eventWithHost.host.full_name ?? 'Unknown',
        slug: eventWithHost.host.slug ?? '',
        avatarColor: eventWithHost.host.avatar_color ?? '#3B82F6',
        avatarUrl: eventWithHost.host.avatar_url ?? undefined,
        hasPledged: eventWithHost.host.has_pledged ?? false,
        earCount: earCountOf(eventWithHost.host),
      });
    }

    return attendees;
  },

  async getUserRegisteredEvents(profileId: string): Promise<EventWithHost[]> {
    log(' getUserRegisteredEvents:', profileId);

    // Get event IDs where user is RSVP'd
    const { data: rsvps, error: rsvpError } = await supabase
      .from('event_rsvps')
      .select('event_id')
      .eq('profile_id', profileId);

    if (rsvpError || !rsvps || rsvps.length === 0) {
      log(' getUserRegisteredEvents: No RSVPs found');
      return [];
    }

    const eventIds = rsvps.map(r => r.event_id);

    // Return ALL events user is attending (not hosting) — past and upcoming.
    // Callers filter by datetime to split upcoming vs past.
    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        host:profiles!events_host_id_fkey (
          id,
          full_name:name,
          slug,
          headline:role,
          avatar_color,
          avatar_url,
          has_pledged,
          ears_count
        )
      `)
      .in('id', eventIds)
      .neq('host_id', profileId)
      .order('datetime', { ascending: false });

    if (error) {
      logDbError('getUserRegisteredEvents', error);
      return [];
    }

    return (data as DbEventWithHost[]).map(mapEventFromDb);
  },

  async getUserHostedEvents(profileId: string): Promise<EventWithHost[]> {
    log(' getUserHostedEvents:', profileId);

    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        host:profiles!events_host_id_fkey (
          id,
          full_name:name,
          slug,
          headline:role,
          avatar_color,
          avatar_url,
          has_pledged,
          ears_count
        )
      `)
      .eq('host_id', profileId)
      .order('datetime', { ascending: false });

    if (error) {
      logDbError('getUserHostedEvents', error);
      return [];
    }

    return (data as DbEventWithHost[]).map(mapEventFromDb);
  },

  // P406: Practice Rooms

  async getPracticeRooms(eventId: string): Promise<EventPracticeRoom[]> {
    log(' getPracticeRooms:', eventId);

    const now = new Date().toISOString();
    // P1057: the `session:clarity_sessions(code)` embed is gone — an embed is column-ACL'd
    // exactly like a direct select, so it would 42501 after the code gate and (because this
    // path swallows errors into an empty list) practice rooms would silently vanish from
    // event pages rather than fail loudly.
    const { data, error } = await supabase
      .from('event_practice_rooms')
      .select(`
        *,
        creator:profiles!event_practice_rooms_creator_id_fkey(name, slug, avatar_color, avatar_url)
      `)
      .eq('event_id', eventId)
      .in('status', ['waiting', 'active'])
      .gt('expires_at', now)
      .order('created_at', { ascending: true });

    if (error) {
      logDbError('getPracticeRooms', error);
      return [];
    }

    // [FOUNDER DECISION 2026-08-13, P1057 D-A] Practice-room codes stay published, scoped to
    // sessions that have an event_practice_rooms row. Publishing the capability to every
    // visitor of a public event page IS the P406 feature — nobody is being excluded, which
    // is the point of an event. This is a faithful port of the audience, not a tightening;
    // the accepted consequence is that event rooms gain nothing from P1057.
    const { data: codeRows, error: codeError } = await supabase.rpc('get_practice_room_codes', {
      p_event_id: eventId,
    });
    if (codeError) logDbError('getPracticeRooms.codes', codeError);
    const codeByRoomId = new Map<string, string>(
      ((codeRows ?? []) as { room_id: string; code: string }[]).map(r => [r.room_id, r.code]),
    );

    return (data ?? []).map((row: Record<string, unknown>) => {
      const creator = row.creator as { name: string | null; slug: string | null; avatar_color: string | null; avatar_url: string | null } | null;
      const session = { code: codeByRoomId.get(row.id as string) ?? null };
      return {
        id: row.id as string,
        eventId: row.event_id as string,
        creatorId: row.creator_id as string,
        sessionId: row.session_id as string | null,
        sessionCode: session?.code ?? null,
        status: row.status as 'waiting' | 'active' | 'closed',
        createdAt: row.created_at as string,
        expiresAt: row.expires_at as string,
        creatorName: creator?.name ?? 'Unknown',
        creatorSlug: creator?.slug ?? '',
        creatorAvatarColor: creator?.avatar_color ?? '#3B82F6',
        creatorAvatarUrl: creator?.avatar_url ?? null,
      };
    });
  },

  async openPracticeRoom(eventId: string, creatorId: string, sessionId: string, sessionCode: string): Promise<EventPracticeRoom> {
    log(' openPracticeRoom:', { eventId, creatorId, sessionId });

    // Close any existing waiting room for this creator+event first
    await supabase
      .from('event_practice_rooms')
      .update({ status: 'closed' })
      .eq('event_id', eventId)
      .eq('creator_id', creatorId)
      .eq('status', 'waiting');

    const { data, error } = await supabase
      .from('event_practice_rooms')
      .insert({
        event_id: eventId,
        creator_id: creatorId,
        session_id: sessionId,
        status: 'waiting',
      })
      // P1057: embed dropped. This is the creator's own INSERT and the caller minted the
      // session, so the code is spliced from the argument rather than read back.
      .select(`
        *,
        creator:profiles!event_practice_rooms_creator_id_fkey(name, slug, avatar_color, avatar_url)
      `)
      .single();

    if (error || !data) {
      throwDbError('openPracticeRoom', error, `Failed to open practice room: ${error?.message}`);
    }

    const creator = (data as Record<string, unknown>).creator as { name: string | null; slug: string | null; avatar_color: string | null; avatar_url: string | null } | null;
    const session = { code: sessionCode };
    const row = data as Record<string, unknown>;
    return {
      id: row.id as string,
      eventId: row.event_id as string,
      creatorId: row.creator_id as string,
      sessionId: row.session_id as string | null,
      sessionCode: session?.code ?? null,
      status: row.status as 'waiting' | 'active' | 'closed',
      createdAt: row.created_at as string,
      expiresAt: row.expires_at as string,
      creatorName: creator?.name ?? 'Unknown',
      creatorSlug: creator?.slug ?? '',
      creatorAvatarColor: creator?.avatar_color ?? '#3B82F6',
      creatorAvatarUrl: creator?.avatar_url ?? null,
    };
  },

  async closePracticeRoom(roomId: string): Promise<void> {
    log(' closePracticeRoom:', roomId);

    const { error } = await supabase
      .from('event_practice_rooms')
      .update({ status: 'closed' })
      .eq('id', roomId);

    if (error) {
      throwDbError('closePracticeRoom', error, `Failed to close practice room: ${error.message}`);
    }
  },

  async closePracticeRoomBySessionId(sessionId: string): Promise<void> {
    log(' closePracticeRoomBySessionId:', sessionId);

    const { error } = await supabase
      .from('event_practice_rooms')
      .update({ status: 'closed' })
      .eq('session_id', sessionId)
      .in('status', ['waiting', 'active']);

    if (error) {
      throwDbError('closePracticeRoomBySessionId', error, `Failed to close practice room: ${error.message}`);
    }
  },

  async getUpcomingPublicEvents(excludeProfileId: string, limit: number): Promise<EventWithHost[]> {
    log(' getUpcomingPublicEvents:', { excludeProfileId, limit });

    const graceCutoff = getGraceCutoff();

    // Get event IDs user is already RSVP'd to
    const { data: rsvps } = await supabase
      .from('event_rsvps')
      .select('event_id')
      .eq('profile_id', excludeProfileId);

    const rsvpEventIds = rsvps?.map(r => r.event_id) || [];

    // Get upcoming events user is NOT hosting and NOT RSVP'd to
    let query = supabase
      .from('events')
      .select(`
        *,
        host:profiles!events_host_id_fkey (
          id,
          full_name:name,
          slug,
          headline:role,
          avatar_color,
          avatar_url,
          has_pledged,
          ears_count
        )
      `)
      .gte('datetime', graceCutoff)
      .eq('status', 'upcoming')
      .neq('host_id', excludeProfileId)
      .order('datetime', { ascending: true })
      .limit(limit);

    // Exclude RSVP'd events if any
    if (rsvpEventIds.length > 0) {
      query = query.not('id', 'in', `(${rsvpEventIds.join(',')})`);
    }

    const { data, error } = await query;

    if (error) {
      logDbError('getUpcomingPublicEvents', error);
      return [];
    }

    return (data as DbEventWithHost[]).map(mapEventFromDb);
  },
};
