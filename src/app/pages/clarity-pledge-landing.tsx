/**
 * @file clarity-pledge-landing.tsx
 * @description This is the main landing page for the Polymet Clarity Pledge.
 * It serves as the primary entry point for new visitors, explaining what the pledge is,
 * why it's important, and how it works. It's composed of several sections,
 * each highlighting a different aspect of the pledge, from the "clarity tax" to the benefits of signing.
 * The goal of this page is to educate and persuade visitors to take the pledge.
 */
import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { SimpleNavigation } from "@/app/components/layout/simple-navigation";
import { ClarityFooter } from "@/app/components/layout/clarity-footer";
import { ClarityTaxSection } from "@/app/components/landing/clarity-tax-section";
import { HowItWorks } from "@/app/components/landing/how-it-works";
import { BenefitsSection } from "@/app/components/landing/benefits-section";
import { TargetAudience } from "@/app/components/landing/target-audience";
import { FAQSection } from "@/app/components/landing/faq-section";
import { CTASection } from "@/app/components/landing/cta-section";
import { SignatureWall } from "@/app/components/social/signature-wall";
import { ProfileCertificate } from "@/app/components/profile/profile-certificate";

export function ClarityPledgeLanding() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [visibleSections, setVisibleSections] = useState<Set<number>>(
    new Set([0])
  );

  // Auto-navigate if referrer or login param is present
  useEffect(() => {
    const referrer = searchParams.get("referrer");
    const login = searchParams.get("login");
    if (referrer) {
      navigate("/sign-pledge");
    } else if (login) {
      navigate("/login");
    }
  }, [searchParams, navigate]);

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
      ? "opacity-100 translate-y-0 transition-all duration-500 ease-out"
      : "opacity-0 translate-y-8";
  };

  return (
    <div className="relative">
      {/* Navigation */}
      <SimpleNavigation />

      {/* 1. Clarity Tax Section (Hero) */}
      <div data-section-index="0" className={getSectionClassName(0)}>
        <ClarityTaxSection />
      </div>

      {/* 2. Founder's Certificate */}
      <div data-section-index="1" className={getSectionClassName(1)}>
        <section className="py-16 md:py-24 bg-background">
          <div className="container mx-auto max-w-4xl px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Get your clarity certificate
              </h2>
              <p className="text-lg text-muted-foreground">
                Prevent the rework, mistakes and mistrust caused by false agreements.
              </p>
            </div>
            <ProfileCertificate
              name="Vyacheslav Ladischenski"
              signedAt="2025-11-01"
              role="Founder, The Clarity Pledge"
              linkedinUrl="https://linkedin.com/in/ladischenski"
              showQrCode={true}
              profileUrl="https://claritypledge.com/p/slava"
              photoUrl="/founder-photo.jpg"
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
        <CTASection />
      </div>

      {/* FAQ */}
      <div data-section-index="7" className={getSectionClassName(7)}>
        <FAQSection />
      </div>

      {/* Footer */}
      <ClarityFooter />
    </div>
  );
}
