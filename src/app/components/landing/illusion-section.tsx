export function IllusionSection() {
  return (
    <section className="py-20 lg:py-32 px-4 bg-background">
      <div className="container mx-auto max-w-5xl">
        <div className="border-2 border-blue-500/30 rounded-xl p-8 lg:p-12 bg-gradient-to-br from-blue-50/50 to-sky-50/30 dark:from-blue-950/20 dark:to-sky-950/10 shadow-lg">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6 text-center leading-tight">
            Break the{" "}
            <span className="text-blue-600 dark:text-blue-500">
              Illusion of Shared Reality
            </span>
          </h2>
          <p className="text-lg lg:text-2xl text-foreground/80 leading-relaxed text-center max-w-3xl mx-auto">
            People assume they understand what you mean and often it remains
            just a guess.
          </p>
        </div>
      </div>
    </section>
  );
}
