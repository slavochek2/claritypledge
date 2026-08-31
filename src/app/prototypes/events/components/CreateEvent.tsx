import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, MapPin, FileText, Globe } from 'lucide-react';
import { LocationHint } from './LocationHint';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/auth';
import { eventsService } from '@/app/data/events-service';
import { organizationsService } from '@/app/data/organizations-service';
import type { Organization } from '@/app/data/organizations-service.interface';
import { DURATIONS, TIMEZONES } from '../utils';

export function CreateEvent() {
  const navigate = useNavigate();
  const { session, isLoading } = useAuth();
  const isAuthenticated = !!session;

  // Form state
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('18:00');
  // Default to user's timezone, fallback to America/Los_Angeles
  const [timezone, setTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'America/Los_Angeles';
    }
  });
  const [durationMinutes, setDurationMinutes] = useState(120); // 2 hours default
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /**
   * P1060: `/events/new?org=<slug>` — the org page's Host Event link carries the
   * organization forward so the created event belongs to it. Before this, the
   * parameter was appended and never read, so hosting from a group page filed an
   * unaffiliated event.
   *
   * The slug is URL-supplied and therefore untrusted. It is resolved to an id here
   * ONLY to render the context line and to send a real id; the authorization decision
   * is NOT made here. The database trigger (events_org_requires_organizer) is what
   * refuses an event whose org the host does not organize. This state is a
   * convenience, never a permission.
   *
   * `undefined` = not yet resolved. `null` = no org, or a slug that resolved to
   * nothing, or the caller is not an organizer of it — all three collapse to "create
   * a standalone event", which is always allowed.
   */
  const [searchParams] = useSearchParams();
  const orgSlugParam = searchParams.get('org');
  const [hostingOrg, setHostingOrg] = useState<Organization | null | undefined>(
    orgSlugParam ? undefined : null,
  );

  useEffect(() => {
    if (!orgSlugParam) { setHostingOrg(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const org = await organizationsService.getOrganizationBySlug(orgSlugParam);
        if (cancelled) return;
        if (!org) { setHostingOrg(null); return; }
        // Only claim the org if this user actually organizes it. A non-organizer who
        // edits the URL gets a plain standalone event rather than a submit the
        // database will reject — the failure is prevented, not merely reported.
        const membership = await organizationsService.getMyMembership(org.id);
        setHostingOrg(membership?.role === 'organizer' ? org : null);
      } catch (err) {
        // Never block event creation on this lookup: falling back to a standalone
        // event is the safe, always-permitted outcome.
        console.error('Failed to resolve hosting organization', err);
        if (!cancelled) setHostingOrg(null);
      }
    })();
    return () => { cancelled = true; };
  }, [orgSlugParam]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Redirect if not logged in
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Sign Up to Host Events</h1>
          <p className="text-muted-foreground mb-4">You need an account to host events.</p>
          <Link to="/signup">
            <Button className="bg-blue-500 hover:bg-blue-600 text-white">Sign Up</Button>
          </Link>
        </div>
      </div>
    );
  }

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!title.trim() || title.length < 5) {
      newErrors.title = 'Title must be at least 5 characters';
    }
    if (!date) {
      newErrors.date = 'Please select a date';
    } else {
      const selectedDate = new Date(date + 'T' + time);
      if (selectedDate <= new Date()) {
        newErrors.date = 'Event must be in the future';
      }
    }
    if (!location.trim() || location.length < 3) {
      newErrors.location = 'Please enter a location';
    }
    if (!description.trim() || description.length < 20) {
      newErrors.description = 'Description must be at least 20 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);

    // Combine date and time into ISO datetime string
    const datetime = new Date(`${date}T${time}:00`).toISOString();

    // Create event via service
    const newEvent = await eventsService.createEvent({
      title,
      description,
      datetime,
      durationMinutes,
      timezone,
      location,
      // null unless the caller is a verified organizer of a real org (see above).
      orgId: hostingOrg?.id ?? null,
    });

    setIsSubmitting(false);

    if (newEvent) {
      // Navigate to the new event
      navigate(`/events/${newEvent.slug}?created=true`);
    } else {
      // Handle error (shouldn't happen with mock, but good practice)
      setErrors({
        submit: hostingOrg
          ? `Failed to create event in ${hostingOrg.name}. Please try again.`
          : 'Failed to create event. Please try again.',
      });
    }
  };

  // Get tomorrow's date for min date attribute
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-background">
      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-6" data-testid="create-event-form">
        {/* Back link and title */}
        <div className="mb-6">
          <Link
            to="/events"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Events
          </Link>
          <h1 className="text-2xl font-bold">Host an Event</h1>
          {/* P1060: hosting into a group is invisible otherwise — the only signal was a
              query parameter. A host who cannot see the destination cannot notice it is
              wrong. Renders only once the org is resolved AND the caller organizes it. */}
          {hostingOrg && (
            <p data-testid="create-event-org-context" className="mt-1 text-sm text-muted-foreground">
              in <span className="font-medium text-foreground">{hostingOrg.name}</span>
            </p>
          )}
        </div>
        <div className="space-y-6">
          {/* Event Name */}
          <div>
            <Label htmlFor="title" className="flex items-center gap-2 mb-2">
              Event Name *
            </Label>
            <Input
              id="title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Clarity Hike: Golden Gate Edition"
              className={errors.title ? 'border-red-500' : ''}
            />
            {errors.title && (
              <p className="text-sm text-red-500 mt-1">{errors.title}</p>
            )}
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date" className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4" />
                Date *
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                min={minDate}
                className={errors.date ? 'border-red-500' : ''}
              />
              {errors.date && (
                <p className="text-sm text-red-500 mt-1">{errors.date}</p>
              )}
            </div>
            <div>
              <Label htmlFor="time" className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4" />
                Time *
              </Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* Timezone */}
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4" />
              Timezone *
            </Label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          {/* Duration */}
          <div>
            <Label className="flex items-center gap-2 mb-2">
              Duration *
            </Label>
            <select
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {DURATIONS.map(d => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* Location */}
          <div>
            <Label htmlFor="location" className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4" />
              Location *
            </Label>
            <Input
              id="location"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g., Golden Gate Park or https://zoom.us/j/..."
              className={errors.location ? 'border-red-500' : ''}
            />
            {errors.location
              ? <p className="text-sm text-red-500 mt-1">{errors.location}</p>
              : <LocationHint value={location} />
            }
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description" className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4" />
              Description *
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What will you do? Who should come? (Markdown supported)"
              rows={6}
              className={errors.description ? 'border-red-500' : ''}
            />
            {errors.description && (
              <p className="text-sm text-red-500 mt-1">{errors.description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Markdown formatting is supported
            </p>
          </div>

          {/* Submit Error */}
          {errors.submit && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{errors.submit}</p>
            </div>
          )}

          {/* Submit */}
          <div className="pt-4">
            <Button
              type="submit"
              className="w-full bg-blue-500 hover:bg-blue-600 text-white"
              size="lg"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Publish Event'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
