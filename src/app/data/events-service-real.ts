import type { EventsService, CreateEventInput, UpdateEventInput } from './events-service.interface';
import type { EventWithHost, EventAttendee, EventSubRoomWithProfiles, SubRoomStatus } from '@/app/types';
import { supabase } from '@/lib/supabase';
import { createClaritySession, joinClaritySession } from './api';

// Debug logging - only in development
const DEBUG = import.meta.env.DEV;
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
  host: {
    id: string;
    full_name: string | null;
    slug: string | null;
    headline: string | null;
    avatar_color: string | null;
    avatar_url: string | null;
    has_pledged: boolean | null; // P118: Host pledge status
  } | null;
}

// Database row type for sub-rooms with joined profiles
interface DbSubRoomWithProfiles {
  id: string;
  event_id: string;
  session_id: string | null;
  initiator_id: string;
  target_id: string;
  status: SubRoomStatus;
  created_at: string;
  expires_at: string;
  session: { code: string } | null;
  initiator: {
    id: string;
    full_name: string | null;
    slug: string | null;
    avatar_color: string | null;
    avatar_url: string | null;
  } | null;
  target: {
    id: string;
    full_name: string | null;
    slug: string | null;
    avatar_color: string | null;
    avatar_url: string | null;
  } | null;
}

function mapSubRoomFromDb(row: DbSubRoomWithProfiles): EventSubRoomWithProfiles {
  return {
    id: row.id,
    eventId: row.event_id,
    sessionId: row.session_id,
    sessionCode: row.session?.code ?? null,
    initiatorId: row.initiator_id,
    targetId: row.target_id,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    initiatorName: row.initiator?.full_name ?? 'Unknown',
    initiatorSlug: row.initiator?.slug ?? '',
    initiatorAvatarColor: row.initiator?.avatar_color ?? '#3B82F6',
    initiatorAvatarUrl: row.initiator?.avatar_url ?? undefined,
    targetName: row.target?.full_name ?? 'Unknown',
    targetSlug: row.target?.slug ?? '',
    targetAvatarColor: row.target?.avatar_color ?? '#3B82F6',
    targetAvatarUrl: row.target?.avatar_url ?? undefined,
  };
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
  } | null;
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
    // Attendees fetched separately - components should call getEventAttendees()
    attendees: [],
    attendeeCount: 0,
  };
}

/**
 * Generate URL-friendly slug from title and date
 */
function generateSlug(title: string): string {
  const dateStr = new Date().toISOString().split('T')[0];
  const titleSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const randomSuffix = Math.random().toString(36).slice(2, 6);
  return `${titleSlug}-${dateStr}-${randomSuffix}`;
}

