import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { renderMarkdownSafe } from '@/lib/markdown';
import { shareOrCopy } from '@/lib/utils';
import { toast } from 'sonner';
import {
  ArrowLeft,
  MapPin,
  Video,
  CheckCircle2,
  CalendarPlus,
  X,
  ChevronDown,
  Download,
  Pencil,
  Ban,
  Ear,
  RefreshCw,
  Share2,
} from 'lucide-react';
import { classifyLocation, getLocationDisplayLabel, safeLinkHref } from '../location-utils';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';
import { GroupChatBlock } from './GroupChatBlock';
import { Button } from '@/components/ui/button';
import { eventsService } from '@/app/data/events-service';
import { useAuth } from '@/auth';
import { useNavAuthState } from '@/hooks/use-nav-auth-state';
import { extractBannerKeywords } from '../banner-utils';
import { formatTime, downloadICSFile, getGoogleCalendarUrl, getOutlookUrl, getOffice365Url, getTimezoneLabel } from '../utils';
import { formatLocalDate, formatLocalTime } from '@/app/utils/format-time';
import type { EventWithHost, PersonRef } from '@/app/types';
import { ConfirmDialog } from '@/app/components/shared/confirm-dialog';
import { PersonRow } from '@/app/components/shared/PersonRow';
import { PersonAvatar } from '@/components/ui/person-avatar';
import { earTooltip } from '@/components/ui/ear-tooltip';
import { BannerDisplay, BannerControls, useBanner } from '@/app/components/shared/banner';
import { analytics } from '@/lib/mixpanel';

