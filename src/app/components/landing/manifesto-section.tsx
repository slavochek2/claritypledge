export function ManifestoSection() {
  return (
    <section id="manifesto" className="py-20 lg:py-32 px-4 scroll-mt-20">
      <div className="container mx-auto max-w-4xl">
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-center mb-16">
          The Manifesto
        </h2>

        <div className="prose prose-lg lg:prose-xl max-w-none">
          <div className="space-y-8 text-lg lg:text-xl leading-relaxed">
            <p className="text-foreground">
              We live in a world where people assume they understand each other.
              They don't. They guess. And when those guesses are wrong, we pay
              the price—in rework, in mistakes, in conflicts, in broken trust,
              in failure.
            </p>

            <p className="text-foreground">
              This is the{" "}
              <strong>Clarity Tax</strong>: the
              hidden cost of unverified understanding.
            </p>

            <p className="text-foreground">
              We pay this tax not because we're careless, but because we're
              human. Asking someone to verify their understanding feels risky.
              It can seem insulting, disruptive, or rude. So we stay silent. We
              assume. And we pay.
            </p>

            <p className="text-foreground">
              The Clarity Pledge changes this. It's a public commitment that
              says:{" "}
              <em>
                "You have the right to ask how well I understand you. I welcome
                it. I expect it. I'll answer with an honest number, without
                judgment, and trust the lower of our two."
              </em>
            </p>

            <p className="text-foreground">
              This isn't about being nice. It's about being real. It's about
              replacing the comfort of assumption with the rigor of alignment.
              It's about making understanding win over comfort, fear, and ego.
            </p>

            <p className="text-foreground font-semibold text-xl lg:text-2xl">
              The Pledge is not for you. It's for everyone else. By granting
              others the right to verify, you earn the authority to ask for it
              yourself.
            </p>

            <p className="text-foreground">
              This is how culture changes. Not through force, but through
              invitation. Not through rules, but through example. Not through
              perfection, but through practice.
            </p>

            <p className="text-foreground font-bold text-xl lg:text-2xl text-center mt-12">
              Stop subsidizing confusion. Take the pledge.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
