import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, MapPin,
  MessagesSquare, FileText, Globe } from 'lucide-react';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { LocationHint } from './LocationHint';
import { validateGroupChatUrl } from '../group-chat-utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/auth';
import { eventsService } from '@/app/data/events-service';
import type { EventWithHost } from '@/app/types';
import { DURATIONS, TIMEZONES } from '../utils';

export function EditEvent() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, session, isLoading: authLoading } = useAuth();
  const isAuthenticated = !!session;
  const [event, setEvent] = useState<EventWithHost | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [timezone, setTimezone] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [location, setLocation] = useState('');
  const [groupChatUrl, setGroupChatUrl] = useState('');
  // P1194: true when the existing link could not be READ. An empty field then means
  // "unknown", not "the host cleared it" — and the two must not submit the same value.
  const [groupChatLoadFailed, setGroupChatLoadFailed] = useState(false);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Fetch event data
  useEffect(() => {
    async function fetchEvent() {
      if (!slug) {
        setIsLoading(false);
        return;
      }
      const eventData = await eventsService.getEventBySlug(slug);
      setEvent(eventData);

      if (eventData) {
        const eventDate = new Date(eventData.datetime);
        setTitle(eventData.title);
        setDate(eventDate.toISOString().split('T')[0]);
        setTime(eventDate.toTimeString().slice(0, 5));
        setTimezone(eventData.timezone);
        setDurationMinutes(eventData.durationMinutes);
        setLocation(eventData.location);
        setDescription(eventData.description);
        // P1194: the group chat link lives in the RLS-gated side table, not on the
        // event row. The host passes that gate, so this returns their own value.
        if (eventData.hasGroupChat) {
          try {
            const existing = await eventsService.getEventGroupChatUrl(eventData.id);
            // The event says a link exists; null here means the read failed or was
            // refused. Treating that as an empty field would submit '' on save, which
            // upsertGroupChatUrl reads as "host cleared it" and DELETES the real link.
            if (existing === null) setGroupChatLoadFailed(true);
            else setGroupChatUrl(existing);
          } catch (error) {
            console.error('[EditEvent] Failed to load group chat link:', error);
            setGroupChatLoadFailed(true);
          }
        }
      }
      setIsLoading(false);
    }
    fetchEvent();
  }, [slug]);

  // Event not found
  if (!isLoading && !event) {
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

  // Not the host
  if (!isLoading && !authLoading && event && user && event.hostId !== user.id) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground mb-4">Only the event host can edit this event.</p>
          <Link to={`/events/${slug}`}>
            <Button variant="outline">Back to Event</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Sign Up Required</h1>
          <p className="text-muted-foreground mb-4">You need an account to edit events.</p>
          <Link to="/signup">
            <Button className="bg-blue-500 hover:bg-blue-600 text-white">Sign Up</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading || authLoading) {
    return <ClarityPageLoader />;
  }

  // Get tomorrow's date for min date attribute
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

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
    const groupChatError = validateGroupChatUrl(groupChatUrl);
    if (groupChatError) {
      newErrors.groupChatUrl = groupChatError;
    }
    if (!description.trim() || description.length < 20) {
      newErrors.description = 'Description must be at least 20 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate() || !event) return;

    setIsSubmitting(true);

    // Combine date and time into ISO datetime string
    const datetime = new Date(`${date}T${time}:00`).toISOString();

    const success = await eventsService.updateEvent(event.id, {
      title,
      description,
      datetime,
      durationMinutes,
      timezone,
      location,
      // Omitted, not empty, when the read failed — an undefined field is left alone
      // by updateEvent; an empty string would delete the stored link.
      ...(groupChatLoadFailed && !groupChatUrl.trim() ? {} : { groupChatUrl: groupChatUrl.trim() }),
    });

    setIsSubmitting(false);

    if (success) {
      toast.success('Event updated successfully');
      navigate(`/events/${slug}`);
    } else {
      setErrors({ submit: 'Failed to update event. Please try again.' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-6">
        {/* Back link and title */}
        <div className="mb-6">
          <Link
            to={`/events/${slug}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Event
          </Link>
          <h1 className="text-2xl font-bold">Edit Event</h1>
          <p className="text-muted-foreground mt-1">Update your event details below.</p>
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
              placeholder="e.g., Golden Gate Park or Zoom: https://..."
              className={errors.location ? 'border-red-500' : ''}
            />
            {errors.location
              ? <p className="text-sm text-red-500 mt-1">{errors.location}</p>
              : <LocationHint value={location} />
            }
          </div>

          {/* Group chat — P1194: private to registered attendees */}
          <div>
            <Label htmlFor="groupChatUrl" className="flex items-center gap-2 mb-2">
              <MessagesSquare className="w-4 h-4" />
              Group chat link
            </Label>
            <Input
              id="groupChatUrl"
              value={groupChatUrl}
              onChange={e => setGroupChatUrl(e.target.value)}
              placeholder="e.g., https://chat.whatsapp.com/..."
              className={errors.groupChatUrl ? 'border-red-500' : ''}
            />
            {errors.groupChatUrl
              ? <p className="text-sm text-red-500 mt-1">{errors.groupChatUrl}</p>
              : groupChatLoadFailed
                ? <p className="text-xs text-amber-600 mt-1">
                    This event has a group chat link, but it could not be loaded. Leave the field
                    blank to keep the existing link, or type a new one to replace it.
                  </p>
                : <p className="text-xs text-muted-foreground mt-1">
                    Optional. Shown as a button to people who have registered — and to nobody else.
                  </p>
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

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/events/${slug}`)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
