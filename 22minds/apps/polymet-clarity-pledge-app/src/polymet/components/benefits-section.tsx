import {
  ShieldCheckIcon,
  AlertCircleIcon,
  HeartHandshakeIcon,
  AwardIcon,
  ArrowLeftRightIcon,
  UsersIcon,
  ClockIcon,
} from "lucide-react";

export function BenefitsSection() {
  const othersGet = [
    { icon: ShieldCheckIcon, text: "Prevent Conflicts" },
    { icon: AlertCircleIcon, text: "Eliminate Errors" },
    { icon: HeartHandshakeIcon, text: "Build Trust" },
  ];

  const youGet = [
    {
      icon: AwardIcon,
      text: "Gain Reputation",
      description: "Get recognized as somebody who values clarity over ego",
    },
    {
      icon: ArrowLeftRightIcon,
      text: "Unlock Reciprocity",
      description: "Gain authority to verify others' understanding",
    },
    {
      icon: UsersIcon,
      text: "Join Clarity Practice Community",
      description:
        "Exchange insights within an exclusive clarity practice community of people who took the pledge",
    },
  ];

  return (
    <section className="py-20 lg:py-32 px-4">
      <div className="container mx-auto max-w-6xl">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
            The Pledge Empowers You To Help Others
          </h2>
          <p className="text-2xl lg:text-3xl text-muted-foreground font-medium">
            Your public promise builds certainty in your commitment to clarity.
          </p>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
          {/* You Help Others Get */}
          <div className="bg-card border border-border p-8 lg:p-10 rounded-lg shadow-lg">
            <h3 className="text-3xl lg:text-4xl font-bold mb-8 text-center">
              Your Gift to Others
            </h3>
            <div className="space-y-6">
              {othersGet.map((item, index) => (
                <div key={index} className="flex items-center gap-4">
                  <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center">
                    <item.icon className="w-full h-full text-blue-500 stroke-[1.5]" />
                  </div>
                  <p className="text-xl lg:text-2xl font-semibold">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* You Get */}
          <div className="bg-card border border-border p-8 lg:p-10 rounded-lg shadow-lg">
            <h3 className="text-3xl lg:text-4xl font-bold mb-8 text-center">
              Your Benefits
            </h3>
            <div className="space-y-8">
              {youGet.map((item, index) => (
                <div key={index} className="flex gap-4">
                  <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center">
                    <item.icon className="w-full h-full text-blue-500 stroke-[1.5]" />
                  </div>
                  <div>
                    <p className="text-xl lg:text-2xl font-semibold mb-2">
                      {item.text}
                    </p>
                    <p className="text-base lg:text-lg text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
