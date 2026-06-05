/**
 * Diagonal TEMPLATE watermark for AgreementCertificate previews.
 * Wrap the certificate in a `relative` container and render this inside it —
 * marks demo certificates (Einstein/Teresa) so they don't read as real signed
 * agreements. Single source for the stamp style (was duplicated on
 * /partner-template and the coach landing).
 */
export function TemplateStamp() {
  return (
    <div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 pointer-events-none select-none"
      aria-hidden="true"
    >
      <span className="text-5xl md:text-6xl font-bold uppercase tracking-[0.2em] text-[#002B5C]/10 whitespace-nowrap">
        Template
      </span>
    </div>
  );
}
