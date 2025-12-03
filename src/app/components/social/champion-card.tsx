import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { CheckCircleIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getInitials } from "@/lib/utils";

export interface ChampionCardProps {
  id: string;
  slug: string;
  name: string;
  role?: string;
  linkedinUrl?: string;
  reason?: string;
  signedAt: string;
  avatarColor?: string;
  witnessCount?: number;
  reciprocations?: number;
  showStats?: boolean;
  showDate?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function ChampionCard({
  slug,
  name,
  role,
  linkedinUrl,
  reason,
  signedAt,
  avatarColor,
  witnessCount = 0,
  reciprocations = 0,
  showStats = true,
  showDate = true,
  className = "",
  style,
}: ChampionCardProps) {
  return (
    <Link
      to={`/p/${slug}`}
      className={`group border border-border rounded-lg p-6 bg-card hover:shadow-lg hover:border-blue-500/50 transition-all duration-200 block ${className}`}
      style={style}
    >
      {/* Avatar and Info */}
      <div className="flex items-start gap-4 mb-4">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
          style={{ backgroundColor: avatarColor || "#0044CC" }}
        >
          {getInitials(name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-bold truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {name}
            </h3>
            {linkedinUrl && (
              <a
                href={linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-blue-600 transition-colors flex-shrink-0"
                aria-label={`${name}'s LinkedIn profile`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
            )}
            <CheckCircleIcon className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          </div>
          {role && (
            <p className="text-sm text-muted-foreground truncate">{role}</p>
          )}
        </div>
      </div>

      {/* Reason - if provided */}
      {reason && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground italic line-clamp-2">
            "{reason}"
          </p>
        </div>
      )}

      {/* Stats */}
      {showStats && (
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border mt-4">
          <TooltipProvider>
            <div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="cursor-help">
                    <p className="text-2xl font-bold text-foreground">
                      {witnessCount}
                    </p>
                    <p className="text-xs text-muted-foreground">Accepted By</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">People who accepted their commitment</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="cursor-help">
                    <p className="text-2xl font-bold text-foreground">
                      {reciprocations}
                    </p>
                    <p className="text-xs text-muted-foreground">Inspired</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">People inspired to take the pledge</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      )}

      {/* Signed Date */}
      {showDate && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Signed on{" "}
            {new Date(signedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
      )}
    </Link>
  );
}