export const realEventsService: EventsService = {
  async getUpcomingEvents(): Promise<EventWithHost[]> {
    log(' getUpcomingEvents');

    const now = new Date().toISOString();
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
          has_pledged
        )
      `)
      .gte('datetime', now)
      .in('status', ['upcoming', 'cancelled'])  // Include cancelled future events
      .order('datetime', { ascending: true });

    if (error) {
      log('ERROR: getUpcomingEvents error:', error);
      return [];
    }

    // Fetch attendee counts for all events
    const events = (data as DbEventWithHost[]).map(mapEventFromDb);

    // Get attendee counts in batch
    const eventIds = events.map(e => e.id);
    if (eventIds.length > 0) {
      const { data: rsvpCounts } = await supabase
        .from('event_rsvps')
        .select('event_id')
        .in('event_id', eventIds);

      if (rsvpCounts) {
        const countMap = rsvpCounts.reduce((acc, rsvp) => {
          acc[rsvp.event_id] = (acc[rsvp.event_id] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        events.forEach(event => {
          event.attendeeCount = countMap[event.id] || 0;
        });
      }
    }

    return events;
  },

  async getPastEvents(): Promise<EventWithHost[]> {
    log(' getPastEvents');

    const now = new Date().toISOString();
    // Past events: completed status OR (cancelled AND past datetime)
    // This excludes upcoming events and cancelled future events
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
          has_pledged
        )
      `)
      .or(`status.eq.completed,and(status.eq.cancelled,datetime.lt.${now})`)
      .order('datetime', { ascending: false });

    if (error) {
      log('ERROR: getPastEvents error:', error);
      return [];
    }

    return (data as DbEventWithHost[]).map(mapEventFromDb);
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
          has_pledged
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
          has_pledged
        )
      `)
      .eq('event_id', eventId);

    if (error || !data) {
      log('ERROR: getEventAttendees error:', error);
      return [];
    }

    return (data as DbRsvpWithProfile[]).map(rsvp => ({
      profileId: rsvp.profile_id,
      name: rsvp.profile?.full_name ?? 'Unknown',
      slug: rsvp.profile?.slug ?? '',
      avatarColor: rsvp.profile?.avatar_color ?? '#3B82F6',
      avatarUrl: rsvp.profile?.avatar_url ?? undefined,
      hasPledged: rsvp.profile?.has_pledged ?? false,
    }));
  },

  async isUserRsvpd(eventId: string, profileId: string): Promise<boolean> {
    log(' isUserRsvpd:', { eventId, profileId });

    const { data, error } = await supabase
      .from('event_rsvps')
      .select('id')
      .eq('event_id', eventId)
      .eq('profile_id', profileId)
      .single();

    if (error) {
      // PGRST116 = not found, which is expected when not RSVP'd
      return false;
    }

    return !!data;
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

    const slug = generateSlug(data.title);

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
          has_pledged
        )
      `)
      .single();

    if (error || !created) {
      log('ERROR: createEvent error:', error);
      return null;
    }

    return mapEventFromDb(created as DbEventWithHost);
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

    // Only allow update if user is the host (authorization check)
    const { error, data: updated } = await supabase
      .from('events')
      .update(updateData)
      .eq('id', eventId)
      .eq('host_id', user.id)
      .select('id');

    if (error) {
      log('ERROR: updateEvent error:', error);
      return false;
    }

    // If no rows updated, user wasn't the host or event not found
    if (!updated || updated.length === 0) {
      log('ERROR: updateEvent: User is not the host or event not found');
      return false;
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
      log('ERROR: cancelEvent error:', error);
      return false;
    }

    // If no rows updated, user wasn't the host or event not found
    if (!updated || updated.length === 0) {
      log('ERROR: cancelEvent: User is not the host or event not found');
      return false;
    }

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
        log('ERROR: rsvpToEvent: Count error', countError);
        return false;
      }

      if ((count ?? 0) >= event.max_attendees) {
        log(' rsvpToEvent: Event is full');
        return false;
      }
    }

    // Insert RSVP
    const { error } = await supabase
      .from('event_rsvps')
      .insert({
        event_id: eventId,
        profile_id: profileId,
      });

    if (error) {
      // 23505 = unique violation (already RSVP'd)
      log('ERROR: rsvpToEvent error:', error);
      return false;
    }

    return true;
  },

  async cancelRsvp(eventId: string, profileId: string): Promise<boolean> {
    log(' cancelRsvp:', { eventId, profileId });

    const { error } = await supabase
      .from('event_rsvps')
      .delete()
      .eq('event_id', eventId)
      .eq('profile_id', profileId);

    if (error) {
      log('ERROR: cancelRsvp error:', error);
      return false;
    }

    return true;
  },

  // P62: Dashboard queries

  async getUserNextEvent(profileId: string): Promise<EventWithHost | null> {
    log(' getUserNextEvent:', profileId);

    const now = new Date().toISOString();

    // First, get event IDs where user is RSVP'd
    const { data: rsvps, error: rsvpError } = await supabase
      .from('event_rsvps')
      .select('event_id')
      .eq('profile_id', profileId);

    if (rsvpError) {
      log('ERROR: getUserNextEvent rsvp error:', rsvpError);
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
          has_pledged
        )
      `)
      .gte('datetime', now)
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
          has_pledged
        )
      `)
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      log('ERROR: getPeopleFromEvent event error:', eventError);
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
          has_pledged
        )
      `)
      .eq('event_id', eventId)
      .neq('profile_id', excludeProfileId);

    if (rsvpError) {
      log('ERROR: getPeopleFromEvent rsvp error:', rsvpError);
      return [];
    }

    const attendees: EventAttendee[] = (rsvps as DbRsvpWithProfile[]).map(rsvp => ({
      profileId: rsvp.profile_id,
      name: rsvp.profile?.full_name ?? 'Unknown',
      slug: rsvp.profile?.slug ?? '',
      avatarColor: rsvp.profile?.avatar_color ?? '#3B82F6',
      avatarUrl: rsvp.profile?.avatar_url ?? undefined,
      hasPledged: rsvp.profile?.has_pledged ?? false,
    }));

    // Include host if they're not the excluded user
    const eventWithHost = event as { host_id: string; host: { id: string; full_name: string | null; slug: string | null; avatar_color: string | null; avatar_url: string | null; has_pledged: boolean | null } | null };
    if (eventWithHost.host_id !== excludeProfileId && eventWithHost.host) {
      attendees.unshift({
        profileId: eventWithHost.host_id,
        name: eventWithHost.host.full_name ?? 'Unknown',
        slug: eventWithHost.host.slug ?? '',
        avatarColor: eventWithHost.host.avatar_color ?? '#3B82F6',
        avatarUrl: eventWithHost.host.avatar_url ?? undefined,
        hasPledged: eventWithHost.host.has_pledged ?? false,
      });
    }

    return attendees;
  },

  async getUserRegisteredEvents(profileId: string): Promise<EventWithHost[]> {
    log(' getUserRegisteredEvents:', profileId);

    const now = new Date().toISOString();

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

    // Get upcoming events user is attending (not hosting)
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
          has_pledged
        )
      `)
      .in('id', eventIds)
      .neq('host_id', profileId)
      .gte('datetime', now)
      .eq('status', 'upcoming')
      .order('datetime', { ascending: true });

    if (error) {
      log('ERROR: getUserRegisteredEvents error:', error);
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
          has_pledged
        )
      `)
      .eq('host_id', profileId)
      .order('datetime', { ascending: false });

    if (error) {
      log('ERROR: getUserHostedEvents error:', error);
      return [];
    }

    return (data as DbEventWithHost[]).map(mapEventFromDb);
  },

  async getUpcomingPublicEvents(excludeProfileId: string, limit: number): Promise<EventWithHost[]> {
    log(' getUpcomingPublicEvents:', { excludeProfileId, limit });

    const now = new Date().toISOString();

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
          has_pledged
        )
      `)
      .gte('datetime', now)
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
      log('ERROR: getUpcomingPublicEvents error:', error);
      return [];
    }

    return (data as DbEventWithHost[]).map(mapEventFromDb);
  },

  // ============================================================================
  // P124: Event Sub-Rooms
  // ============================================================================

  async getEventSubRooms(eventId: string): Promise<EventSubRoomWithProfiles[]> {
    log(' getEventSubRooms:', eventId);

    // Only fetch non-terminal sub-rooms (pending, active, recently completed)
    // Expired and cancelled sub-rooms are not useful for the event page
    const { data, error } = await supabase
      .from('event_sub_rooms')
      .select(`
        *,
        session:clarity_sessions!event_sub_rooms_session_id_fkey (
          code
        ),
        initiator:profiles!event_sub_rooms_initiator_id_fkey (
          id,
          full_name:name,
          slug,
          avatar_color,
          avatar_url
        ),
        target:profiles!event_sub_rooms_target_id_fkey (
          id,
          full_name:name,
          slug,
          avatar_color,
          avatar_url
        )
      `)
      .eq('event_id', eventId)
      .in('status', ['pending', 'active', 'completed'])
      .order('created_at', { ascending: false });

    if (error) {
      log('ERROR: getEventSubRooms error:', error);
      return [];
    }

    // Client-side expiry check: treat pending sub-rooms past expires_at as expired
    const now = new Date();
    const mapped = (data as DbSubRoomWithProfiles[]).map(mapSubRoomFromDb);
    return mapped.filter(room => {
      if (room.status === 'pending' && new Date(room.expiresAt) < now) {
        log(' getEventSubRooms: Filtering expired pending sub-room:', room.id);
        return false;
      }
      return true;
    });
  },

  async createSubRoom(eventId: string, targetId: string): Promise<EventSubRoomWithProfiles | null> {
    log(' createSubRoom:', { eventId, targetId });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      log('ERROR: createSubRoom: No authenticated user');
      return null;
    }

    const { data, error } = await supabase
      .from('event_sub_rooms')
      .insert({
        event_id: eventId,
        initiator_id: user.id,
        target_id: targetId,
      })
      .select(`
        *,
        session:clarity_sessions!event_sub_rooms_session_id_fkey (
          code
        ),
        initiator:profiles!event_sub_rooms_initiator_id_fkey (
          id,
          full_name:name,
          slug,
          avatar_color,
          avatar_url
        ),
        target:profiles!event_sub_rooms_target_id_fkey (
          id,
          full_name:name,
          slug,
          avatar_color,
          avatar_url
        )
      `)
      .single();

    if (error) {
      // 23505 = unique violation (target already in a session)
      if (error.code === '23505') {
        log(' createSubRoom: Target already in an active session');
      } else {
        log('ERROR: createSubRoom error:', error);
      }
      return null;
    }

    return mapSubRoomFromDb(data as DbSubRoomWithProfiles);
  },

  async joinSubRoom(subRoomId: string): Promise<{ sessionCode: string } | null> {
    log(' joinSubRoom:', subRoomId);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      log('ERROR: joinSubRoom: No authenticated user');
      return null;
    }

    // Get the sub-room to verify target and get initiator info
    const { data: subRoom, error: fetchError } = await supabase
      .from('event_sub_rooms')
      .select('*, initiator:profiles!event_sub_rooms_initiator_id_fkey (name)')
      .eq('id', subRoomId)
      .eq('target_id', user.id)
      .eq('status', 'pending')
      .single();

    if (fetchError || !subRoom) {
      log('ERROR: joinSubRoom: Sub-room not found or not pending:', fetchError);
      return null;
    }

    // Get user's profile name for session creation
    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .single();

    const userName = profile?.name ?? 'Unknown';
    const initiatorName = (subRoom as { initiator: { name: string } | null }).initiator?.name ?? 'Unknown';

    // STEP 1: Claim the sub-room by setting status to 'active' (without session yet).
    // This is the race guard: if another action (cancel/expiry) already changed the
    // status, the WHERE clause won't match and 0 rows update — no orphaned session.
    const { data: claimed, error: claimError } = await supabase
      .from('event_sub_rooms')
      .update({ status: 'active' })
      .eq('id', subRoomId)
      .eq('status', 'pending')
      .select('id');

    if (claimError) {
      log('ERROR: joinSubRoom: Failed to claim sub-room:', claimError);
      return null;
    }

    if (!claimed || claimed.length === 0) {
      log('ERROR: joinSubRoom: Sub-room no longer pending (race condition)');
      return null;
    }

    // STEP 2: Now that we own the sub-room, create the clarity session safely.
    const session = await createClaritySession(initiatorName, subRoom.initiator_id);

    // STEP 3: Link the session to the sub-room.
    const { error: linkError } = await supabase
      .from('event_sub_rooms')
      .update({ session_id: session.id })
      .eq('id', subRoomId);

    if (linkError) {
      log('ERROR: joinSubRoom: Failed to link session to sub-room:', linkError);
      // Session was created but link failed. Continue so the joiner can still navigate.
      // Initiator won't auto-navigate (no sessionCode in real-time update) but will see
      // the sub-room go active. Acceptable degradation vs. leaving both users stuck.
    }

    // STEP 4: Join the clarity session as the target.
    await joinClaritySession(session.code, userName, user.id);

    log(' joinSubRoom: Created session', session.code);
    return { sessionCode: session.code };
  },

  async cancelSubRoom(subRoomId: string): Promise<boolean> {
    log(' cancelSubRoom:', subRoomId);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      log('ERROR: cancelSubRoom: No authenticated user');
      return false;
    }

    // Only participants can cancel; RLS enforces this too, but check explicitly
    const { data: updated, error } = await supabase
      .from('event_sub_rooms')
      .update({ status: 'cancelled' })
      .eq('id', subRoomId)
      .in('status', ['pending'])
      .or(`initiator_id.eq.${user.id},target_id.eq.${user.id}`)
      .select('id');

    if (error) {
      log('ERROR: cancelSubRoom error:', error);
      return false;
    }

    if (!updated || updated.length === 0) {
      log('ERROR: cancelSubRoom: No matching sub-room (wrong user or not pending)');
      return false;
    }

    return true;
  },

  async completeSubRoom(subRoomId: string): Promise<boolean> {
    log(' completeSubRoom:', subRoomId);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      log('ERROR: completeSubRoom: No authenticated user');
      return false;
    }

    // Only participants can complete; RLS enforces this too, but check explicitly
    const { data: updated, error } = await supabase
      .from('event_sub_rooms')
      .update({ status: 'completed' })
      .eq('id', subRoomId)
      .in('status', ['active'])
      .or(`initiator_id.eq.${user.id},target_id.eq.${user.id}`)
      .select('id');

    if (error) {
      log('ERROR: completeSubRoom error:', error);
      return false;
    }

    if (!updated || updated.length === 0) {
      log('ERROR: completeSubRoom: No matching sub-room (wrong user or not active)');
      return false;
    }

    return true;
  },
};
