import type { EventsService, CreateEventInput, UpdateEventInput } from './events-service.interface';
import type { EventWithHost, EventAttendee, EventPracticeRoom } from '@/app/types';
import { supabase } from '@/lib/supabase';

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

  // P406: Practice Rooms

  async getPracticeRooms(eventId: string): Promise<EventPracticeRoom[]> {
    log(' getPracticeRooms:', eventId);

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('event_practice_rooms')
      .select(`
        *,
        creator:profiles!event_practice_rooms_creator_id_fkey(name, slug, avatar_color, avatar_url),
        session:clarity_sessions!event_practice_rooms_session_id_fkey(code)
      `)
      .eq('event_id', eventId)
      .in('status', ['waiting', 'active'])
      .gt('expires_at', now)
      .order('created_at', { ascending: true });

    if (error) {
      log('ERROR: getPracticeRooms error:', error);
      return [];
    }

    return (data ?? []).map((row: Record<string, unknown>) => {
      const creator = row.creator as { name: string | null; slug: string | null; avatar_color: string | null; avatar_url: string | null } | null;
      const session = row.session as { code: string } | null;
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

  async openPracticeRoom(eventId: string, creatorId: string, sessionId: string): Promise<EventPracticeRoom> {
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
      .select(`
        *,
        creator:profiles!event_practice_rooms_creator_id_fkey(name, slug, avatar_color, avatar_url),
        session:clarity_sessions!event_practice_rooms_session_id_fkey(code)
      `)
      .single();

    if (error || !data) {
      log('ERROR: openPracticeRoom error:', error);
      throw new Error(`Failed to open practice room: ${error?.message}`);
    }

    const creator = (data as Record<string, unknown>).creator as { name: string | null; slug: string | null; avatar_color: string | null; avatar_url: string | null } | null;
    const session = (data as Record<string, unknown>).session as { code: string } | null;
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
      log('ERROR: closePracticeRoom error:', error);
      throw new Error(`Failed to close practice room: ${error.message}`);
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
      log('ERROR: closePracticeRoomBySessionId error:', error);
      throw new Error(`Failed to close practice room: ${error.message}`);
    }
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
};
