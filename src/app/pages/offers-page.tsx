/**
 * Program Page — Clarity Champions membership (P1087, superseding P937/P951's
 * three-tier pricing-grid page).
 *
 * The canonical URL for the offer ("claritypledge.com/program"); /pricing and /offers
 * redirect here. ONE self-serve membership — no more three-card grid. Body is the
 * shared <OffersSection /> (the offer card + subordinate band). Wrapped in
 * ClarityLandingLayout at the route (App.tsx), like the coach page.
 */
import { SEO } from "@/app/components/seo";
import { OffersSection } from "@/app/components/landing/offers-section";
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
      <div className="py-20 lg:py-28">
        <OffersSection />
      </div>
      <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
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
