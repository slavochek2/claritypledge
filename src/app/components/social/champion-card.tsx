import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";

export interface ChampionCardProps {
  /** Profile ID - kept for API compatibility with ProfileSummary type */
  id?: string;
  slug: string;
  name: string;
  role?: string;
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
  reason,
  signedAt,
  avatarColor = "#0044CC",
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
        {/* GravatarAvatar - will show initials fallback since no email in public lists */}
        <GravatarAvatar
          name={name}
          size="lg"
          avatarColor={avatarColor}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-bold truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {name}
            </h3>
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

      {/* View Pledge CTA - appears on hover */}
      <div className="flex items-center justify-end gap-1 mt-4 text-sm text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
        <span>View Pledge</span>
        <ArrowRight className="w-4 h-4" />
      </div>
    </Link>
  );
}
