/**
 * @file pledger-grid.tsx
 * @description P1010: the pledger grid + mobile carousel, extracted verbatim from
 * clarity-pledgers-page.tsx so it can be reused by the org Members tab. Behavior-
 * preserving: the mobile carousel markup, dot navigation, and "Showing X of Y"
 * indicator are unchanged (regression-covered by e2e/pledgers-page.spec.ts).
 *
 * Caller owns the empty state — this component renders nothing when `items` is
 * empty, so /pledgers keeps its "No Verified Pledgers Yet" block and the org
 * Members tab shows its "Be the first to join" prompt.
 */
import { useEffect, useRef, useState } from "react";
import { PledgerCard } from "@/app/components/social/pledger-card";

const MAX_MOBILE_CAROUSEL = 20;
// Mobile carousel card width: 85% of viewport + 16px gap (gap-4 = 1rem = 16px)
const MOBILE_CARD_WIDTH_PERCENT = 0.85;
const CARD_GAP_PX = 16;

export interface PledgerGridItem {
  id?: string;
  slug: string;
  name: string;
  role?: string;
  reason?: string;
  signedAt: string;
  avatarColor?: string;
  avatarUrl?: string;
  /** P1010: optional inline label (e.g. "Organizer"). */
  badge?: string;
  /** P1010: read only under variant="member" — drives the avatar's pledge ring. */
  isPledger?: boolean;
}

/**
 * `variant` is passed straight through to every card — see PledgerCard's own docs.
 * It is grid-wide, not per-item, because one grid renders one kind of person:
 * /pledgers is all pledgers, an org roster is all members.
 */
export function PledgerGrid({
  items,
  variant = "pledger",
  totalCount,
}: {
  items: PledgerGridItem[];
  variant?: "pledger" | "member";
  /** P1229: total across all pages when `items` is only the loaded page(s). Defaults to items.length. */
  totalCount?: number;
}) {
  const total = totalCount ?? items.length;
  const [currentIndex, setCurrentIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  // Track scroll position for dot indicators on mobile
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const handleScroll = () => {
      const scrollLeft = carousel.scrollLeft;
      const cardWidth = carousel.offsetWidth * MOBILE_CARD_WIDTH_PERCENT + CARD_GAP_PX;
      const newIndex = Math.round(scrollLeft / cardWidth);
      const maxIndex = Math.max(0, Math.min(items.length, MAX_MOBILE_CAROUSEL) - 1);
      setCurrentIndex(Math.min(newIndex, maxIndex));
    };

    carousel.addEventListener("scroll", handleScroll, { passive: true });
    return () => carousel.removeEventListener("scroll", handleScroll);
  }, [items]);

  if (items.length === 0) return null;

  // Limit mobile carousel to avoid too many dots
  const mobileItems = items.slice(0, MAX_MOBILE_CAROUSEL);

  return (
    <>
      {/* Mobile: Horizontal swipe carousel (limited to MAX_MOBILE_CAROUSEL) */}
      <div
        ref={carouselRef}
        role="region"
        aria-label="Pledger profiles carousel"
        aria-live="polite"
        className="md:hidden flex flex-row flex-nowrap gap-4 overflow-x-auto pb-4 -mx-4 px-4"
        style={{
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch"
        }}
      >
        {mobileItems.map((item) => (
          <PledgerCard
            key={item.id ?? item.slug}
            id={item.id}
            slug={item.slug}
            name={item.name}
            role={item.role}
            reason={item.reason}
            signedAt={item.signedAt}
            avatarColor={item.avatarColor}
            avatarUrl={item.avatarUrl}
            badge={item.badge}
            variant={variant}
            isPledger={item.isPledger}
            showStats={false}
            showDate={false}
            className="flex-shrink-0"
            style={{
              minWidth: "85%",
              width: "85%",
              height: "340px",
              scrollSnapAlign: "center"
            }}
          />
        ))}
      </div>

      {/* Mobile: Dot indicators */}
      <nav
        className="md:hidden flex justify-center gap-2 mt-4"
        aria-label="Carousel navigation"
      >
        {mobileItems.map((_, index) => (
          <button
            key={index}
            className={`w-2 h-2 rounded-full transition-all ${
              index === currentIndex
                ? "bg-blue-600 w-4"
                : "bg-gray-300 dark:bg-gray-600"
            }`}
            onClick={() => {
              const carousel = carouselRef.current;
              if (carousel) {
                const cardWidth = carousel.offsetWidth * MOBILE_CARD_WIDTH_PERCENT + CARD_GAP_PX;
                carousel.scrollTo({
                  left: index * cardWidth,
                  behavior: "smooth",
                });
              }
            }}
            aria-label={`Go to profile ${index + 1}`}
            aria-current={index === currentIndex ? "true" : "false"}
          />
        ))}
      </nav>

      {/* Mobile: Show more indicator if profiles exceed limit */}
      {total > MAX_MOBILE_CAROUSEL && (
        <div className="md:hidden text-center mt-4">
          <p className="text-sm text-muted-foreground">
            Showing {Math.min(MAX_MOBILE_CAROUSEL, items.length)} of {total} pledgers
            <br />
            <span className="text-xs">View on desktop to see all profiles</span>
          </p>
        </div>
      )}

      {/* Desktop: Grid layout */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((item) => (
          <PledgerCard
            key={item.id ?? item.slug}
            id={item.id}
            slug={item.slug}
            name={item.name}
            role={item.role}
            reason={item.reason}
            signedAt={item.signedAt}
            avatarColor={item.avatarColor}
            avatarUrl={item.avatarUrl}
            badge={item.badge}
            variant={variant}
            isPledger={item.isPledger}
            showStats={false}
            showDate={false}
            className="h-[340px]"
          />
        ))}
      </div>
    </>
  );
}
