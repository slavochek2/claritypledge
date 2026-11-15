/**
 * The /manifesto page header: TL;DR badge, title, subtitle, then the manifesto film (P1682).
 * Extracted from FullArticlePage unchanged, so the page function stays under its size limit.
 */
import { ManifestoFilm } from "./manifesto-film";

export function ManifestoHeader() {
  return (
    <>
      <div className="mb-6">
        <span className="inline-block px-3 py-1 text-xs font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full mb-4">
          TL;DR — 3 min read
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold mb-6">
          The Clarity Pledge
        </h1>
        <p className="text-xl sm:text-2xl text-muted-foreground mb-6">
          Stop paying the hidden cost of miscommunication
        </p>
      </div>

      <div className="mb-8 max-w-2xl">
        <ManifestoFilm />
      </div>
    </>
  );
}
