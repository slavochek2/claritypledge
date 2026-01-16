// Shared utilities for events prototype

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
