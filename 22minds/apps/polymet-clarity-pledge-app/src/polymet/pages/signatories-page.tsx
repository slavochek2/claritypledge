import { Link } from "react-router-dom";
import { getVerifiedProfiles } from "@/polymet/data/mock-profiles";
import { CheckCircleIcon, UsersIcon, InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function SignatoriesPage() {
  const verifiedProfiles = getVerifiedProfiles();

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
    <div className="min-h-screen py-20 px-4">
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <div className="text-center mb-16 space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-500/10 dark:bg-blue-500/20 mb-4">
            <UsersIcon className="w-10 h-10 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold">
            Who Signed the Pledge
          </h1>
          <p className="text-xl lg:text-2xl text-muted-foreground max-w-3xl mx-auto">
            These verified individuals have committed to building a foundation
            of clarity and mutual understanding.
          </p>

          {/* Metrics Explanation */}
          <div className="max-w-2xl mx-auto bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-6 text-left">
            <div className="flex items-start gap-3">
              <InfoIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />

              <div className="space-y-2 text-sm">
                <p className="font-semibold text-foreground">
                  Understanding the Metrics:
                </p>
                <ul className="space-y-1.5 text-muted-foreground">
                  <li>
                    <strong className="text-foreground">Accepted By:</strong>{" "}
                    People who have accepted this person's commitment to clarity
                  </li>
                  <li>
                    <strong className="text-foreground">Impact:</strong> How
                    many people this signatory has inspired to take the pledge
                    themselves
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 text-lg text-muted-foreground">
            <CheckCircleIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />

            <span>
              <strong className="text-foreground">
                {verifiedProfiles.length}
              </strong>{" "}
              verified{" "}
              {verifiedProfiles.length === 1 ? "signatory" : "signatories"}
            </span>
          </div>
        </div>

        {/* Signatories Grid */}
        {verifiedProfiles.length > 0 ? (
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
                              Impact
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
              No Verified Signatories Yet
            </h3>
            <p className="text-muted-foreground">
              Be the first to sign the pledge and verify your commitment!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
