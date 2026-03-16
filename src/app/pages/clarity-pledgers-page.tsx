/**
 * @file clarity-pledgers-page.tsx
 * @description This page displays a gallery of all the users who have signed the Clarity Pledge and have been verified.
 * It's a public-facing page that showcases the pledgers.
 * It fetches the profiles from the database and displays them in a grid,
 * allowing visitors to see who has taken the pledge and view their profiles.
 */
import { useEffect, useState, useRef } from "react";
import { getVerifiedProfiles, type Profile } from "@/app/data/api";
import { SEO } from "@/app/components/seo";
import { UsersIcon } from "lucide-react";
import { ClarityLoader } from "@/components/ui/clarity-loader";
import { PledgerCard } from "@/app/components/social/pledger-card";
import { analytics } from "@/lib/mixpanel";
import { DualCTA } from "@/app/components/landing/dual-cta";

const MAX_MOBILE_CAROUSEL = 20;
// Mobile carousel card width: 85% of viewport + 16px gap (gap-4 = 1rem = 16px)
const MOBILE_CARD_WIDTH_PERCENT = 0.85;
const CARD_GAP_PX = 16;

export function ClarityPledgersPage() {
  const [verifiedProfiles, setVerifiedProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const hasTrackedPageView = useRef(false);

  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const profiles = await getVerifiedProfiles();
        setVerifiedProfiles(profiles);

        // Track page view once profiles are loaded
        if (!hasTrackedPageView.current) {
          hasTrackedPageView.current = true;
          analytics.track('pledgers_page_viewed', {
            pledger_count: profiles.length,
          });
        }
      } catch (error) {
        console.error("Failed to fetch verified profiles", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfiles();
  }, []);

  // Track scroll position for dot indicators on mobile
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const handleScroll = () => {
      const scrollLeft = carousel.scrollLeft;
      const cardWidth = carousel.offsetWidth * MOBILE_CARD_WIDTH_PERCENT + CARD_GAP_PX;
      const newIndex = Math.round(scrollLeft / cardWidth);
      const maxIndex = Math.max(0, Math.min(verifiedProfiles.length, MAX_MOBILE_CAROUSEL) - 1);
      setCurrentIndex(Math.min(newIndex, maxIndex));
    };

    carousel.addEventListener("scroll", handleScroll, { passive: true });
    return () => carousel.removeEventListener("scroll", handleScroll);
  }, [verifiedProfiles]);

  // Limit mobile carousel to avoid too many dots
  const mobileProfiles = verifiedProfiles.slice(0, MAX_MOBILE_CAROUSEL);

  return (
    <div className="min-h-screen py-12 px-4">
      <SEO
        title="Clarity Champions"
        description="Meet the professionals who have committed to clear, honest communication. Browse the Clarity Pledge community."
        url="/pledgers"
      />
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold">
            Clarity Pledgers
          </h1>
        </div>


        {/* Pledgers Grid */}
        {loading ? (
          <div className="flex justify-center py-20" data-testid="loader">
            <ClarityLoader size="lg" />
          </div>
        ) : verifiedProfiles.length > 0 ? (
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
              {mobileProfiles.map((profile) => (
                <PledgerCard
                  key={profile.id}
                  id={profile.id}
                  slug={profile.slug}
                  name={profile.name}
                  role={profile.role}
                  linkedinUrl={profile.linkedinUrl}
                  reason={profile.reason}
                  signedAt={profile.signedAt}
                  avatarColor={profile.avatarColor}
                  avatarUrl={profile.avatarUrl}
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
              {mobileProfiles.map((_, index) => (
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
            {verifiedProfiles.length > MAX_MOBILE_CAROUSEL && (
              <div className="md:hidden text-center mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {MAX_MOBILE_CAROUSEL} of {verifiedProfiles.length} pledgers
                  <br />
                  <span className="text-xs">View on desktop to see all profiles</span>
                </p>
              </div>
            )}

            {/* Desktop: Grid layout */}
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {verifiedProfiles.map((profile) => (
                <PledgerCard
                  key={profile.id}
                  id={profile.id}
                  slug={profile.slug}
                  name={profile.name}
                  role={profile.role}
                  linkedinUrl={profile.linkedinUrl}
                  reason={profile.reason}
                  signedAt={profile.signedAt}
                  avatarColor={profile.avatarColor}
                  avatarUrl={profile.avatarUrl}
                  showStats={false}
                  showDate={false}
                  className="h-[340px]"
                />
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <UsersIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">
              No Verified Pledgers Yet
            </h3>
            <p className="text-muted-foreground">
              Be the first to sign the pledge and verify your commitment!
            </p>
          </div>
        )}

        {/* CTA Section */}
        {!loading && (
          <div className="text-center mt-20">
            <h2 className="text-3xl font-bold mb-4">Ready to Commit?</h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Make your public commitment to clear communication.
            </p>
            <DualCTA reversed={true} />
          </div>
        )}
      </div>
    </div>
  );
}
