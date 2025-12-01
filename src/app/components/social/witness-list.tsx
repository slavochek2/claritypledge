import { useState } from "react";
import { type Witness } from "@/app/data/api";
import { CheckCircle2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WitnessListProps {
  witnesses: Witness[];
}

// Helper function to get initials from name
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Helper function to generate consistent color from name
function getAvatarColor(name: string): string {
  const colors = [
    "bg-blue-500",
    "bg-purple-500",
    "bg-green-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-teal-500",
    "bg-indigo-500",
    "bg-red-500",
  ];

  const index = name
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[index % colors.length];
}

export function WitnessList({ witnesses }: WitnessListProps) {
  const [showAll, setShowAll] = useState(false);
  const INITIAL_DISPLAY_COUNT = 12;
  const hasMore = witnesses.length > INITIAL_DISPLAY_COUNT;
  const displayedWitnesses = showAll
    ? witnesses
    : witnesses.slice(0, INITIAL_DISPLAY_COUNT);

  if (witnesses.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
        <p className="text-muted-foreground">
          No one has accepted yet. Share your pledge to get started!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {displayedWitnesses.map((witness) => (
          <div
            key={witness.id}
            className="border border-border rounded-lg p-4 bg-card hover:shadow-sm transition-shadow"
          >
            <div className="flex flex-col items-center text-center gap-2">
              {/* Avatar */}
              <div
                className={`w-12 h-12 rounded-full ${getAvatarColor(witness.name)} flex items-center justify-center text-white font-semibold text-sm flex-shrink-0`}
              >
                {getInitials(witness.name)}
              </div>

              {/* Name with optional LinkedIn link */}
              <div className="w-full">
                {witness.linkedinUrl ? (
                  <a
                    href={witness.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-sm text-foreground hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-center gap-1.5"
                  >
                    <span className="truncate">{witness.name}</span>
                    <svg
                      className="w-3.5 h-3.5 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                  </a>
                ) : (
                  <p className="font-semibold text-sm text-foreground truncate">
                    {witness.name}
                  </p>
                )}

                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(witness.timestamp).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="text-center">
          <Button
            variant="outline"
            onClick={() => setShowAll(!showAll)}
            className="min-w-[200px]"
          >
            {showAll ? `Show Less` : `Show All ${witnesses.length} Acceptances`}
          </Button>
        </div>
      )}
    </div>
  );
}
