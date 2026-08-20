/**
 * @file chiang-mai-page.tsx
 * @description Chiang Mai events page — embeds the public Google Calendar
 * so visitors can see upcoming local events without leaving the site.
 * Full-screen chrome-free layout (P909, supersedes P906's in-chrome card):
 * one slim affordance row (logo home link + subscribe link), then the iframe
 * fills the rest of the viewport edge-to-edge. WEEK view on desktop / AGENDA
 * on mobile via a single iframe whose mode is picked via matchMedia (P906
 * mechanism, unchanged) — the heavy Google embed loads exactly once.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SEO } from "@/app/components/seo";
import { ClarityLogo } from "@/components/ui/clarity-logo";
import { buildEmbedUrl, SUBSCRIBE_URL } from "@/lib/chiang-mai-calendar";

// md breakpoint — below it the week grid is unreadably cramped, agenda list wins
const DESKTOP_QUERY = "(min-width: 768px)";

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
    <div className="bg-background text-foreground">
      <SEO
        title="Chiang Mai Events"
        description="Upcoming Clarity Pledge events in Chiang Mai. Join us for calibrated communication practice."
        url="/cm"
      />
      {/* P909: the page renders chrome-free — this row is the only chrome.
          The logo link is the sole way back to the site. */}
      <header className="flex h-10 items-center justify-between gap-3 px-3">
        <Link
          to="/"
          aria-label="Clarity Pledge — home"
          className="flex h-full shrink-0 items-center"
        >
          <ClarityLogo size="xs" iconOnly className="sm:hidden" />
          <ClarityLogo size="xs" className="hidden sm:inline-flex" />
        </Link>
        <a
          href={SUBSCRIBE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center whitespace-nowrap rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          Add this calendar to yours
        </a>
      </header>

      {/* h-10 row above = 2.5rem — keep the calc in sync so row + iframe = exactly 100dvh */}
      <iframe
        src={buildEmbedUrl(isDesktop ? "WEEK" : "AGENDA")}
        title="Clarity Pledge Chiang Mai events calendar"
        className="block w-full border-0 h-[calc(100dvh-2.5rem)] min-h-[480px]"
      />
    </div>
  );
}
