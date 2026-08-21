/**
 * Program Page — Clarity Champions (P1087, superseding P937/P951's three-tier
 * pricing-grid page).
 *
 * The canonical URL for the offer ("claritypledge.com/program"); /pricing and /offers
 * redirect here. Reading order, REVERSED at founder UAT round 3:
 *
 *   1. The three-card offer ladder + assurance band              (OffersSection)
 *   2. What Clarity Champions is + Month 1 / 2 / 3 / 4-and-beyond (ProgramTimelineSection)
 *   3. Two testimonials                                          (Testimonials)
 *   4. Closing CTA on Champions alone + next-batch countdown     (ChampionsCloseCta)
 *   5. FAQ
 *
 * Why the reversal (founder: "first show the pricing at the top, then show the specific
 * details of the Clarity Champions program, because it's kind of chosen, right?"): the old
 * order described ONE program at length and then produced a three-card grid, so the grid
 * read as three sizes of the thing just described. Leading with the grid makes the three
 * offers a choice, and everything after it is detail on the one most people take.
 *
 * The countdown moved to the CLOSE for the founder's own stated reason — "people don't care
 * about the batch start before they know what it is." A deadline converts only after the
 * reader wants the thing.
 *
 * Section paddings are deliberately tighter than the site default (py-20/28 stacked against
 * the timeline's own padding put roughly 14rem of dead space between sections).
 *
 * Wrapped in ClarityLandingLayout at the route (App.tsx), like the coach page.
 */
import { SEO } from "@/app/components/seo";
import {
  OffersSection,
  Testimonials,
  ChampionsCloseCta,
} from "@/app/components/landing/offers-section";
import {
  ProgramTimelineSection,
  BatchCountdown,
} from "@/app/components/landing/program-timeline-section";
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
        title="Clarity Champions Program — Clarity Pledge"
        url="/program"
        description="Weekly live practice with a small batch of peers, €295/month, cancel anytime. Full refund if the first two sessions aren't for you."
      />
      <OffersSection className="pt-20 pb-16 lg:pt-24 lg:pb-20" />
      <ProgramTimelineSection className="border-t border-border pt-16 lg:pt-20" />
      <section className="px-4 pb-16 lg:pb-20">
        <Testimonials />
      </section>
      {/* Closing action on Champions alone, with the batch deadline beside it — the last
          thing before the FAQ, and the only place on the page urgency is asserted. */}
      {/* Plain background — the FAQ directly below is bg-muted/30, and two stacked muted
          bands read as one section with a stray button in it. */}
      <section className="border-t border-border px-4 py-16 lg:py-20">
        <div className="container mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
          <BatchCountdown />
          <ChampionsCloseCta />
        </div>
      </section>
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
