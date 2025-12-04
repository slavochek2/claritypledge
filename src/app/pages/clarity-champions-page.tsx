/**
 * @file clarity-champions-page.tsx
 * @description This page displays a gallery of all the users who have signed the Clarity Pledge and have been verified.
 * It's a public-facing page that showcases the community of "Clarity Champions".
 * It fetches the profiles from the database and displays them in a grid,
 * allowing visitors to see who has taken the pledge and view their profiles.
 */
import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { getVerifiedProfiles, type Profile } from "@/app/data/api";
import { UsersIcon, LoaderIcon } from "lucide-react";
import { ChampionCard } from "@/app/components/social/champion-card";

export function ClarityChampionsPage() {
  const [verifiedProfiles, setVerifiedProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const profiles = await getVerifiedProfiles();
        setVerifiedProfiles(profiles);
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
      // Account for 85% card width + 16px gap (gap-4)
      const cardWidth = carousel.offsetWidth * 0.85 + 16;
      const newIndex = Math.round(scrollLeft / cardWidth);
      setCurrentIndex(Math.min(newIndex, verifiedProfiles.length - 1));
    };

    carousel.addEventListener("scroll", handleScroll, { passive: true });
    return () => carousel.removeEventListener("scroll", handleScroll);
  }, [verifiedProfiles]);

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold">
            Clarity Champions
          </h1>
        </div>


        {/* Champions Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <LoaderIcon
              data-testid="loader"
              className="w-8 h-8 animate-spin text-muted-foreground"
            />
          </div>
        ) : verifiedProfiles.length > 0 ? (
          <>
            {/* Mobile: Horizontal swipe carousel */}
            <div
              ref={carouselRef}
              className="md:hidden flex flex-row flex-nowrap gap-4 overflow-x-auto pb-4 -mx-4 px-4"
              style={{
                scrollSnapType: "x mandatory",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                WebkitOverflowScrolling: "touch"
              }}
            >
              {verifiedProfiles.map((profile) => (
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
            <div className="md:hidden flex justify-center gap-2 mt-4">
              {verifiedProfiles.map((_, index) => (
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
                      const cardWidth = carousel.offsetWidth * 0.85;
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
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {verifiedProfiles.map((profile) => (
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
        ) : (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <UsersIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">
              No Verified Champions Yet
            </h3>
            <p className="text-muted-foreground">
              Be the first to sign the pledge and verify your commitment!
            </p>
          </div>
        )}

        {/* CTA Section */}
        {!loading && (
          <div className="text-center mt-20">
            <h2 className="text-3xl font-bold mb-4">Ready to Join Them?</h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Become a part of the movement towards greater clarity and mutual
              understanding.
            </p>
            <Link
              to="/?pledge=true"
              className="inline-flex items-center justify-center h-12 px-8 font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
            >
              Take the Pledge
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
