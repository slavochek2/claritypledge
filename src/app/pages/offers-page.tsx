/**
 * Program Page — Clarity Champions (P1087, superseding P937/P951's three-tier
 * pricing-grid page).
 *
 * The canonical URL for the offer ("claritypledge.com/program"); /pricing and /offers
 * redirect here. Reading order, settled at founder UAT:
 *
 *   1. Title + the two program facts + the next-batch countdown  (ProgramTimelineSection)
 *   2. Month 1 / 2 / 3 — one sentence each                       (ProgramTimelineSection)
 *   3. Two testimonials                                          (Testimonials)
 *   4. The three-card offer ladder + assurance band              (OffersSection)
 *   5. FAQ
 *
 * The countdown was moved up out of the pricing block so the upcoming batch frames the
 * whole page rather than just the number, and the section paddings below are deliberately
 * tighter than the site default (py-20/28 stacked against the timeline's own padding put
 * roughly 14rem of dead space between the month arc and the quotes).
 *
 * Wrapped in ClarityLandingLayout at the route (App.tsx), like the coach page.
 */
import { SEO } from "@/app/components/seo";
import { OffersSection, Testimonials } from "@/app/components/landing/offers-section";
import { ProgramTimelineSection } from "@/app/components/landing/program-timeline-section";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CHAMPIONS_FAQS } from "@/app/content/faqs";

export function OffersPage() {
  return (
    <div className="bg-background text-foreground">
      <SEO
        title="Clarity Champions — Clarity Pledge"
        url="/program"
        description="Weekly live practice with a small batch of peers, €295/month, cancel anytime. Full refund if the first two sessions aren't for you."
      />
      <ProgramTimelineSection className="pt-24 lg:pt-28" />
      <section className="border-b border-border px-4 pb-14 lg:pb-16">
        <Testimonials />
      </section>
      <OffersSection className="pt-14 pb-20 lg:pt-16 lg:pb-24" />
      <section className="px-4 py-16 lg:py-20 bg-muted/30 border-t border-border">
        <div className="container mx-auto max-w-3xl">
          <Accordion type="single" collapsible>
            {CHAMPIONS_FAQS.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border-b border-border">
                <AccordionTrigger className="text-base font-medium text-left hover:no-underline py-5">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-base text-muted-foreground leading-relaxed pb-5">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </div>
  );
}

export default OffersPage;
