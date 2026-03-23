import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { analytics } from "@/lib/mixpanel";

/**
 * 404 page — catch-all for unknown routes.
 * Three animation variants live at /tree/404-* for preview.
 * The production one is "drift" (default export).
 */

// ─── Variant A: "Drift" — letters float apart and reassemble ───

export function NotFoundDrift() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 select-none">
      <div className="relative mb-8">
        <div className="flex gap-1">
          {"404".split("").map((char, i) => (
            <span
              key={i}
              className="text-8xl font-bold text-muted-foreground/20 animate-drift"
              style={{
                animationDelay: `${i * 0.15}s`,
                animationDuration: "3s",
              }}
            >
              {char}
            </span>
          ))}
        </div>
      </div>

      <h2 className="text-xl font-semibold text-foreground mb-2">
        Page not found
      </h2>
      <p className="text-muted-foreground text-center max-w-sm mb-8">
        This page doesn't exist. It may have been moved or the URL is misspelled.
      </p>

      <Link
        to="/"
        className="text-sm font-medium text-blue-500 hover:text-blue-600 transition-colors"
      >
        Back to home
      </Link>

      <style>{`
        @keyframes drift {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.2; }
          25% { transform: translateY(-18px) rotate(-3deg); opacity: 0.35; }
          50% { transform: translateY(8px) rotate(2deg); opacity: 0.15; }
          75% { transform: translateY(-10px) rotate(-1deg); opacity: 0.3; }
        }
        .animate-drift {
          animation: drift 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

// ─── Variant B: "Glitch" — text scrambles then resolves ───

export function NotFoundGlitch() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 select-none">
      <div className="relative mb-8">
        <span className="text-8xl font-bold text-muted-foreground/25 animate-glitch-text">
          404
        </span>
      </div>

      <h2 className="text-xl font-semibold text-foreground mb-2 animate-glitch-reveal">
        Page not found
      </h2>
      <p className="text-muted-foreground text-center max-w-sm mb-8 animate-glitch-reveal" style={{ animationDelay: "0.2s" }}>
        This page doesn't exist. It may have been moved or the URL is misspelled.
      </p>

      <Link
        to="/"
        className="text-sm font-medium text-blue-500 hover:text-blue-600 transition-colors animate-glitch-reveal"
        style={{ animationDelay: "0.4s" }}
      >
        Back to home
      </Link>

      <style>{`
        @keyframes glitch-text {
          0%, 100% { transform: translate(0); filter: blur(0); }
          10% { transform: translate(-2px, 1px); filter: blur(1px); }
          20% { transform: translate(2px, -1px); filter: blur(0); }
          30% { transform: translate(-1px, 2px); filter: blur(0.5px); }
          40% { transform: translate(1px, -2px); filter: blur(0); }
          50% { transform: translate(0); filter: blur(0); }
        }
        .animate-glitch-text {
          animation: glitch-text 4s ease-in-out infinite;
        }
        @keyframes glitch-reveal {
          0% { opacity: 0; transform: translateY(8px); filter: blur(4px); }
          100% { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        .animate-glitch-reveal {
          animation: glitch-reveal 0.6s ease-out forwards;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}

// ─── Variant C: "Compass" — spinning needle that can't find north ───

export function NotFoundCompass() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 select-none">
      <div className="relative mb-8 w-32 h-32">
        {/* Compass ring */}
        <div className="absolute inset-0 rounded-full border-2 border-muted-foreground/20" />
        <div className="absolute inset-2 rounded-full border border-muted-foreground/10" />

        {/* Cardinal marks */}
        {["N", "E", "S", "W"].map((dir, i) => (
          <span
            key={dir}
            className="absolute text-xs font-medium text-muted-foreground/30"
            style={{
              top: i === 0 ? "4px" : i === 2 ? "auto" : "50%",
              bottom: i === 2 ? "4px" : "auto",
              left: i === 3 ? "6px" : i === 1 ? "auto" : "50%",
              right: i === 1 ? "6px" : "auto",
              transform: i === 0 || i === 2 ? "translateX(-50%)" : "translateY(-50%)",
            }}
          >
            {dir}
          </span>
        ))}

        {/* Spinning needle */}
        <div
          className="absolute top-1/2 left-1/2 w-0.5 h-12 -mt-6 -ml-px origin-bottom animate-compass-spin"
          style={{ transformOrigin: "center bottom" }}
        >
          <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[20px] border-l-transparent border-r-transparent border-b-blue-500/60" />
        </div>

        {/* Center dot */}
        <div className="absolute top-1/2 left-1/2 w-2 h-2 -mt-1 -ml-1 rounded-full bg-muted-foreground/30" />
      </div>

      <h2 className="text-xl font-semibold text-foreground mb-2">
        Lost your way?
      </h2>
      <p className="text-muted-foreground text-center max-w-sm mb-8">
        This page doesn't exist. It may have been moved or the URL is misspelled.
      </p>

      <Link
        to="/"
        className="text-sm font-medium text-blue-500 hover:text-blue-600 transition-colors"
      >
        Find your way home
      </Link>

      <style>{`
        @keyframes compass-spin {
          0% { transform: rotate(0deg); }
          15% { transform: rotate(120deg); }
          25% { transform: rotate(80deg); }
          40% { transform: rotate(250deg); }
          55% { transform: rotate(190deg); }
          70% { transform: rotate(340deg); }
          85% { transform: rotate(280deg); }
          100% { transform: rotate(360deg); }
        }
        .animate-compass-spin {
          animation: compass-spin 6s ease-in-out infinite;
          transform-origin: center bottom;
        }
      `}</style>
    </div>
  );
}

// Default export = production 404
export function NotFoundPage() {
  const location = useLocation();

  useEffect(() => {
    analytics.track('not_found_page_viewed', {
      attempted_path: location.pathname + location.search,
      referrer: document.referrer || 'direct',
    });
  }, [location.pathname, location.search]);

  return <NotFoundDrift />;
}
