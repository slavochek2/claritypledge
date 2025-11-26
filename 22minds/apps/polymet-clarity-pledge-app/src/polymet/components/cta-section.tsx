import { Button } from "@/components/ui/button";

interface CTASectionProps {
  onTakePledge: () => void;
}

export function CTASection({ onTakePledge }: CTASectionProps) {
  return (
    <section className="py-20 lg:py-32 px-4">
      <div className="container mx-auto max-w-5xl text-center">
        {/* Headline */}
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-8">
          Stop Confusion. Achieve Clarity.
        </h2>

        {/* Body */}
        <p className="text-xl lg:text-2xl text-foreground mb-12 leading-relaxed max-w-4xl mx-auto">
          The next time you are in a high-stakes conversation, will you choose
          the comfort of assumption, or the rigor of verified understanding?
        </p>

        {/* CTA Button */}
        <Button
          onClick={onTakePledge}
          size="lg"
          className="bg-blue-500 hover:bg-blue-600 text-white font-semibold text-xl px-12 py-8 h-auto"
        >
          Take the Pledge
        </Button>
      </div>
    </section>
  );
}
