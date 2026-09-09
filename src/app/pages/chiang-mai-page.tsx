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
import { withUtm } from "@/lib/utm";
import { useIframeLoadOverlay } from "@/components/ui/iframe-load-overlay";

// md breakpoint — below it the week grid is unreadably cramped, agenda list wins
const DESKTOP_QUERY = "(min-width: 768px)";

// P1134: channel attribution — see docs/technical/analytics.md for the convention
const SUBSCRIBE_LINK = withUtm(SUBSCRIBE_URL, {
  source: "cm-page",
  medium: "calendar-subscribe",
  campaign: "chiang-mai-calendar",
});

export function ChiangMaiPage() {
  // P1019: same defect P1017 fixed on /intro — LazyRoute's Suspense fallback
  // covers the lazy chunk fetch only and unmounts before the iframe's own
  // request starts, so nobody owned the window in between and the calendar box
  // painted blank. The overlay is shared with /intro rather than copied.
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia(DESKTOP_QUERY).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // `resetKey: isDesktop` — the WEEK/AGENDA swap below changes the iframe's src
  // while the page is open, which starts a new navigation and re-opens the blank
  // window. Without the reset the overlay would already be gone by then.
  const { iframeProps, overlay } = useIframeLoadOverlay({
    testId: "chiang-mai-calendar-loading",
    label: "Loading the events calendar",
    resetKey: isDesktop,
  });

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
          href={SUBSCRIBE_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center whitespace-nowrap rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          Add this calendar to yours
        </a>
      </header>

      {/* P1019: `relative` only — the wrapper carries no sizing of its own, so the
          height pairing below stays entirely on the iframe and the overlay can
          never push the embed around. */}
      <div className="relative">
        {/* h-10 row above = 2.5rem — keep the calc in sync so row + iframe = exactly 100dvh */}
        <iframe
          src={buildEmbedUrl(isDesktop ? "WEEK" : "AGENDA")}
          title="Clarity Pledge Chiang Mai events calendar"
          className="block w-full border-0 h-[calc(100dvh-2.5rem)] min-h-[480px]"
          {...iframeProps}
        />
        {overlay}
      </div>
    </div>
  );
}
