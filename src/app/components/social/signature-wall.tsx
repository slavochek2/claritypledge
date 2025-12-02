import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { getFeaturedProfiles } from "@/app/data/api";
import type { Profile } from "@/app/types";
import { getInitials } from "@/lib/utils";

export function SignatureWall() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
            Meet the Clarity Champions
          </h2>
          <p className="text-xl lg:text-2xl text-muted-foreground">
            These are the people building the foundation of a clearer world.
          </p>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
            {[...Array(6)].map((_, index) => (
              <div
                key={index}
                className="bg-card border border-border p-6 rounded-lg shadow-md animate-pulse"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-16 h-16 rounded-full bg-muted flex-shrink-0" />
                  <div className="flex-1">
                    <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </div>
                </div>
                <div className="h-5 bg-muted rounded w-full mb-2" />
                <div className="h-5 bg-muted rounded w-2/3" />
              </div>
            ))}
          </div>
        )}

        {/* Signature Grid */}
        {!isLoading && profiles.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
            {profiles.map((profile) => (
              <Link
                key={profile.id}
                to={`/p/${profile.slug}`}
                className="bg-card border border-border p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow block"
              >
                {/* Avatar and Info */}
                <div className="flex items-start gap-4 mb-4">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
                    style={{ backgroundColor: profile.avatarColor || "#0044CC" }}
                  >
                    {getInitials(profile.name)}
                  </div>

                  <div>
                    <h3 className="text-xl font-bold">{profile.name}</h3>
                    {profile.role && (
                      <p className="text-base text-muted-foreground">
                        {profile.role}
                      </p>
                    )}
                  </div>
                </div>

                {/* Reason */}
                {profile.reason && (
                  <p className="text-lg italic text-foreground leading-relaxed">
                    "{profile.reason}"
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}

        {/* View All Button */}
        <div className="text-center">
          <Button
            asChild
            variant="outline"
            size="lg"
            className="text-lg font-semibold"
          >
            <Link to="/clarity-champions">View All Clarity Champions</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
