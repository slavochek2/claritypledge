import { Button } from "@/components/ui/button";
import { RefreshCwIcon, AlertTriangleIcon, ShieldOffIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";

export function ClarityTaxSection() {
  const [isLoaded, setIsLoaded] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const painPoints = [
    {
      icon: RefreshCwIcon,
      title: "Rework",
    },
    {
      icon: AlertTriangleIcon,
      title: "Mistakes",
    },
    {
      icon: ShieldOffIcon,
      title: "Mistrust",
    },
  ];

  return (
    <section className="relative px-4 py-20 lg:py-32">
      {/* Subtle Background Grid */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />

      <div className="container mx-auto max-w-4xl">
        {/* Centered Single-Column Layout */}
        <div className="text-center space-y-10">
          {/* Headline - Benefit-Driven */}
          <div className="space-y-6">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight">
              Prevent dangerous{" "}
              <span
                className={`text-blue-500 inline-block transition-all duration-1000 delay-300 ${
                  isLoaded ? "blur-0 opacity-100" : "blur-lg opacity-0"
                }`}
              >
                misunderstandings
              </span>
            </h1>

            {/* Sub-headline - Problem Definition (No Box!) */}
            <p className="text-lg lg:text-xl text-muted-foreground leading-relaxed max-w-3xl mx-auto">
              Asking to{" "}
              <span className="text-foreground font-medium">
                repeat back what you understood
              </span>{" "}
              feels rude and awkward. Fix it with the Clarity Pledge.
            </p>
          </div>

          {/* Pain Points - PRIMARY Visual Hierarchy */}
          <div className="flex flex-wrap justify-center gap-3 lg:gap-4">
            {painPoints.map((item, index) => {
              const Icon = item.icon;
              return (
                <div
                  key={index}
                  className="inline-flex items-center gap-2 px-5 py-3 bg-destructive/10 dark:bg-destructive/20 border-2 border-destructive/20 dark:border-destructive/30 rounded-full"
                >
                  <Icon className="w-5 h-5 text-destructive" />

                  <span className="text-base lg:text-lg font-semibold text-foreground">
                    {item.title}
                  </span>
                </div>
              );
            })}
          </div>

          {/* CTAs - Low Friction */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              to="/sign-pledge"
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-blue-500 hover:bg-blue-600 text-white font-semibold text-lg px-10 py-6 h-auto shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 transition-all"
            >
              Take the Pledge
            </Link>
            <Button
              onClick={() => navigate("/manifesto")}
              variant="outline"
              size="lg"
              className="text-lg font-medium border-2 border-blue-500 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950 px-10 py-6 h-auto"
            >
              Read Manifesto
            </Button>
          </div>

          {/* Trust Signal */}
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-3 flex-wrap">
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
            <span className="text-muted-foreground/50">•</span>
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
              Join the movement
            </span>
            <span className="text-muted-foreground/50">•</span>
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
              Less than 30 seconds
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
