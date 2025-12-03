import {
  ShieldCheckIcon,
  TargetIcon,
  HeartHandshakeIcon,
  ClockIcon,
} from "lucide-react";

export function BenefitsSection() {
  const benefits = [
    { icon: ShieldCheckIcon, text: "Prevent conflicts" },
    { icon: TargetIcon, text: "Eliminate errors" },
    { icon: HeartHandshakeIcon, text: "Build trust" },
  ];

  return (
    <section className="py-20 lg:py-32 px-4">
      <div className="container mx-auto max-w-4xl">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
            Your impact
          </h2>
          <p className="text-xl lg:text-2xl text-muted-foreground font-medium">
            Clear communication creates ripple effects — for your team, your projects, and your reputation.
          </p>
        </div>

        {/* Three Benefits */}
        <div className="flex flex-col sm:flex-row justify-center items-center gap-8 sm:gap-12 lg:gap-16">
          {benefits.map((item, index) => (
            <div key={index} className="flex flex-col items-center gap-3 text-center">
              <item.icon className="w-14 h-14 lg:w-16 lg:h-16 text-blue-500 stroke-[1.5]" />
              <p className="text-lg lg:text-xl font-medium">{item.text}</p>
            </div>
          ))}
        </div>

        {/* Speed Benefit Highlight */}
        <div className="mt-16 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-8 lg:p-12">
          <div className="flex flex-col lg:flex-row gap-8 items-center">
            <div className="flex-1 space-y-4">
              <h3 className="text-2xl lg:text-3xl font-bold">
                The Efficiency Paradox: Slow Down to Speed Up
              </h3>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Checking for understanding feels slower in the moment, but it is
                infinitely faster in the long run. The &quot;Clarity Tax&quot;—the cost of
                fixing misunderstandings later—is far more expensive than the 30
                seconds it takes to verify now.
              </p>
            </div>
            <div className="flex-shrink-0 bg-background p-6 rounded-full shadow-sm">
              <ClockIcon className="w-16 h-16 text-blue-500 stroke-[1.5]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
