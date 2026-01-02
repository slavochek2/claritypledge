import { Link2Icon, MessageSquareIcon, CheckCircleIcon } from "lucide-react";
import { Link } from "react-router-dom";

export function AlternativeHowItWorks() {
  const steps = [
    {
      icon: Link2Icon,
      step: "1",
      title: "Share a link",
      description:
        "Start a clarity meeting and share the link with anyone you've just had an important conversation with.",
    },
    {
      icon: MessageSquareIcon,
      step: "2",
      title: "Rate understanding",
      description:
        'Both of you answer: "Did I understand you?" and "Did you understand me?" Rate your confidence on a simple scale.',
    },
    {
      icon: CheckCircleIcon,
      step: "3",
      title: "Bridge the gaps",
      description:
        "See where understanding breaks down. Clarify before misalignment becomes costly.",
    },
  ];

  return (
    <section className="py-20 lg:py-32 px-4 bg-muted/30">
      <div className="container mx-auto max-w-7xl">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
            How it works
          </h2>
          <p className="text-2xl lg:text-3xl text-muted-foreground font-medium">
            Verify understanding in 2 minutes
          </p>
        </div>

        {/* Three Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-16">
          {steps.map((step, index) => (
            <div
              key={index}
              className="flex flex-col items-center text-center p-8 rounded-lg bg-background transition-all duration-200 hover:shadow-lg hover:-translate-y-1"
            >
              {/* Step Number Badge */}
              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold mb-4">
                {step.step}
              </div>

              {/* Icon */}
              <div className="w-16 h-16 lg:w-20 lg:h-20 flex items-center justify-center mb-6">
                <step.icon className="w-full h-full text-blue-500 stroke-[1.5]" />
              </div>

              {/* Title */}
              <h3 className="text-2xl lg:text-3xl font-bold mb-4">
                {step.title}
              </h3>

              {/* Description */}
              <p className="text-lg lg:text-xl text-foreground leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-16">
          <Link
            to="/live"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-blue-500 hover:bg-blue-600 text-white font-semibold text-base sm:text-lg px-8 py-4 h-auto shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 transition-all"
          >
            Try it now
          </Link>
        </div>
      </div>
    </section>
  );
}
