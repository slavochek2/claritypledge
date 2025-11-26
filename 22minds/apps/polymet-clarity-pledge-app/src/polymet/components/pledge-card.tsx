export function PledgeCard() {
  return (
    <section className="py-16 lg:py-24 px-4">
      <div className="container mx-auto max-w-6xl">
        {/* Section Header - Simplified */}
        <div className="text-center mb-12 lg:mb-16">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
            Sign the Clarity Pledge
          </h2>
          <p className="text-xl lg:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            A public promise to{" "}
            <span className="font-bold text-foreground">everyone</span>
            —including strangers, people you disagree with, and even those you
            dislike to verify you understand their ideas in the way they mean
            it.
          </p>
        </div>

        {/* The Pledge Card - CENTERPIECE */}
        <div className="max-w-4xl mx-auto">
          <div className="relative bg-[#FDFBF7] dark:bg-card border-2 border-[#1A1A1A] dark:border-border shadow-2xl hover:shadow-3xl transition-all duration-300 group rounded-lg overflow-hidden">
            {/* Corner Decorations - Blue brackets for modern touch */}
            <div className="absolute top-0 left-0 w-12 h-12 border-t-[6px] border-l-[6px] border-[#0044CC] dark:border-blue-500 rounded-tl-lg" />

            <div className="absolute top-0 right-0 w-12 h-12 border-t-[6px] border-r-[6px] border-[#0044CC] dark:border-blue-500 rounded-tr-lg" />

            <div className="absolute bottom-0 left-0 w-12 h-12 border-b-[6px] border-l-[6px] border-[#0044CC] dark:border-blue-500 rounded-bl-lg" />

            <div className="absolute bottom-0 right-0 w-12 h-12 border-b-[6px] border-r-[6px] border-[#0044CC] dark:border-blue-500 rounded-br-lg" />

            <div className="p-10 lg:p-16">
              {/* Card Title */}
              <div className="text-center space-y-2 mb-12">
                <h3 className="text-3xl lg:text-4xl font-bold tracking-wider text-[#1A1A1A] dark:text-foreground">
                  CLARITY PRINCIPLE
                </h3>
                <div className="w-24 h-0.5 bg-[#0044CC] dark:bg-blue-500 mx-auto" />
              </div>

              {/* Your Right Section */}
              <div className="mb-10">
                <h4 className="text-2xl lg:text-3xl font-bold text-[#0044CC] dark:text-blue-400 mb-5 tracking-wide">
                  YOUR RIGHT
                </h4>
                <p className="text-xl lg:text-2xl leading-relaxed text-[#1A1A1A] dark:text-foreground">
                  When we talk, if you need to check whether I understood your
                  idea in the way you meant it, please ask me to{" "}
                  <span className="font-bold">explain back</span> to you how I
                  understood it.
                </p>
              </div>

              {/* My Promise Section */}
              <div className="mb-10">
                <h4 className="text-2xl lg:text-3xl font-bold text-[#0044CC] dark:text-blue-400 mb-5 tracking-wide">
                  MY PROMISE
                </h4>
                <p className="text-xl lg:text-2xl leading-relaxed text-[#1A1A1A] dark:text-foreground">
                  I promise to <span className="font-bold">try</span> to{" "}
                  <span className="font-bold">explain back</span> what I think
                  you meant
                  <span className="font-bold">
                    {" "}
                    without judgment or criticism
                  </span>{" "}
                  so you can confirm or correct my understanding. If I cannot
                  follow this promise, I will explain why.
                </p>
              </div>

              {/* Unsigned Notice */}
              <div className="text-center pt-6 border-t-2 border-[#1A1A1A] dark:border-border">
                <p className="text-sm lg:text-base text-muted-foreground">
                  This pledge becomes official when you sign it
                </p>
                <div className="flex justify-center mt-4">
                  <div className="w-16 h-16 rounded-full border-4 border-[#0044CC] dark:border-blue-500 flex items-center justify-center bg-[#FDFBF7] dark:bg-card">
                    <div className="w-12 h-12 rounded-full bg-[#0044CC]/10 dark:bg-blue-500/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-[#0044CC] dark:text-blue-400">
                        2025
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
