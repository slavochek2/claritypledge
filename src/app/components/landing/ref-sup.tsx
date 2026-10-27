/** Citation superscript linking to the page's #references list. */
export function RefSup({ n, label }: { n: number; label: string }) {
  return (
    <sup className="ml-0.5">
      <a href="#references" aria-label={`Reference ${n}: ${label}`} className="inline-block px-2 py-5 -mx-2 -my-5 text-blue-600 hover:text-blue-700">
        {n}
      </a>
    </sup>
  );
}
