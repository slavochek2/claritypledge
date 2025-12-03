import { Link } from "react-router-dom";

export function CTASection() {
  return (
    <section className="py-20 lg:py-32 px-4">
      <div className="container mx-auto max-w-5xl text-center">
        {/* Headline */}
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-8">
          <span className="text-blue-500">Stop pretending</span>
          <br />
          nonsense makes sense
        </h2>

        {/* Body */}
        <p className="text-xl lg:text-2xl text-foreground mb-12 leading-relaxed max-w-4xl mx-auto">
          The next time you are in a high-stakes conversation, will you choose
          the comfort of assumption, or the rigor of verified understanding?
        </p>

        {/* CTA Button */}
        <Link
          to="/sign-pledge"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-blue-500 hover:bg-blue-600 text-white font-semibold text-xl px-12 py-8 h-auto"
        >
          Take the Clarity Pledge
        </Link>
      </div>
    </section>
  );
}
