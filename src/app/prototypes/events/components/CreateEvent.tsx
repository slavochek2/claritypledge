import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, MapPin, FileText, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { mockCurrentUser } from '../mock-data';

const durations = [
  { value: '1', label: '1 hour' },
  { value: '2', label: '2 hours' },
  { value: '3', label: '3 hours' },
  { value: '4', label: '4 hours' },
  { value: '24', label: 'All day' },
];

export function CreateEvent() {
  const navigate = useNavigate();

  // Form state
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('18:00');
  const [duration, setDuration] = useState('2');
  const [location, setLocation] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Redirect if not logged in
  if (!mockCurrentUser.isLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Sign in to Create Events</h1>
          <p className="text-muted-foreground mb-4">You need to be signed in to host events.</p>
          <Link to="/sign-pledge">
            <Button>Sign Up</Button>
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
    if (coverImageUrl && !coverImageUrl.match(/^https?:\/\/.+/)) {
      newErrors.coverImageUrl = 'Please enter a valid URL (https://...)';
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

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Generate slug from title and date
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '-' + date;

    setIsSubmitting(false);

    // Navigate to the new event (mock)
    navigate(`/events/${slug}?created=true`);
  };

  // Get tomorrow's date for min date attribute
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-background">
      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-6">
        {/* Back link and title */}
        <div className="mb-6">
          <Link
            to="/events"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Events
          </Link>
          <h1 className="text-2xl font-bold">Create Event</h1>
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

          {/* Duration */}
          <div>
            <Label className="flex items-center gap-2 mb-2">
              Duration *
            </Label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {durations.map(d => (
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
              placeholder="e.g., Golden Gate Park, Main Entrance"
              className={errors.location ? 'border-red-500' : ''}
            />
            {errors.location && (
              <p className="text-sm text-red-500 mt-1">{errors.location}</p>
            )}
          </div>

          {/* Cover Image URL */}
          <div>
            <Label htmlFor="coverImageUrl" className="flex items-center gap-2 mb-2">
              <Image className="w-4 h-4" />
              Cover Image URL
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="coverImageUrl"
              value={coverImageUrl}
              onChange={e => setCoverImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className={errors.coverImageUrl ? 'border-red-500' : ''}
            />
            {errors.coverImageUrl && (
              <p className="text-sm text-red-500 mt-1">{errors.coverImageUrl}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Paste a link to an image (Unsplash, Imgur, etc.)
            </p>
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

          {/* Submit */}
          <div className="pt-4">
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating Event...' : 'Create Event'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
