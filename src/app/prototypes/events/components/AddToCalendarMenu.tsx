/**
 * @file AddToCalendarMenu.tsx
 * @description The registration confirmation's "Add to Calendar" dropdown (Google / Outlook.com /
 * Microsoft 365 / .ics), moved out of RsvpConfirm.tsx unchanged so P1336's onboarding can show the
 * same control instead of a copy. Markup and classes are byte-for-byte RsvpConfirm's.
 */
import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadICSFile, getGoogleCalendarUrl, getOffice365Url, getOutlookUrl } from '../utils';

export type CalendarEventData = Parameters<typeof getGoogleCalendarUrl>[0];

export function AddToCalendarMenu({ event }: { event: CalendarEventData }) {
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false);
  const calendarMenuRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative" ref={calendarMenuRef}>
      <Button
        onClick={() => setCalendarMenuOpen(!calendarMenuOpen)}
        variant="outline"
        className="w-full gap-2"
      >
        <Calendar className="w-4 h-4" />
        Add to Calendar
        <ChevronDown className="w-3 h-3 ml-auto" />
      </Button>
      {calendarMenuOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-20 overflow-hidden">
          <a
            href={getGoogleCalendarUrl(event)}
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
            href={getOutlookUrl(event)}
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
            href={getOffice365Url(event)}
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
              downloadICSFile(event);
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
  );
}
