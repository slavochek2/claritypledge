import { VideoIcon, UsersIcon, BadgeCheckIcon } from "lucide-react";

export function UserJourneySection() {
  const steps = [
    {
      icon: VideoIcon,
      step: "1",
      title: "Start a Clarity Meeting",
      description:
        "Start a meeting, rate understanding, bridge the gaps.",
    },
    {
      icon: UsersIcon,
      step: "2",
      title: "Create Clarity Partnerships",
      description:
        "Commit to specific people — your team, clients, partners.",
      comingSoon: true,
    },
    {
      icon: BadgeCheckIcon,
      step: "3",
      title: "Take the Pledge",
      description:
        "Go public. Commit to everyone. Earn your certificate.",
    },
  ];

  return (
    <section className="py-20 lg:py-32 px-4 bg-muted/30">
      <div className="container mx-auto max-w-7xl">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
            Your journey to clarity
          </h2>
          <p className="text-2xl lg:text-3xl text-muted-foreground font-medium">
            Start small, grow your commitment
          </p>
        </div>

        {/* Three Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
          {steps.map((step, index) => (
            <div
              key={index}
              className="flex flex-col items-center text-center p-8 rounded-lg bg-background border border-transparent transition-all duration-200 hover:shadow-lg hover:-translate-y-1 hover:border-blue-200"
            >
              {/* Step Number Badge */}
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-xl font-bold mb-4">
                {step.step}
              </div>

              {/* Icon */}
              <div className="w-16 h-16 lg:w-20 lg:h-20 flex items-center justify-center mb-6">
                <step.icon className="w-full h-full text-blue-500 stroke-[1.5]" />
              </div>

              {/* Title */}
              <h3 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-4">
                {step.title}
              </h3>

              {/* Description */}
              <p className="text-lg text-foreground leading-relaxed">
                {step.description}
              </p>

              {/* Coming Soon badge for step 2 */}
              {step.comingSoon && (
                <span className="mt-4 text-xs text-muted-foreground">
                  Coming soon
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
