import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface Signature {
  name: string;
  role: string;
  reason: string;
  avatarColor: string;
}

export function SignatureWall() {
  // Helper function to get initials from name
  const getInitials = (fullName: string) => {
    return fullName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const signatures: Signature[] = [
    {
      name: "Sarah Chen",
      role: "Product Director",
      reason: "I joined because assumptions cost me a friendship.",
      avatarColor: "#0044CC",
    },
    {
      name: "Marcus Johnson",
      role: "Engineering Lead",
      reason: "I joined to build better products.",
      avatarColor: "#7C3AED",
    },
    {
      name: "Aisha Patel",
      role: "UX Researcher",
      reason: "I joined because clarity is kindness.",
      avatarColor: "#DC2626",
    },
    {
      name: "David Kim",
      role: "Startup Founder",
      reason: "I joined because misalignment killed my last company.",
      avatarColor: "#059669",
    },
    {
      name: "Elena Rodriguez",
      role: "Team Coach",
      reason: "I joined to help teams stop talking past each other.",
      avatarColor: "#EA580C",
    },
    {
      name: "James Wilson",
      role: "Policy Advisor",
      reason: "I joined because democracy requires mutual understanding.",
      avatarColor: "#0891B2",
    },
  ];

  const displayedSignatures = signatures.slice(0, 6);

  return (
    <section id="signatures" className="py-20 lg:py-32 px-4 scroll-mt-20">
      <div className="container mx-auto max-w-7xl">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            Meet the Clarity Champions
          </h2>
          <p className="text-xl lg:text-2xl text-muted-foreground">
            These are the people building the foundation of a clearer world.
          </p>
        </div>

        {/* Signature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {displayedSignatures.map((signature, index) => (
            <div
              key={index}
              className="bg-card border border-border p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow"
            >
              {/* Avatar and Info */}
              <div className="flex items-start gap-4 mb-4">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
                  style={{ backgroundColor: signature.avatarColor }}
                >
                  {getInitials(signature.name)}
                </div>

                <div>
                  <h3 className="text-xl font-bold">{signature.name}</h3>
                  <p className="text-base text-muted-foreground">
                    {signature.role}
                  </p>
                </div>
              </div>

              {/* Reason */}
              <p className="text-lg italic text-foreground leading-relaxed">
                "{signature.reason}"
              </p>
            </div>
          ))}
        </div>

        {/* View All Button */}
        <div className="text-center">
          <Button
            asChild
            variant="outline"
            size="lg"
            className="text-lg font-semibold"
          >
            <Link to="/clarity-champions">View All Clarity Champions</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