export function EventDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Real auth state
  const { user, session } = useAuth();
  const isLoggedIn = !!session;
  // P844: BottomNav renders only when showUserMenu (verified user, profile loaded).
  // We key the sticky-bar bottom offset on this, NOT isLoggedIn — otherwise during the
  // session-exists-but-profile-loading window the bar floats 64px above an absent BottomNav.
  const { showUserMenu } = useNavAuthState();

  // Async event loading
  const [event, setEvent] = useState<EventWithHost | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRsvpd, setIsRsvpd] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  // P1194: fetched separately from the event — the service returns null for anyone
  // who is not the host or registered, so this state never holds a value we hide.
  const [groupChatUrl, setGroupChatUrl] = useState<string | null>(null);

  // Fetch event and RSVP status
  useEffect(() => {
    async function fetchEvent() {
      if (!slug) {
        setLoading(false);
        return;
      }
      try {
        const eventData = await eventsService.getEventBySlug(slug);
        let rsvpd = false;
        if (eventData && isLoggedIn && user) {
          try {
            rsvpd = await eventsService.isUserRsvpd(eventData.id, user.id);
          } catch (rsvpError) {
            // RSVP check failed — degrade to not-RSVPed (gate shows) but don't discard the event.
            console.error('[EventDetail] Failed to check RSVP status:', rsvpError);
          }
        }
        // Batch both updates: avoids a flash where RSVPed users on online events
        // see the gated prompt between setEvent and setIsRsvpd resolving (P941).
        setEvent(eventData);
        setIsRsvpd(rsvpd);
      } catch (error) {
        console.error('[EventDetail] Failed to fetch event:', error);
      }
      setLoading(false);
    }
    fetchEvent();
  }, [slug, isLoggedIn, user?.id]);

  // P1194: group chat link. Separate effect (not folded into fetchEvent) so it
  // re-runs when RSVP state changes — a visitor who registers and comes back
  // from the confirm page must see the link without a hard reload.
  const eventId = event?.id;
  const isHostOfEvent = isLoggedIn && !!user && !!event && event.hostId === user.id;
  useEffect(() => {
    if (!eventId || (!isRsvpd && !isHostOfEvent)) {
      setGroupChatUrl(null);
      return;
    }
    let cancelled = false;
    eventsService.getEventGroupChatUrl(eventId)
      .then(url => { if (!cancelled) setGroupChatUrl(url); })
      .catch(error => {
        console.error('[EventDetail] Failed to fetch group chat link:', error);
      });
    return () => { cancelled = true; };
  }, [eventId, isRsvpd, isHostOfEvent]);

  // Local action states
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false);
  const calendarMenuRef = useRef<HTMLDivElement>(null);

  // Banner state — delegated to shared useBanner hook
  const saveBanner = useCallback(async (newUrl: string | null) => {
    if (!event) return;
    await eventsService.updateEvent(event.id, { bannerUrl: newUrl });
  }, [event]);

  const banner = useBanner({
    entityType: 'event',
    entityId: event?.id ?? '',
    initialBannerUrl: event?.bannerUrl ?? null,
    onSave: saveBanner,
  });

  // Confirm dialog states
  const [showCancelRsvpDialog, setShowCancelRsvpDialog] = useState(false);
  const [showCancelEventDialog, setShowCancelEventDialog] = useState(false);
  const [showUncancelEventDialog, setShowUncancelEventDialog] = useState(false);

  // Check if current user is the host
  const isHost = isLoggedIn && user && event?.hostId === user.id;

  // Close calendar menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (calendarMenuRef.current && !calendarMenuRef.current.contains(e.target as Node)) {
        setCalendarMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Show toast if user just signed up and was redirected here to RSVP
  useEffect(() => {
    if (searchParams.get('action') === 'rsvp' && isLoggedIn) {
      toast.success('Account created! Click "Reserve a seat" to confirm your spot.');
      // Clear the action param from URL
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, isLoggedIn]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Event Not Found</h1>
          <p className="text-muted-foreground mb-4">This event doesn't exist or has been removed.</p>
          <Link to="/events">
            <Button variant="outline">Back to Events</Button>
          </Link>
        </div>
      </div>
    );
  }

  const eventDate = new Date(event.datetime);
  const endDate = new Date(eventDate.getTime() + event.durationMinutes * 60 * 1000);
  const isPast = endDate < new Date();
  const isCancelled = event.status === 'cancelled';
  const isFull = eventsService.isEventFull(event);

  const handleRsvp = async (trigger: 'sticky_bar' | 'card') => {
    if (!event || isPast || (isFull && !isRsvpd)) return;
    analytics.track('event_rsvp_initiated', { event_id: event.id, trigger });

    if (!isLoggedIn || !user) {
      navigate('/signup?redirect=/events/' + slug + '&action=rsvp');
      return;
    }

    setIsActionLoading(true);
    const success = await eventsService.rsvpToEvent(event.id, user.id);
    setIsActionLoading(false);
    if (success) {
      setIsRsvpd(true);
      navigate(`/events/${slug}/confirm`);
    } else {
      toast.error('Couldn\'t sign you up. The event may be full or no longer available.');
    }
  };

  const handleCancelRsvp = () => {
    setShowCancelRsvpDialog(true);
  };

  const confirmCancelRsvp = async () => {
    if (!event || !user) return;
    setIsActionLoading(true);
    const success = await eventsService.cancelRsvp(event.id, user.id);
    setIsActionLoading(false);
    if (success) {
      setIsRsvpd(false);
    }
    setShowCancelRsvpDialog(false);
  };

  const handleCancelEvent = () => {
    setShowCancelEventDialog(true);
  };

  const confirmCancelEvent = async () => {
    if (!event) return;
    setIsActionLoading(true);
    const success = await eventsService.cancelEvent(event.id);
    setIsActionLoading(false);
    setShowCancelEventDialog(false);
    if (success) {
      toast.success('Event cancelled');
      navigate('/events');
    }
  };

  const confirmUncancelEvent = async () => {
    if (!event) return;
    setIsActionLoading(true);
    const success = await eventsService.uncancelEvent(event.id);
    setIsActionLoading(false);
    setShowUncancelEventDialog(false);
    if (success) {
      setEvent({ ...event, status: 'upcoming' });
      toast.success('Event is back on — attendees notified');
    } else {
      toast.error('Could not reinstate the event. Please try again.');
    }
  };

  const handleShare = async () => {
    const result = await shareOrCopy(event.title, window.location.href);
    if (result === 'copied') {
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } else if (result === 'failed') {
      toast.error('Could not copy link');
    }
    // 'shared' → native sheet handled it
    // 'dismissed' → user cancelled, no-op
  };

  // P844: RSVP affordance hidden for host and cancelled events (sticky bar, mobile inline card, desktop card all gated)
  const rsvpAffordanceHidden = !!isHost || isCancelled;

  // P844: Renders the RSVP action button — used in both desktop right-column card and mobile sticky bar
  const renderRsvpButton = (trigger: 'sticky_bar' | 'card') => {
    if (isPast) {
      return (
        <Button disabled className="w-full" size="lg" data-testid="rsvp-button">
          Event Ended
        </Button>
      );
    }
    if (isFull && !isRsvpd) {
      return (
        <Button disabled className="w-full" size="lg" data-testid="rsvp-button">
          Event Full
        </Button>
      );
    }
    return (
      <Button
        onClick={() => handleRsvp(trigger)}
        className="w-full bg-blue-500 hover:bg-blue-600 text-white"
        size="lg"
        disabled={isActionLoading}
        data-testid="rsvp-button"
      >
        {isActionLoading ? 'Joining...' : 'Reserve a seat'}
      </Button>
    );
  };

  // P844: RSVP'd confirmation card — used in both mobile inline and desktop right-column placements
  const renderRsvpGreenCard = () => (
    <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="w-6 h-6 text-green-600" />
        <div>
          <p className="font-semibold text-green-800">You're going!</p>
          <p className="text-sm text-green-700">See you there</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCancelRsvp}
        disabled={isActionLoading}
        className="text-muted-foreground hover:text-red-600 hover:bg-white/50"
      >
        <X className="w-4 h-4 mr-1" />
        Can't make it
      </Button>
    </div>
  );

  // Event data for calendar utilities
  const calendarEventData = {
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    slug: event.slug,
    startDate: eventDate,
    endDate: endDate,
  };

  const locationInfo = classifyLocation(event.location);
  const isVirtual = locationInfo.type === 'virtual';
  const locationGated = isVirtual && !isRsvpd && !isHost;
  const locationIsUrl = locationInfo.type === 'maps'
    || locationInfo.type === 'virtual'
    || event.location.startsWith('http');

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Banner image or gradient fallback, with host controls overlay */}
      <BannerDisplay
        bannerUrl={banner.bannerUrl}
        fallbackColor={isCancelled ? '#9ca3af' : event.hostAvatarColor}
        altText={event.title}
      >
        {isHost && (
          <BannerControls
            onRegenerate={banner.handleRegenerate}
            onRemove={banner.handleRemove}
            isLoading={banner.isLoading}
            hasBanner={!!banner.bannerUrl}
            showSearch={banner.showSearch}
            onSearch={banner.handleSearch}
            searchError={banner.searchError || undefined}
            defaultKeywords={extractBannerKeywords(event.title) || undefined}
          />
        )}
      </BannerDisplay>

      {/* Content - Two column layout on desktop */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* P76: Back link - conditional based on auth state */}
        <Link
          to="/events"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Events
        </Link>

        {/* P1114 REVISED 2026-08-21: the row sits directly under "← Back to Events",
            above the event card — the founder annotated "the menu should be here!"
            pointing here. Not a Radix Tabs component: "Details" is the only page
            state this component ever renders now, and "Join now" (round 4 second pass;
            was "Start event", itself replacing "View Principle" / "Clarity Principle"
            in earlier passes — decisions.md 2026-08-21) is a plain navigation (a real
            <Link>, not a tab selection) to the room's smart entry point — full screen,
            the same page a shared link already opens.

            "Join now" over "Start event": the room opens before the event too
            (docs/decisions.md 2026-08-21, "an invitation to join early") — "Start
            event" read as imperative and host-only to an attendee arriving days
            early. "Join now" holds across all three time states (before/during/after)
            without a host/participant mismatch, and avoids "room" entirely — the
            Practice Rooms card one level down inside /meet already owns that word
            ("+ Open a room"); reusing it here for the outer nav would collide (founder,
            round 4 second pass). Using a
            Tabs/TabsTrigger for a same-page-selection widget to drive a real route
            change doesn't fit Radix's model: onValueChange double-fires per click
            (focus activation + click) with no way to suppress the second call once
            the target value is permanently unselectable, and arrow-key roving focus
            would fire the same navigation. A plain styled Link has neither problem.
            Page-level nav uses the bare underline idiom (org-page.tsx), not a
            bg-card box.

            Links to /room, NOT /meet directly: /room (EventRoomGate) is the route
            that decides readiness-vs-principle — first-time visitor goes to /ready,
            return visit with readiness already set skips straight to /meet. Linking
            to /meet directly bypasses that decision and always skips the readiness
            question, even for a first-time visitor (founder repro, 2026-08-21: a
            fresh account went straight to the principle page and never saw the
            slider). */}
        <div className="mb-6 flex w-full items-center justify-start gap-6 overflow-x-auto border-b border-border">
          <span className="inline-flex min-h-[44px] items-center whitespace-nowrap border-b-2 border-blue-500 px-1 pb-3 text-base font-medium text-foreground">
            Details
          </span>
          <Link
            to={`/events/${slug}/room`}
            className="inline-flex min-h-[44px] items-center whitespace-nowrap border-b-2 border-transparent px-1 pb-3 text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Join now
          </Link>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Column - Event Details */}
          <div className="flex-1">
            <div className={`bg-card rounded-xl border shadow-sm p-6 mb-6 ${isCancelled ? 'border-red-200' : 'border-border'}`}>
              {/* Title + Share */}
              <div className="flex items-start justify-between gap-2 mb-4">
                <h1 className="text-2xl md:text-3xl font-bold">{event.title}</h1>
                <button
                  onClick={handleShare}
                  className="flex-shrink-0 flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors mt-1.5"
                  aria-label="Share event"
                >
                  <Share2 className="w-4 h-4" />
                  <span className="text-xs">{copyState === 'copied' ? 'Copied!' : 'Share'}</span>
                </button>
              </div>

              {/* Cancellation Notice - inside card for better UX */}
              {isCancelled && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <Ban className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-red-800">This event has been cancelled</p>
                      <p className="text-sm text-red-600 mt-1">
                        {isHost
                          ? 'You cancelled this event. Attendees have been notified.'
                          : 'The organizer cancelled this event. We apologize for any inconvenience.'}
                      </p>
                      {isHost && !isPast && (
                        <div className="mt-3 flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowUncancelEventDialog(true)}
                            disabled={isActionLoading}
                            className="gap-1.5 bg-white border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Uncancel Event
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Host Controls - right after title for immediate visibility */}
              {isHost && !isPast && !isCancelled && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-900">You're hosting this event</span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/events/${slug}/edit`)}
                        className="gap-1.5 bg-white"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCancelEvent}
                        disabled={isActionLoading}
                        className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 bg-white"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Cancel Event
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Date & Time */}
              <div className="flex items-center gap-3 mb-3 text-muted-foreground">
                <CalendarPlus className="w-5 h-5" />
                <div>
                  {(() => {
                    const displayTz = isVirtual
                      ? (Intl.DateTimeFormat().resolvedOptions().timeZone || event.timezone)
                      : event.timezone;
                    const tzLabel = isVirtual
                      ? (displayTz.split("/").pop()?.replace(/_/g, " ") ?? "local") + " time"
                      : getTimezoneLabel(event.timezone || 'America/Los_Angeles');
                    return (
                      <>
                        <span className="font-medium text-foreground">
                          {formatLocalDate(eventDate, { showYear: true, timeZone: displayTz })}
                        </span>
                        <span className="mx-2">·</span>
                        <span>
                          {formatLocalTime(eventDate, { timeZone: displayTz })} - {formatLocalTime(endDate, { timeZone: displayTz })} ({tzLabel})
                        </span>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Location — gated for online events pre-RSVP (P941) */}
              {locationGated ? (
                <div className="flex items-center gap-3 mb-4 text-muted-foreground" data-testid="location-gated">
                  <Video className="w-5 h-5 flex-shrink-0" />
                  {/* [FOUNDER DECISION: exact string — spec suggests "Register to receive the meeting link"] */}
                  <span className="text-sm">Register to receive the meeting link</span>
                </div>
              ) : (
                <a
                  href={safeLinkHref(locationInfo.href)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 mb-4 text-muted-foreground hover:text-blue-600 transition-colors group"
                  data-testid="location-link"
                >
                  {locationInfo.type === 'virtual'
                    ? <Video className="w-5 h-5 flex-shrink-0" />
                    : <MapPin className="w-5 h-5 flex-shrink-0" />
                  }
                  <span className={`group-hover:underline${locationIsUrl ? ' truncate min-w-0' : ''}`}>
                    {getLocationDisplayLabel(locationInfo, event.location)}
                  </span>
                </a>
              )}

              {/* Add to Calendar — hidden pre-RSVP for online events (link would be embedded; P941) */}
              {!isPast && !isCancelled && !locationGated && (
                <div className="relative mb-6" ref={calendarMenuRef}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCalendarMenuOpen(!calendarMenuOpen)}
                    className="gap-2"
                  >
                    <CalendarPlus className="w-4 h-4" />
                    Add to Calendar
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                  {calendarMenuOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-20 overflow-hidden min-w-[200px]">
                      <a
                        href={getGoogleCalendarUrl(calendarEventData)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors"
                        onClick={() => setCalendarMenuOpen(false)}
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Google Calendar
                      </a>
                      <a
                        href={getOutlookUrl(calendarEventData)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors"
                        onClick={() => setCalendarMenuOpen(false)}
                      >
                        {/* Outlook logo */}
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                          <path d="M12 2L2 5v14l10 3V2z" fill="#0078D4"/>
                          <ellipse cx="7" cy="12" rx="3" ry="4" fill="#fff"/>
                          <path d="M13 7h9v10h-9V7z" fill="#0078D4"/>
                          <path d="M22 8v8l-4-2.5V10.5L22 8z" fill="#1490DF"/>
                          <path d="M13 7h5v10h-5V7z" fill="#28A8EA"/>
                        </svg>
                        Outlook.com
                      </a>
                      <a
                        href={getOffice365Url(calendarEventData)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors"
                        onClick={() => setCalendarMenuOpen(false)}
                      >
                        {/* Microsoft 365 logo */}
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                          <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
                          <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
                          <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
                          <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
                        </svg>
                        Microsoft 365
                      </a>
                      <button
                        onClick={() => {
                          downloadICSFile(calendarEventData);
                          setCalendarMenuOpen(false);
                        }}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors w-full text-left border-t border-border"
                      >
                        <Download className="w-5 h-5 text-muted-foreground" />
                        Download .ics file
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* P844: Desktop RSVP — above the description, above the fold, in the natural reading flow.
                  Mobile uses the sticky bottom bar (non-RSVP'd) + inline green card after description (RSVP'd). */}
              {!rsvpAffordanceHidden && (
                <div className="hidden lg:block mb-6">
                  {isRsvpd ? renderRsvpGreenCard() : renderRsvpButton('card')}
                </div>
              )}

              {/* Description - Markdown rendered (safe renderer strips raw HTML to prevent XSS) */}
              <div
                className="prose prose-sm max-w-none text-muted-foreground mb-6 pt-4 border-t border-border"
                dangerouslySetInnerHTML={{ __html: renderMarkdownSafe(event.description) }}
              />

              {/* P1194: the group chat, after the description and before the RSVP
                  confirmation — a button rather than a link buried in the body copy. */}
              {!isPast && !isCancelled && (
                <div className="mb-6">
                <GroupChatBlock
                  url={groupChatUrl}
                  showLockedState={!!event.hasGroupChat && !isRsvpd && !isHostOfEvent}
                />
                </div>
              )}

              {/* P844: Mobile RSVP'd green card — inline, mobile only. Desktop renders it in right column. */}
              {!isHost && !isCancelled && isRsvpd && (
                <div className="lg:hidden">
                  {renderRsvpGreenCard()}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Organizer & Participants */}
          <div className="lg:w-96 lg:flex-shrink-0 space-y-6">
            {/* Organizer Card */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-6">
              <h2 className="font-semibold text-sm text-muted-foreground mb-4">Event Organizer</h2>

              <Link
                to={`/p/${event.hostSlug}`}
                className="flex flex-col items-center text-center w-full p-3 -m-3 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <PersonAvatar
                  person={{
                    name: event.hostName,
                    slug: event.hostSlug,
                    avatarColor: event.hostAvatarColor,
                    avatarUrl: event.hostAvatarUrl,
                    hasPledged: event.hostHasPledged ?? false,
                  } satisfies PersonRef}
                  size="lg"
                  className="mb-2"
                />
                <div className="flex items-center justify-center gap-1.5">
                  <p className="font-semibold">{event.hostName}</p>
                  <MobileTooltip content={earTooltip(event.hostEarCount ?? 0, event.hostName)}>
                    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5">
                      <Ear size={12} />
                      {event.hostEarCount ?? 0}
                    </span>
                  </MobileTooltip>
                </div>
                <p className="text-sm text-muted-foreground">{event.hostRole}</p>
              </Link>
            </div>

            {/* Participants Card */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-6">
              <h2 className="font-semibold text-sm text-muted-foreground mb-4">
                Participants ({(event.attendees ?? []).length}{event.maxAttendees ? `/${event.maxAttendees}` : ''})
              </h2>
              <div className="space-y-2">
                {(event.attendees ?? []).map(attendee => (
                  <PersonRow
                    key={attendee.profileId}
                    profileId={attendee.profileId}
                    slug={attendee.slug}
                    name={attendee.name}
                    avatarColor={attendee.avatarColor}
                    avatarUrl={attendee.avatarUrl}
                    isPledger={attendee.hasPledged}
                    earCount={attendee.earCount}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Bottom padding — mobile needs ~136px clearance (sticky bar ~72px + BottomNav 64px) when bar renders.
          h-* sets height on this empty div; pb-* would have no visible effect because there's no content to push. */}
      <div className={!rsvpAffordanceHidden && !isRsvpd ? 'h-36 lg:h-12' : 'h-12'} />

      {/* P844: Sticky mobile RSVP bar — fixed bottom, above BottomNav. Hidden on desktop, when RSVP'd, host, or cancelled. */}
      {!rsvpAffordanceHidden && !isRsvpd && (
        <div
          role="region"
          aria-label="Event registration"
          className={`lg:hidden fixed left-0 right-0 z-50 bg-background border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.08)] px-4 py-3 ${
            showUserMenu
              ? 'bottom-16'
              : 'bottom-0 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]'
          }`}
          data-testid="rsvp-sticky-bar"
        >
          {renderRsvpButton('sticky_bar')}
        </div>
      )}

      {/* Cancel RSVP Confirmation Dialog */}
      <ConfirmDialog
        open={showCancelRsvpDialog}
        onOpenChange={setShowCancelRsvpDialog}
        title="Can't make it?"
        description="You'll be removed from the guest list. You can always join again if spots are available."
        confirmLabel="I can't go"
        cancelLabel="I'm still going"
        variant="destructive"
        onConfirm={confirmCancelRsvp}
        isLoading={isActionLoading}
      />

      {/* Cancel Event Confirmation Dialog */}
      <ConfirmDialog
        open={showCancelEventDialog}
        onOpenChange={setShowCancelEventDialog}
        title="Cancel this event?"
        description="All attendees will be notified and removed from the guest list. This action cannot be undone."
        confirmLabel="Cancel Event"
        cancelLabel="Keep Event"
        variant="destructive"
        onConfirm={confirmCancelEvent}
        isLoading={isActionLoading}
      />

      {/* Uncancel Event Confirmation Dialog */}
      <ConfirmDialog
        open={showUncancelEventDialog}
        onOpenChange={setShowUncancelEventDialog}
        title="Reinstate this event?"
        description="All attendees will receive a re-announcement email with the current event details."
        confirmLabel="Yes, Uncancel"
        cancelLabel="Keep Cancelled"
        variant="default"
        onConfirm={confirmUncancelEvent}
        isLoading={isActionLoading}
      />

    </div>
  );
}
