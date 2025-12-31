/**
 * @file alternative-landing-page.tsx
 * @description Alternative landing page with tool-first approach.
 * The primary CTA is "Start a Meeting" (the /live tool), with the pledge
 * positioned as an aspirational "graduation" for committed users.
 *
 * Compare with clarity-pledge-landing.tsx (pledge-first approach) to evaluate
 * which resonates better with users.
 */
import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { AlternativeNavigation } from "@/app/components/layout/alternative-navigation";
import { SEO } from "@/app/components/seo";
import { analytics } from "@/lib/mixpanel";
import { ClarityFooter } from "@/app/components/layout/clarity-footer";
import { AlternativeHeroSection } from "@/app/components/landing/alternative-hero-section";
import { AlternativeHowItWorks } from "@/app/components/landing/alternative-how-it-works";
import { HowItWorks } from "@/app/components/landing/how-it-works";
import { BenefitsSection } from "@/app/components/landing/benefits-section";
import { TargetAudience } from "@/app/components/landing/target-audience";

export function AlternativeLandingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [visibleSections, setVisibleSections] = useState<Set<number>>(
    new Set([0])
  );

  // Track landing page view (intentionally fires once on mount)
  useEffect(() => {
    analytics.track('alternative_landing_page_viewed', {
      referrer: searchParams.get('referrer') || undefined,
      variant: 'tool-first',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-navigate if referrer or login param is present
  useEffect(() => {
    const referrer = searchParams.get("referrer");
    const login = searchParams.get("login");
    if (referrer) {
      navigate("/live");
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
    <div className="relative overflow-x-hidden">
      <SEO
        url="/alternative"
        title="Clarity Pledge - Verify Understanding"
        description="Did they actually get what you meant? Share a link, rate understanding, bridge the gaps. Free tool for verifying mutual understanding after important conversations."
      />
      {/* Navigation */}
      <AlternativeNavigation />

      {/* 1. Hero Section (Tool-first) */}
      <div data-section-index="0" className={getSectionClassName(0)}>
        <AlternativeHeroSection />
      </div>

      {/* 2. How It Works (Tool steps) */}
      <div data-section-index="1" className={getSectionClassName(1)}>
        <AlternativeHowItWorks />
      </div>

      {/* 3. Why It Matters */}
      <div data-section-index="2" className={getSectionClassName(2)}>
        <HowItWorks />
      </div>

      {/* 4. Benefits */}
      <div data-section-index="3" className={getSectionClassName(3)}>
        <BenefitsSection />
      </div>

      {/* 5. Target Audience */}
      <div data-section-index="4" className={getSectionClassName(4)}>
        <TargetAudience />
      </div>

      {/* Footer */}
      <ClarityFooter />
    </div>
  );
}
