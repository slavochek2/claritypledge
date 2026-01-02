import { Link } from "react-router-dom";

export function CTASection() {
  return (
    <section className="py-20 lg:py-32 px-4">
      <div className="container mx-auto max-w-5xl text-center">
        {/* Headline */}
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-8">
          We all crave being understood<br className="hidden sm:block" />
          <span className="text-blue-500"> Let's commit to listen.</span>
        </h2>

        {/* Body */}
        <p className="text-xl lg:text-2xl text-foreground mb-12 leading-relaxed max-w-4xl mx-auto">
          The next time you are in a high-stakes conversation, will you choose
          the comfort of assumption, or the rigor of verified understanding?
        </p>

        {/* CTA - Primary + Secondary */}
        <div className="flex flex-col items-center gap-3">
          <Link
            to="/sign-pledge"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-blue-500 hover:bg-blue-600 text-white font-semibold text-xl px-12 py-8 h-auto"
          >
            Take the Clarity Pledge
          </Link>
          <p className="text-muted-foreground">
            or{" "}
            <Link
              to="/live"
              className="text-blue-500 hover:text-blue-600 underline underline-offset-4"
            >
              Try a Clarity Meeting
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
