export function TargetAudience() {
  const audiences = [
    {
      title: "The Leader",
      description: "who knows that a vision misunderstood is a vision failed.",
    },
    {
      title: "The Citizen",
      description:
        "who refuses to engage in polarized noise and demands shared meaning.",
    },
    {
      title: "The Neurodivergent",
      description: "who can't fake understanding.",
    },
  ];

  return (
    <section className="py-20 lg:py-32 px-4 bg-muted/30">
      <div className="container mx-auto max-w-5xl">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
            Who is it for
          </h2>
          <p className="text-xl lg:text-2xl text-muted-foreground font-medium">
            Everybody who wants to make Win-Win situations a standard
          </p>
        </div>

        {/* Audience Cards */}
        <div className="space-y-8">
          {audiences.map((audience, index) => (
            <div
              key={index}
              className="bg-card border border-border p-8 lg:p-10 rounded-lg shadow-md hover:shadow-lg transition-shadow"
            >
              <p className="text-2xl lg:text-3xl leading-relaxed">
                <span className="font-bold text-blue-500">
                  {audience.title}
                </span>{" "}
                <span className="text-foreground">{audience.description}</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
