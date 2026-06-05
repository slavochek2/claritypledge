/**
 * @file chiang-mai-page.tsx
 * @description Chiang Mai events page — embeds the public Google Calendar
 * so visitors can see upcoming local events without leaving the site.
 */
import { SEO } from "@/app/components/seo";

const CALENDAR_ID =
  "9b457378eacead57b6d504bb9bba5f57b9d0194eb8d8dc153663c8a274e0c2fd@group.calendar.google.com";

const EMBED_URL = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(
  CALENDAR_ID
)}&ctz=Asia%2FBangkok&mode=AGENDA&showTitle=0&showPrint=0&showCalendars=0&showTz=0`;

const SUBSCRIBE_URL = `https://calendar.google.com/calendar/u/0?cid=${btoa(CALENDAR_ID)}`;

export function ChiangMaiPage() {
  return (
    <div className="min-h-screen py-20 px-4">
      <SEO
        title="Chiang Mai Events"
        description="Upcoming Clarity Pledge events in Chiang Mai. Join us for calibrated communication practice."
        url="/cm"
      />
      <div className="container mx-auto max-w-2xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            Clarity Pledge — Chiang Mai
          </h1>
          <p className="text-xl text-muted-foreground">
            Upcoming events in Chiang Mai.
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <iframe
            src={EMBED_URL}
            title="Clarity Pledge Chiang Mai events calendar"
            className="w-full h-[600px] border-0"
          />
        </div>

        <p className="text-center text-muted-foreground mt-6">
          <a
            href={SUBSCRIBE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Add this calendar to yours
          </a>
        </p>
      </div>
    </div>
  );
}
