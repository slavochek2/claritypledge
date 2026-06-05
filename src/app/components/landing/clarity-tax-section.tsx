import { useState, useEffect } from "react";
import { DualCTA } from "./dual-cta";
import { PledgerAvatarStack, TrustSignals, ScrollIndicator } from "./social-proof";

export function ClarityTaxSection() {
  const [showLine2, setShowLine2] = useState(false);
  const [showLine3, setShowLine3] = useState(false);

  useEffect(() => {
    const timer1 = setTimeout(() => setShowLine2(true), 425);   // 0.425s
    const timer2 = setTimeout(() => setShowLine3(true), 1400);  // 1.4s - punch after pause
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  return (
    <section className="relative px-4 py-20 lg:py-32">
      {/* Subtle Background Grid */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />

      <div className="container mx-auto max-w-5xl">
        {/* Centered Single-Column Layout */}
        <div className="text-center space-y-10">
          {/* Headline */}
          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight">
              Everyone assumes they understand.
              <br />
              <span
                className={`inline-block transition-all duration-700 text-blue-500 ${
                  showLine2 ? "opacity-100 blur-0" : "opacity-0 blur-sm"
                }`}
              >
                Nobody measures.
              </span>
              <br />
              <span
                className={`inline-block transition-opacity duration-300 text-muted-foreground ${
                  showLine3 ? "opacity-100" : "opacity-0"
                }`}
              >
                Trust dies.
              </span>
            </h1>
          </div>

          {/* CTA - Primary + Secondary */}
          <DualCTA size="hero" className="pt-4" />

          {/* Social Proof - Compact Avatar Stack */}
          <PledgerAvatarStack className="pt-2" />

          {/* Trust Signal */}
          <TrustSignals />

          {/* Scroll Indicator */}
          <ScrollIndicator />
        </div>
      </div>
    </section>
  );
}
