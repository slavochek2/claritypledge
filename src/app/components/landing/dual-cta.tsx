import { Link } from "react-router-dom";

interface DualCTAProps {
  /** Size variant for the primary button - "hero" for hero sections (larger), "section" for content sections (smaller) */
  size?: "section" | "hero";
  /** Additional CSS classes for the container */
  className?: string;
  /** Reverse the hierarchy: "Take the Pledge" becomes primary, "Start a Clarity Session" becomes secondary */
  reversed?: boolean;
}

/**
 * Reusable dual CTA component used across landing pages.
 * Default: Primary = "Start a Clarity Session", Secondary = "Take the Pledge"
 * Reversed: Primary = "Take the Pledge", Secondary = "Start a Clarity Session"
 */
export function DualCTA({ size = "section", className = "", reversed = false }: DualCTAProps) {
  const buttonClasses =
    size === "hero"
      ? "text-xl px-12 py-8"
      : "text-base sm:text-lg px-8 py-4 sm:px-10 sm:py-6";

  if (reversed) {
    return (
      <div className={`flex flex-col items-center gap-3 ${className}`}>
        <Link
          to="/sign-pledge"
          className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-blue-500 hover:bg-blue-600 text-white font-semibold h-auto shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 transition-all ${buttonClasses}`}
        >
          Take the Pledge
        </Link>
        <p className="text-muted-foreground">
          or{" "}
          <Link
            to="/live"
            className="text-blue-500 hover:text-blue-600 underline underline-offset-4"
          >
            Start a Clarity Session
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <Link
        to="/live"
        className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-blue-500 hover:bg-blue-600 text-white font-semibold h-auto shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 transition-all ${buttonClasses}`}
      >
        Start a Clarity Session
      </Link>
      <p className="text-muted-foreground">
        or{" "}
        <Link
          to="/sign-pledge"
          className="text-blue-500 hover:text-blue-600 underline underline-offset-4"
        >
          Take the Pledge
        </Link>
      </p>
    </div>
  );
}
