import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { getFeaturedProfiles } from "@/app/data/api";
import type { ProfileSummary } from "@/app/types";
import { ChampionCard } from "./champion-card";

export function SignatureWall() {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadProfiles() {
      try {
        const data = await getFeaturedProfiles();
        setProfiles(data);
      } catch (err) {
        console.error("Failed to load featured profiles:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadProfiles();
  }, []);

  // Track scroll position for dot indicators on mobile
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const handleScroll = () => {
      const scrollLeft = carousel.scrollLeft;
      const cardWidth = carousel.offsetWidth * 0.85 + 16;
      const newIndex = Math.round(scrollLeft / cardWidth);
      setCurrentIndex(Math.min(newIndex, profiles.length - 1));
    };

    carousel.addEventListener("scroll", handleScroll, { passive: true });
    return () => carousel.removeEventListener("scroll", handleScroll);
  }, [profiles]);

  // Don't render the section if there are no profiles and we're done loading
  if (!isLoading && profiles.length === 0) {
    return null;
  }

  return (
    <section id="signatures" className="py-20 lg:py-32 px-4 scroll-mt-20">
      <div className="container mx-auto max-w-7xl">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            Meet the Understanding Champions
          </h2>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {[...Array(6)].map((_, index) => (
              <div
                key={index}
                className="bg-card border border-border p-6 rounded-lg animate-pulse"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-16 h-16 rounded-full bg-muted flex-shrink-0" />
                  <div className="flex-1">
                    <div className="h-5 bg-muted rounded w-3/4 mb-2" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </div>
                </div>
                <div className="h-4 bg-muted rounded w-full mb-2" />
                <div className="h-4 bg-muted rounded w-2/3 mb-4" />
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                  <div>
                    <div className="h-8 bg-muted rounded w-8 mb-1" />
                    <div className="h-3 bg-muted rounded w-16" />
                  </div>
                  <div>
                    <div className="h-8 bg-muted rounded w-8 mb-1" />
                    <div className="h-3 bg-muted rounded w-12" />
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="h-3 bg-muted rounded w-32" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Signature Cards */}
        {!isLoading && profiles.length > 0 && (
          <>
            {/* Mobile: Horizontal swipe carousel */}
            <div
              ref={carouselRef}
              className="md:hidden flex flex-row flex-nowrap gap-4 overflow-x-auto pb-4 -mx-4 px-4 mb-8"
              style={{
                scrollSnapType: "x mandatory",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                WebkitOverflowScrolling: "touch"
              }}
            >
              {profiles.map((profile) => (
                <ChampionCard
                  key={profile.id}
                  id={profile.id}
                  slug={profile.slug}
                  name={profile.name}
                  role={profile.role}
                  linkedinUrl={profile.linkedinUrl}
                  reason={profile.reason}
                  signedAt={profile.signedAt}
                  avatarColor={profile.avatarColor}
                  showStats={false}
                  showDate={false}
                  className="flex-shrink-0"
                  style={{
                    minWidth: "85%",
                    width: "85%",
                    height: "280px",
                    scrollSnapAlign: "center"
                  }}
                />
              ))}
            </div>

            {/* Mobile: Dot indicators */}
            <div className="md:hidden flex justify-center gap-2 mb-12">
              {profiles.map((_, index) => (
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
                      const cardWidth = carousel.offsetWidth * 0.85 + 16;
                      carousel.scrollTo({
                        left: index * cardWidth,
                        behavior: "smooth",
                      });
                    }
                  }}
                  aria-label={`Go to profile ${index + 1}`}
                />
              ))}
            </div>

            {/* Desktop: Grid layout */}
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              {profiles.map((profile) => (
                <ChampionCard
                  key={profile.id}
                  id={profile.id}
                  slug={profile.slug}
                  name={profile.name}
                  role={profile.role}
                  linkedinUrl={profile.linkedinUrl}
                  reason={profile.reason}
                  signedAt={profile.signedAt}
                  avatarColor={profile.avatarColor}
                  showStats={false}
                  showDate={false}
                />
              ))}
            </div>
          </>
        )}

        {/* View All Button */}
        <div className="text-center">
          <Button
            asChild
            variant="outline"
            size="lg"
            className="text-lg font-semibold"
          >
            <Link to="/understanding-champions">View All Understanding Champions</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
