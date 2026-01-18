// Shared utilities for events prototype

// ============= SHARED CONSTANTS =============

/**
 * Duration options for event forms (stored in minutes)
 */
export const DURATIONS = [
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
  { value: 180, label: '3 hours' },
  { value: 240, label: '4 hours' },
  { value: 1440, label: 'All day' },
] as const;

/**
 * Comprehensive timezone list with UTC offsets and major cities
 * Format: "(UTC±HH:MM) Region - Cities"
 */
export const TIMEZONES = [
  // UTC-12 to UTC-8
  { value: 'Pacific/Midway', label: '(UTC-11:00) Midway Island, Samoa' },
  { value: 'Pacific/Honolulu', label: '(UTC-10:00) Hawaii - Honolulu' },
  { value: 'America/Anchorage', label: '(UTC-09:00) Alaska - Anchorage' },
  { value: 'America/Los_Angeles', label: '(UTC-08:00) Pacific Time - Los Angeles, Seattle, Vancouver' },

  // UTC-7 to UTC-5
  { value: 'America/Denver', label: '(UTC-07:00) Mountain Time - Denver, Phoenix, Calgary' },
  { value: 'America/Chicago', label: '(UTC-06:00) Central Time - Chicago, Houston, Mexico City' },
  { value: 'America/New_York', label: '(UTC-05:00) Eastern Time - New York, Toronto, Miami' },

  // UTC-4 to UTC-2
  { value: 'America/Halifax', label: '(UTC-04:00) Atlantic Time - Halifax, Puerto Rico' },
  { value: 'America/Sao_Paulo', label: '(UTC-03:00) South America - São Paulo, Buenos Aires' },

  // UTC±0
  { value: 'UTC', label: '(UTC+00:00) UTC - Coordinated Universal Time' },
  { value: 'Europe/London', label: '(UTC+00:00) UK & Ireland - London, Dublin' },

  // UTC+1 to UTC+3
  { value: 'Europe/Paris', label: '(UTC+01:00) Central Europe - Paris, Berlin, Amsterdam, Rome' },
  { value: 'Europe/Helsinki', label: '(UTC+02:00) Eastern Europe - Helsinki, Kyiv, Athens, Cairo' },
  { value: 'Europe/Moscow', label: '(UTC+03:00) Moscow, Istanbul, Riyadh, Nairobi' },

  // UTC+4 to UTC+5:30
  { value: 'Asia/Dubai', label: '(UTC+04:00) Gulf - Dubai, Abu Dhabi, Baku' },
  { value: 'Asia/Karachi', label: '(UTC+05:00) Pakistan - Karachi, Islamabad' },
  { value: 'Asia/Kolkata', label: '(UTC+05:30) India - Mumbai, Delhi, Bangalore, Kolkata' },

  // UTC+6 to UTC+7
  { value: 'Asia/Dhaka', label: '(UTC+06:00) Bangladesh - Dhaka' },
  { value: 'Asia/Bangkok', label: '(UTC+07:00) Indochina - Bangkok, Ho Chi Minh, Jakarta' },

  // UTC+8 to UTC+9
  { value: 'Asia/Singapore', label: '(UTC+08:00) Singapore, Hong Kong, Kuala Lumpur, Perth' },
  { value: 'Asia/Shanghai', label: '(UTC+08:00) China - Beijing, Shanghai, Taipei' },
  { value: 'Asia/Tokyo', label: '(UTC+09:00) Japan & Korea - Tokyo, Seoul' },

  // UTC+10 to UTC+12
  { value: 'Australia/Sydney', label: '(UTC+10:00) Eastern Australia - Sydney, Melbourne' },
  { value: 'Pacific/Auckland', label: '(UTC+12:00) New Zealand - Auckland, Wellington' },
] as const;

// ============= FORMATTING FUNCTIONS =============

/**
 * Format duration in minutes to human-readable string
 */
export function formatDuration(minutes: number): string {
  if (minutes >= 1440) return 'All day';
  if (minutes >= 60) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  return `${minutes} minutes`;
}

/**
 * Format a date for display (e.g., "Monday, January 20, 2026")
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Format a date for card display with Today/Tomorrow support
 */
export function formatDateShort(date: Date): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow';
  } else {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  }
}

/**
 * Format time for display (e.g., "6:00 PM")
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Format date for ICS file (e.g., "20260120T180000Z")
 */
function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

interface ICSEventData {
  id: string;
  title: string;
  description: string;
  location: string;
  slug: string;
  startDate: Date;
  endDate: Date;
}

/**
 * Generate and download an ICS calendar file
 */
export function downloadICSFile(event: ICSEventData): void {
  const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Clarity Pledge//Events//EN
BEGIN:VEVENT
UID:${event.id}@claritypledge.com
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(event.startDate)}
DTEND:${formatICSDate(event.endDate)}
SUMMARY:${event.title}
DESCRIPTION:${event.description.replace(/\n/g, '\\n').substring(0, 200)}
LOCATION:${event.location}
END:VEVENT
END:VCALENDAR`;

  const blob = new Blob([icsContent], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${event.slug}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate Google Calendar URL for an event
 */
export function getGoogleCalendarUrl(event: ICSEventData): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatICSDate(event.startDate)}/${formatICSDate(event.endDate)}`,
    details: event.description.substring(0, 500),
    location: event.location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Get a human-readable timezone label from IANA timezone string
 * Shows UTC offset and major city for clarity
 */
export function getTimezoneLabel(ianaTimezone: string): string {
  const labels: Record<string, string> = {
    // Americas
    'Pacific/Midway': 'UTC-11 Samoa',
    'Pacific/Honolulu': 'UTC-10 Hawaii',
    'America/Anchorage': 'UTC-9 Alaska',
    'America/Los_Angeles': 'UTC-8 Los Angeles',
    'America/Denver': 'UTC-7 Denver',
    'America/Chicago': 'UTC-6 Chicago',
    'America/New_York': 'UTC-5 New York',
    'America/Halifax': 'UTC-4 Halifax',
    'America/Sao_Paulo': 'UTC-3 São Paulo',

    // Europe & Africa
    'UTC': 'UTC',
    'Europe/London': 'UTC+0 London',
    'Europe/Paris': 'UTC+1 Paris',
    'Europe/Helsinki': 'UTC+2 Helsinki',
    'Europe/Moscow': 'UTC+3 Moscow',

    // Middle East & Asia
    'Asia/Dubai': 'UTC+4 Dubai',
    'Asia/Karachi': 'UTC+5 Karachi',
    'Asia/Kolkata': 'UTC+5:30 Mumbai',
    'Asia/Dhaka': 'UTC+6 Dhaka',
    'Asia/Bangkok': 'UTC+7 Bangkok',
    'Asia/Singapore': 'UTC+8 Singapore',
    'Asia/Shanghai': 'UTC+8 Shanghai',
    'Asia/Tokyo': 'UTC+9 Tokyo',

    // Oceania
    'Australia/Sydney': 'UTC+10 Sydney',
    'Pacific/Auckland': 'UTC+12 Auckland',
  };
  return labels[ianaTimezone] || ianaTimezone;
}
