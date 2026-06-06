/**
 * @file chiang-mai-page.tsx
 * @description Chiang Mai events page — embeds the public Google Calendar
 * so visitors can see upcoming local events without leaving the site.
 * Calendar-dominant layout (P906): compact header row, near-full-viewport
 * iframe, MONTH view on desktop / AGENDA on mobile. A single iframe whose
 * mode is picked via matchMedia — the heavy Google embed loads exactly once.
 */
import { useEffect, useState } from "react";
import { SEO } from "@/app/components/seo";

const CALENDAR_ID =
  "9b457378eacead57b6d504bb9bba5f57b9d0194eb8d8dc153663c8a274e0c2fd@group.calendar.google.com";

// md breakpoint — below it the month grid is unreadably cramped, agenda list wins
const DESKTOP_QUERY = "(min-width: 768px)";

function buildEmbedUrl(mode: "MONTH" | "AGENDA"): string {
  return `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(
    CALENDAR_ID
  )}&ctz=Asia%2FBangkok&mode=${mode}&showTitle=0&showPrint=0&showCalendars=0&showTz=0`;
}

const SUBSCRIBE_URL = `https://calendar.google.com/calendar/u/0?cid=${btoa(CALENDAR_ID)}`;

export function ChiangMaiPage() {
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia(DESKTOP_QUERY).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="px-4 py-4">
      <SEO
        title="Chiang Mai Events"
        description="Upcoming Clarity Pledge events in Chiang Mai. Join us for calibrated communication practice."
        url="/cm"
      />
      <div className="container mx-auto max-w-6xl">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
          <h1 className="text-xl sm:text-2xl font-bold">
            Clarity Pledge — Chiang Mai
          </h1>
          <a
            href={SUBSCRIBE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Add this calendar to yours
          </a>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <iframe
            src={buildEmbedUrl(isDesktop ? "MONTH" : "AGENDA")}
            title="Clarity Pledge Chiang Mai events calendar"
            className="w-full h-[calc(100dvh-11rem)] min-h-[480px] border-0"
          />
        </div>
      </div>
    </div>
  );
}
