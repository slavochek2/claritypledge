import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ClarityNavigation } from "@/polymet/components/clarity-navigation";
import { ClarityTaxSection } from "@/polymet/components/clarity-tax-section";
import { HowItWorks } from "@/polymet/components/how-it-works";
import { BenefitsSection } from "@/polymet/components/benefits-section";
import { TargetAudience } from "@/polymet/components/target-audience";
import { SignatureWall } from "@/polymet/components/signature-wall";
import { ProfileCertificate } from "@/polymet/components/profile-certificate";
import { FAQSection } from "@/polymet/components/faq-section";
import { CTASection } from "@/polymet/components/cta-section";
import { ClarityFooter } from "@/polymet/components/clarity-footer";
import { PledgeModal } from "@/polymet/components/pledge-modal";

export function ClarityPledgeLanding() {
  const [searchParams] = useSearchParams();
  const [isPledgeModalOpen, setIsPledgeModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"sign" | "login">("sign");
  const [visibleSections, setVisibleSections] = useState<Set<number>>(
    new Set([0])
  );

  // Auto-open modal if referrer or login param is present
  useEffect(() => {
    const referrer = searchParams.get("referrer");
    const login = searchParams.get("login");
    if (referrer) {
      setModalMode("sign");
      setIsPledgeModalOpen(true);
    } else if (login) {
      setModalMode("login");
      setIsPledgeModalOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = parseInt(
              entry.target.getAttribute("data-section-index") || "0"
            );
            setVisibleSections((prev) => new Set([...prev, index]));
          }
        });
      },
      { threshold: 0.1 }
    );

    const sections = document.querySelectorAll("[data-section-index]");
    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  const getSectionClassName = (index: number) => {
    return visibleSections.has(index)
      ? "opacity-100 translate-y-0 transition-all duration-700 ease-out"
      : "opacity-0 translate-y-8";
  };

  return (
    <div className="relative">
      {/* Navigation */}
      <ClarityNavigation
        onTakePledge={() => {
          setModalMode("sign");
          setIsPledgeModalOpen(true);
        }}
        onSignIn={() => {
          setModalMode("login");
          setIsPledgeModalOpen(true);
        }}
      />

      {/* 1. Clarity Tax Section (Hero) */}
      <div data-section-index="0" className={getSectionClassName(0)}>
        <ClarityTaxSection
          onTakePledge={() => {
            setModalMode("sign");
            setIsPledgeModalOpen(true);
          }}
        />
      </div>

      {/* 2. Founder's Certificate */}
      <div data-section-index="1" className={getSectionClassName(1)}>
        <section className="py-16 md:py-24 bg-background">
          <div className="container mx-auto max-w-4xl px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Break the Illusion of Shared Reality
              </h2>
              <p className="text-lg text-muted-foreground">
                We assume we understand each other, but often it’s just a guess.
                The Clarity Pledge is a public promise to stop guessing and
                start verifying.
              </p>
            </div>
            <ProfileCertificate
              name="Vyacheslav Ladischenski"
              signedAt="2025-11-01"
              role="Founder, The Clarity Pledge"
              isVerified={true}
              linkedinUrl="https://linkedin.com/in/vyacheslavladischenski"
            />
          </div>
        </section>
      </div>

      {/* How It Works */}
      <div data-section-index="2" className={getSectionClassName(2)}>
        <HowItWorks />
      </div>

      {/* Benefits */}
      <div data-section-index="3" className={getSectionClassName(3)}>
        <BenefitsSection />
      </div>

      {/* Target Audience */}
      <div data-section-index="4" className={getSectionClassName(4)}>
        <TargetAudience />
      </div>

      {/* Signature Wall */}
      <div data-section-index="5" className={getSectionClassName(5)}>
        <SignatureWall />
      </div>

      {/* Final CTA */}
      <div data-section-index="6" className={getSectionClassName(6)}>
        <CTASection
          onTakePledge={() => {
            setModalMode("sign");
            setIsPledgeModalOpen(true);
          }}
        />
      </div>

      {/* FAQ */}
      <div data-section-index="7" className={getSectionClassName(7)}>
        <FAQSection />
      </div>

      {/* Footer */}
      <ClarityFooter />

      {/* Pledge Modal */}
      <PledgeModal
        open={isPledgeModalOpen}
        onOpenChange={setIsPledgeModalOpen}
        initialMode={modalMode}
      />
    </div>
  );
}
