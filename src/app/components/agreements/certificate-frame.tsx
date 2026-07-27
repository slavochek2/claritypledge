/**
 * @file certificate-frame.tsx
 * @description The shared visual shell for every Clarity certificate surface —
 * the navy double-border frame, the cream field, the serif header block, and the
 * oath-body render.
 *
 * Extracted from agreement-certificate.tsx (the bilateral Clarity Partner
 * Agreement) so the single-party Clarity Organization Terms can look identical
 * without duplicating the frame styles. AgreementCertificate keeps ALL of its
 * behavior (variants, signature slots, editable terms, seal) — it now composes
 * these two pieces instead of inlining them, so a change to the frame reaches
 * both surfaces at once.
 *
 * Presentational only: no data fetching, no state, no props beyond what is drawn.
 */
import React from 'react';
import { OathText } from '@/app/content/oath-emphasis';

/** One oath block — matches the shape in AGREEMENT_VERSIONS / COA_VERSIONS. */
export interface OathSection {
  heading: string;
  text: string;
  boldPhrases?: readonly string[];
}

export const CERTIFICATE_SERIF = '"Playfair Display", Georgia, serif';

interface CertificateFrameProps {
  /** Screen-reader landmark name (e.g. "Agreement certificate"). */
  ariaLabel: string;
  /** Certificate title, e.g. "Clarity Partner Agreement". */
  title: string;
  /** Small caps line under the title. */
  kicker: string;
  /** Italic serif line under the kicker. */
  epigraph: string;
  className?: string;
  children: React.ReactNode;
}

export function CertificateFrame({
  ariaLabel,
  title,
  kicker,
  epigraph,
  className = '',
  children,
}: CertificateFrameProps) {
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className={`relative rounded-lg p-6 md:p-10 bg-[#FDFBF7] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] ${className}`}
      style={{
        border: '8px solid #002B5C',
        outline: '2px solid #002B5C',
        outlineOffset: '-12px',
      }}
    >
      <div className="space-y-6">
        <div className="text-center space-y-2 pb-5 border-b-2 border-[#002B5C]">
          <h2
            className="text-2xl md:text-3xl font-serif tracking-wide text-[#1A1A1A]"
            style={{ fontFamily: CERTIFICATE_SERIF }}
          >
            {title}
          </h2>
          <p className="text-[10px] md:text-xs text-[#1A1A1A]/60 uppercase tracking-[0.2em] font-sans">
            {kicker}
          </p>
          <p
            className="text-sm md:text-base text-[#1A1A1A]/70 italic"
            style={{ fontFamily: CERTIFICATE_SERIF }}
          >
            {epigraph}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * The three oath blocks (your right / my promise / the exception), rendered
 * through the shared <OathText> helper so emphasis stays single-sourced with the
 * pledge. Used verbatim by both the bilateral agreement and the org terms.
 */
export function CertificateOathBody({ sections }: { sections: readonly OathSection[] }) {
  return (
    <>
      {sections.map((section) => (
        <div key={section.heading} className="space-y-2">
          <h3 className="text-base md:text-lg font-bold text-[#0044CC] tracking-wide uppercase">
            {section.heading}
          </h3>
          <p
            className="text-base md:text-lg leading-relaxed text-[#1A1A1A]"
            style={{ fontFamily: CERTIFICATE_SERIF }}
          >
            <OathText text={section.text} boldPhrases={section.boldPhrases} variant="tailwind" />
          </p>
        </div>
      ))}
    </>
  );
}
