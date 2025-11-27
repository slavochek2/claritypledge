import { ShieldCheckIcon, ArrowLeftRightIcon, RepeatIcon } from "lucide-react";

export function HowItWorks() {
  const steps = [
    {
      icon: ShieldCheckIcon,
      title: "Create Psychological Safety",
      description:
        'You remove the fear of "offending" you by attempting to verify your understanding.',
    },
    {
      icon: ArrowLeftRightIcon,
      title: "Help Others Experience Clarity",
      description:
        "You empower others to satisfy their universal human need to be understood.",
    },
    {
      icon: RepeatIcon,
      title: "Inspire Reciprocity",
      description:
        "You make clarity contagious and gain authority to ask for verification of understanding yourself.",
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
            Clarity Pledge Improves the Communication Culture
          </p>
        </div>

        {/* Three Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-16">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`flex flex-col items-center text-center p-8 rounded-lg ${
                index % 2 === 0 ? "bg-background" : "bg-muted/50"
              }`}
            >
              {/* Icon */}
              <div className="w-20 h-20 lg:w-24 lg:h-24 flex items-center justify-center mb-6">
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
      </div>
    </section>
  );
}
