/**
 * @file clarity-champions-page.tsx
 * @description This page displays a gallery of all the users who have signed the Polymet Peldge and have been verified.
 * It's a public-facing page that showcases the community of "Clarity Champions".
 * It fetches the profiles from the database and displays them in a grid,
 * allowing visitors to see who has taken the pledge and view their profiles.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getVerifiedProfiles, type Profile } from "@/polymet/data/api";
import { CheckCircleIcon, UsersIcon, InfoIcon, LoaderIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ClarityChampionsPage() {
  const [verifiedProfiles, setVerifiedProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Generate initials from name
  const getInitials = (fullName: string) => {
    return fullName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <div className="text-center mb-12 space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 dark:bg-blue-500/20">
            <UsersIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold">
            Clarity Champions
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            {loading ? (
              "Discover people who've taken the pledge."
            ) : (
              <>
                Showing{" "}
                <strong className="text-foreground">
                  {verifiedProfiles.length}
                </strong>{" "}
                verified{" "}
                {verifiedProfiles.length === 1
                  ? "champion"
                  : "champions"}{" "}
                who've taken the pledge.
              </>
            )}
          </p>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {verifiedProfiles.map((profile) => (
              <Link
                key={profile.id}
                to={`/p/${profile.id}`}
                className="group border border-border rounded-lg p-6 bg-card hover:shadow-lg hover:border-blue-500/50 transition-all duration-200"
              >
                {/* Avatar and Info */}
                <div className="flex items-start gap-4 mb-4">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
                    style={{
                      backgroundColor: profile.avatarColor || "#0044CC",
                    }}
                  >
                    {getInitials(profile.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {profile.name}
                      </h3>
                      <CheckCircleIcon className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    </div>
                    {profile.role && (
                      <p className="text-sm text-muted-foreground truncate">
                        {profile.role}
                      </p>
                    )}
                  </div>
                </div>

                {/* Reason - if provided */}
                {profile.reason && (
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground italic line-clamp-2">
                      "{profile.reason}"
                    </p>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                  <TooltipProvider>
                    <div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-help">
                            <p className="text-2xl font-bold text-foreground">
                              {profile.witnesses.length}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Accepted By
                            </p>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            People who accepted their commitment
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-help">
                            <p className="text-2xl font-bold text-foreground">
                              {profile.reciprocations}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Inspired
                            </p>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            People inspired to take the pledge
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TooltipProvider>
                </div>

                {/* Signed Date */}
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Signed on{" "}
                    {new Date(profile.signedAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
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
