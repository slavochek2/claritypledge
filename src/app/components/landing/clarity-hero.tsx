import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface ClarityHeroProps {
  onSignPledge: () => void;
}

export function ClarityHero({ onSignPledge }: ClarityHeroProps) {
  const [currentWord, setCurrentWord] = useState(0);
  const words = ["Comfort", "Fear", "Ego"];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentWord((prev) => (prev + 1) % words.length);
    }, 1300); // Adjusted timing for better readability
    return () => clearInterval(interval);
  }, []);

  const scrollToManifesto = () => {
    const element = document.getElementById("manifesto");
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <section className="relative min-h-[70vh] lg:min-h-[75vh] flex items-center justify-center px-4 py-16 lg:py-20 overflow-hidden">
      {/* Abstract Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-20 left-10 w-64 h-64 border border-border/20 rotate-12" />

        <div className="absolute bottom-32 right-20 w-96 h-96 border border-border/20 -rotate-6" />

        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-border/10 rounded-full" />
      </div>

      <div className="container mx-auto max-w-5xl text-center">
        {/* Main Headline */}
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-tight">
          Sign the Clarity Pledge
        </h1>

        {/* Subheadline */}
        <p className="text-2xl sm:text-3xl lg:text-4xl font-medium text-muted-foreground mb-8">
          A public promise for others to verify you understand their ideas in
          the way they mean it
        </p>

        {/* Dynamic Text */}
        <div className="text-xl sm:text-2xl lg:text-3xl font-medium mb-4 h-12 flex items-center justify-center">
          <span className="mr-2">Make understanding win over</span>
          <span className="inline-block min-w-[140px] text-left">
            <span
              key={currentWord}
              className="inline-block text-blue-500 font-bold animate-in fade-in duration-500"
            >
              [{words[currentWord]}]
            </span>
          </span>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            onClick={onSignPledge}
            size="lg"
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold text-lg px-8 py-6 h-auto"
          >
            Sign the Pledge
          </Button>
          <Button
            onClick={scrollToManifesto}
            variant="ghost"
            size="lg"
            className="text-lg font-medium"
          >
            Read the Manifesto
          </Button>
        </div>

      </div>
    </section>
  );
}
