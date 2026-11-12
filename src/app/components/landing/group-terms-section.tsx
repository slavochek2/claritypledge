import type { ReactNode } from "react";
import { SectionHeader } from "@/app/components/landing/section-header";
import { CertificateFrame, CertificateOathBody } from "@/app/components/agreements/certificate-frame";
import { TemplateStamp } from "@/app/components/agreements/template-stamp";
import { COA_VERSIONS, CURRENT_COA_VERSION } from "@/app/content/coa-versions";
import { Reveal } from "./reveal";
import { MUTED, SECTION } from "./landing-motion";

/**
 * The norm in writing: the Clarity Group Terms specimen. Body is the shared oath via COA_VERSIONS,
 * byte-identical to /groups/:slug/join. No Accept button: a live action on a marketing page is a dead control (P955).
 */
export function GroupTermsSection({ muted = false, id, title, subtitle, stamp = true }: {
  muted?: boolean;
  id?: string;
  title?: ReactNode;
  subtitle?: string;
  /** /communities passes false: the stamp lands on the 0-to-10 sentence on phones, the one an organizer is judging. */
  stamp?: boolean;
}) {
  const coa = COA_VERSIONS[CURRENT_COA_VERSION];
  return (
    <section id={id} className={`${SECTION} ${muted ? MUTED : ""} overflow-hidden scroll-mt-16`}>
      <Reveal className="container mx-auto max-w-3xl">
        <SectionHeader title={title ?? <span className="inline-block text-balance">Make it <span className="text-blue-500">normal</span> to ask how well we understand each other</span>} subtitle={subtitle} />
        <div className="relative">
          <CertificateFrame ariaLabel="Clarity Group Terms" title={coa.title} kicker="A commitment to every member" epigraph="We all crave being understood. Let's commit to listen.">
            <CertificateOathBody sections={[coa.yourRight, coa.myPromise, coa.exception]} />
          </CertificateFrame>
          {stamp && <TemplateStamp animate />}
        </div>
      </Reveal>
    </section>
  );
}
