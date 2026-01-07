import { DualCTA } from "./dual-cta";

export function CTASection() {
  return (
    <section className="py-20 lg:py-32 px-4">
      <div className="container mx-auto max-w-5xl text-center">
        {/* Headline */}
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-8">
          Everyone nods.<br className="hidden sm:block" />
          <span className="text-blue-500"> Nobody understands.</span>
        </h2>

        {/* Subheadline */}
        <p className="text-xl lg:text-2xl text-foreground mb-12 leading-relaxed max-w-4xl mx-auto">
          Break the pattern.
        </p>

        {/* CTA - Primary + Secondary */}
        <DualCTA />
      </div>
    </section>
  );
}
