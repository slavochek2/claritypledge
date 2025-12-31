import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

export function AlternativeHeroSection() {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  return (
    <section className="relative px-4 py-20 lg:py-32">
      {/* Subtle Background Grid */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />

      <div className="container mx-auto max-w-4xl">
        {/* Centered Single-Column Layout */}
        <div className="text-center space-y-10">
          {/* Headline - Tool-first Hook */}
          <div className="space-y-6">
            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold leading-[1.1] tracking-tight">
              Eliminate false agreements.
              <br className="hidden sm:block" />
              <span
                className={`inline-block transition-all duration-1000 delay-300 text-blue-500 ${
                  isLoaded ? "blur-0 opacity-100" : "blur-lg opacity-0"
                }`}
              >
                {" "}De-risk your relationships.
              </span>
            </h1>

            {/* Sub-headline - Action-oriented */}
            <p className="text-lg lg:text-xl text-muted-foreground leading-relaxed max-w-3xl mx-auto">
              Achieve clarity in your important conversations. Share a link, rate understanding, bridge the gaps.
            </p>
          </div>

          {/* CTA - Primary + Secondary */}
          <div className="flex flex-col items-center gap-4 pt-4">
            <Link
              to="/live"
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-blue-500 hover:bg-blue-600 text-white font-semibold text-base sm:text-lg px-8 py-4 sm:px-10 sm:py-6 h-auto shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 transition-all"
            >
              Start a Meeting
            </Link>
            <Link
              to="/article"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Learn about the Clarity Pledge →
            </Link>
          </div>

          {/* Trust Signals - Tool-focused */}
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <svg
                className="w-4 h-4 text-blue-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              No account needed
            </span>
            <span className="hidden sm:inline text-muted-foreground/50">•</span>
            <span className="inline-flex items-center gap-1">
              <svg
                className="w-4 h-4 text-blue-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              Free
            </span>
            <span className="hidden sm:inline text-muted-foreground/50">•</span>
            <span className="inline-flex items-center gap-1">
              <svg
                className="w-4 h-4 text-blue-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              2 minutes
            </span>
          </p>

          {/* Scroll Indicator */}
          <div className="pt-8">
            <svg
              className="w-6 h-6 mx-auto text-muted-foreground/50 animate-bounce"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
