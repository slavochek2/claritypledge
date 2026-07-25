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
import { PledgerGrid } from "@/app/components/social/pledger-grid";
import { analytics } from "@/lib/mixpanel";
import { DualCTA } from "@/app/components/landing/dual-cta";

export function ClarityPledgersPage() {
  const [verifiedProfiles, setVerifiedProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
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
          <PledgerGrid
            items={verifiedProfiles.map((profile) => ({
              id: profile.id,
              slug: profile.slug,
              name: profile.name,
              role: profile.role,
              reason: profile.reason,
              signedAt: profile.signedAt,
              avatarColor: profile.avatarColor,
              avatarUrl: profile.avatarUrl,
            }))}
          />
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
