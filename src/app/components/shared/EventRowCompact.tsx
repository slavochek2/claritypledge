/**
 * @file EventRowCompact.tsx
 * @description Compact event row for dashboard lists. Shows essential info with role badge.
 * Consistent with EventCard badge logic but without gradient header.
 */
import { Link } from "react-router-dom";
import { CalendarIcon, Crown, CheckCircle2, Ban } from "lucide-react";
import type { EventWithHost } from "@/app/types";

interface EventRowCompactProps {
  event: EventWithHost;
  /** User's relationship to the event */
  role: "hosting" | "attending" | "none";
}

export function EventRowCompact({ event, role }: EventRowCompactProps) {
  const isCancelled = event.status === "cancelled";
  const isCompleted = event.status === "completed";

  // Format date
  const formatEventDate = (datetime: string, timezone: string) => {
    const date = new Date(datetime);
    const options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    };
    return date.toLocaleString("en-US", options);
  };

  return (
    <Link
      to={`/events/${event.slug}`}
      className={`flex items-center gap-3 p-3 bg-card border border-border rounded-xl transition-colors ${
        isCancelled
          ? "opacity-60 hover:opacity-80"
          : "hover:border-blue-300 hover:shadow-sm"
      }`}
    >
      <CalendarIcon
        className={`w-5 h-5 flex-shrink-0 ${
          isCancelled ? "text-muted-foreground" : "text-blue-500"
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{event.title}</div>
        <div className="text-sm text-muted-foreground">
          {formatEventDate(event.datetime, event.timezone)}
        </div>
      </div>
      {/* Role/Status Badge */}
      {isCancelled ? (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-50 text-red-700 border border-red-200">
          <Ban className="w-3 h-3" />
          Cancelled
        </span>
      ) : role === "hosting" ? (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-50 text-green-700 border border-green-200">
          <Crown className="w-3 h-3" />
          Hosting
        </span>
      ) : role === "attending" ? (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-50 text-green-700 border border-green-200">
          <CheckCircle2 className="w-3 h-3" />
          Going
        </span>
      ) : isCompleted ? (
        <span className="text-xs text-muted-foreground">Completed</span>
      ) : null}
    </Link>
  );
}
