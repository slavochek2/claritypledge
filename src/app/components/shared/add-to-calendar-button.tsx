import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDownIcon } from 'lucide-react';

export interface CalendarEventData {
  title: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
}

function getGoogleCalendarUrl(event: CalendarEventData): string {
  const params: Record<string, string> = {
    action: 'TEMPLATE',
    text: event.title,
  };
  if (event.description) params.details = event.description;
  if (event.startDate && event.endDate) {
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    params.dates = `${fmt(event.startDate)}/${fmt(event.endDate)}`;
  }
  return `https://calendar.google.com/calendar/render?${new URLSearchParams(params).toString()}`;
}

function getOutlookUrl(event: CalendarEventData): string {
  const params: Record<string, string> = {
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
  };
  if (event.description) params.body = event.description;
  if (event.startDate) params.startdt = event.startDate.toISOString();
  if (event.endDate) params.enddt = event.endDate.toISOString();
  return `https://outlook.live.com/calendar/0/deeplink/compose?${new URLSearchParams(params).toString()}`;
}

function getOffice365Url(event: CalendarEventData): string {
  const params: Record<string, string> = {
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
  };
  if (event.description) params.body = event.description;
  if (event.startDate) params.startdt = event.startDate.toISOString();
  if (event.endDate) params.enddt = event.endDate.toISOString();
  return `https://outlook.office.com/calendar/0/deeplink/compose?${new URLSearchParams(params).toString()}`;
}

interface AddToCalendarButtonProps {
  event: CalendarEventData;
}

export function AddToCalendarButton({ event }: AddToCalendarButtonProps) {
  return (
    <div className="inline-flex">
      <a
        href={getGoogleCalendarUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-l-md border border-r-0 border-[#0044CC]/40 text-sm text-[#0044CC] hover:bg-[#0044CC]/5 transition-colors"
      >
        Add to Google Calendar
      </a>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="More calendar options"
            className="inline-flex items-center px-2 py-1.5 rounded-r-md border border-[#0044CC]/40 text-sm text-[#0044CC] hover:bg-[#0044CC]/5 transition-colors"
          >
            <ChevronDownIcon size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem asChild>
            <a
              href={getOutlookUrl(event)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Outlook.com
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href={getOffice365Url(event)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Microsoft 365
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
