/**
 * @file full-article-page.tsx
 * @description This page displays the long-form article that explains the philosophy and reasoning behind the Clarity Pledge.
 * It's a deep dive into the concepts of the "Clarity Tax," the "Illusion of Shared Reality,"
 * and the cognitive biases that lead to miscommunication.
 * The page is designed for readability, with a table of contents for easy navigation.
 * The primary purpose of this page is to provide a comprehensive, persuasive argument for why the pledge is needed,
 * targeting readers who want to understand the theory before committing.
 */
import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { BookOpenIcon, ArrowRightIcon, ChevronDownIcon } from "lucide-react";
import articleContent from "../content/full-article.md?raw";
import { SEO } from "@/app/components/seo";
import { analytics } from "@/lib/mixpanel";
import { useAuth } from "@/auth";
import { renderArticle } from "@/lib/markdown";

// Pre-render at module load — content is a committed .md file, trusted, no XSS risk
const articleSegments = renderArticle(articleContent);

export function FullArticlePage() {
  const { user: currentUser, isLoading, sessionChecked } = useAuth();
  const [activeId, setActiveId] = useState("");
  const [isMobileTocOpen, setIsMobileTocOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showFloatingCTA, setShowFloatingCTA] = useState(false);

  const isLoadingUser = !sessionChecked || isLoading;
  const showCTA = !isLoadingUser && !currentUser;

  // Extract headers for TOC
  const headers = useMemo(() => {
    const headerRegex = /^(#{1,3})\s+(.+)$/gm;
    const foundHeaders: Array<{ id: string; text: string; level: number }> = [];
    let match;

    while ((match = headerRegex.exec(articleContent)) !== null) {
      const level = match[1].length;
      const text = match[2].replace(/\*\*/g, ""); // Remove bold markers
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, "-");
      foundHeaders.push({ id, text, level });
    }

    // Return all h2 headers
    return foundHeaders.filter(h => h.level === 2);
  }, []);

  // Split into main sections (I-VII) and supplementary (Appendices, References)
  const mainSections = useMemo(() => {
    return headers.filter(h => {
      const lowerText = h.text.toLowerCase();
      return !lowerText.startsWith('appendix') && lowerText !== 'references';
    });
  }, [headers]);

  const supplementarySections = useMemo(() => {
    return headers.filter(h => {
      const lowerText = h.text.toLowerCase();
      return lowerText.startsWith('appendix') || lowerText === 'references';
    });
  }, [headers]);

  // P553: Load KaTeX CSS only when /manifesto is visited
  useEffect(() => {
    import("katex/dist/katex.min.css");
  }, []);

  useEffect(() => {
    // Track page view
    analytics.track('article_page_viewed', {
      referrer: document.referrer || 'direct',
    });

    // Scroll to hash anchor after markdown content renders.
    // requestAnimationFrame alone is too early — the markdown may not be in the DOM yet.
    // Poll briefly until the element appears (max 3s).
    if (window.location.hash) {
      const id = window.location.hash.slice(1);
      let attempts = 0;
      const tryScroll = () => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        } else if (attempts < 30) {
          attempts++;
          setTimeout(tryScroll, 100);
        }
      };
      tryScroll();
    }
  }, []);

  useEffect(() => {
    // Wait for content to render before observing
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-10% 0% -80% 0%" }
    );

    const headings = document.querySelectorAll("article h1, article h2, article h3");
    headings.forEach((heading) => observer.observe(heading));

    return () => observer.disconnect();
  }, []);

  // Track scroll progress and show/hide floating CTA
  useEffect(() => {
    const trackedMilestones = new Set<number>();

    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;
      const progress = (scrollTop / (documentHeight - windowHeight)) * 100;

      setScrollProgress(Math.min(progress, 100));
      setShowFloatingCTA(progress > 15 && progress < 95 && !currentUser);

      // Track read depth milestones
      const milestones = [25, 50, 75, 100];
      for (const milestone of milestones) {
        if (progress >= milestone && !trackedMilestones.has(milestone)) {
          trackedMilestones.add(milestone);
          analytics.track('article_read_depth', { depth_percent: milestone });
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [currentUser]);

  return (
    <div className="min-h-screen bg-background overflow-x-clip">
      <SEO
        title="The Clarity Pledge Manifesto"
        description="Stop paying the hidden cost of miscommunication. Learn about the Clarity Tax - $1.2 trillion annually in the U.S. alone - and how a public commitment to verified understanding can change everything."
        url="/manifesto"
        type="article"
        article={{
          headline: "The Clarity Pledge Manifesto: Stop Paying the Hidden Cost of Miscommunication",
          author: "Vyacheslav Ladischenski",
          authorUrl: "https://linkedin.com/in/ladischenski",
          datePublished: "2025-01-01",
          dateModified: "2025-12-01",
        }}
      />
      <style>{`
        .katex { font-size: 1.1em; }
        .katex-display {
          /* the flattened equivalent of the box tint below (muted at 30% over the page), so the
             scroll-shadow cover layers are invisible against it */
          --formula-bg: color-mix(in srgb, hsl(var(--muted)) 30%, hsl(var(--background)));
          margin: 2rem 0;
          padding: 1.5rem;
          background-color: hsl(var(--muted) / 0.3);
          border-radius: 0.5rem;
          overflow-x: auto;
          scrollbar-width: thin;
          scrollbar-color: hsl(var(--muted-foreground) / 0.5) transparent;
          /* Scroll shadows: the two cover layers are attached to the CONTENT (local) and the
             two shadow layers to the BOX (scroll), so an edge shadow shows only while there is
             more formula in that direction. This is the affordance that actually renders on
             every platform — a styled scrollbar is invisible under macOS/iOS overlay
             scrollbars, which is how a 891px formula in a 240px box read as truncated. */
          /* fallback for engines without color-mix(): the covers are the page background rather
             than the flattened tint — a ~3/255 seam, against losing the affordance entirely,
             because an unparsable color voids the whole background-image declaration. */
          background-image:
            linear-gradient(to right, hsl(var(--background)) 55%, transparent),
            linear-gradient(to left, hsl(var(--background)) 55%, transparent),
            linear-gradient(to right, hsl(var(--foreground) / 0.16), hsl(var(--foreground) / 0)),
            linear-gradient(to left, hsl(var(--foreground) / 0.16), hsl(var(--foreground) / 0));
          background-image:
            linear-gradient(to right, var(--formula-bg) 55%, transparent),
            linear-gradient(to left, var(--formula-bg) 55%, transparent),
            linear-gradient(to right, hsl(var(--foreground) / 0.16), hsl(var(--foreground) / 0)),
            linear-gradient(to left, hsl(var(--foreground) / 0.16), hsl(var(--foreground) / 0));
          background-position: 0 0, 100% 0, 0 0, 100% 0;
          background-repeat: no-repeat;
          background-size: 40px 100%, 40px 100%, 22px 100%, 22px 100%;
          background-attachment: local, local, scroll, scroll;
        }
        .katex-display::-webkit-scrollbar {
          height: 8px;
          -webkit-appearance: none;
        }
        .katex-display::-webkit-scrollbar-track {
          background: transparent;
        }
        .katex-display::-webkit-scrollbar-thumb {
          background: hsl(var(--muted-foreground) / 0.5);
          border-radius: 4px;
        }
        article code {
          font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
        }
      `}</style>

      {/* Progress bar - fixed at top. P956: offset tracks the nav's bottom edge,
          which grows by env(safe-area-inset-top) on notched iOS (viewport-fit=cover). */}
      <div className="fixed top-[calc(4rem+env(safe-area-inset-top))] lg:top-[calc(5rem+env(safe-area-inset-top))] left-0 right-0 z-40 h-0.5">
        <div
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* Mobile TOC Toggle - floating button */}
      <Button
        variant="outline"
        size="sm"
        className="lg:hidden fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-40 shadow-md bg-background"
        onClick={() => setIsMobileTocOpen(!isMobileTocOpen)}
        aria-label="Table of contents"
      >
        <BookOpenIcon className="w-4 h-4" />
      </Button>

      {/* Mobile TOC Dropdown */}
      {isMobileTocOpen && (
        <div className="lg:hidden fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 bg-background border rounded-lg shadow-lg max-h-[60vh] overflow-y-auto">
          <nav className="p-4 space-y-1">
            {mainSections.map((header) => (
              <a
                key={header.id}
                href={`#${header.id}`}
                className={`block py-2 px-3 text-sm rounded-md transition-colors ${
                  activeId === header.id
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  setIsMobileTocOpen(false);
                  document.getElementById(header.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {header.text}
              </a>
            ))}
            {supplementarySections.length > 0 && (
              <>
                <div className="border-t border-border my-2" />
                {supplementarySections.map((header) => (
                  <a
                    key={header.id}
                    href={`#${header.id}`}
                    className={`block py-1.5 px-3 text-xs rounded-md transition-colors ${
                      activeId === header.id
                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium"
                        : "text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                    }`}
                    onClick={(e) => {
                      e.preventDefault();
                      setIsMobileTocOpen(false);
                      document.getElementById(header.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    {header.text}
                  </a>
                ))}
              </>
            )}
          </nav>
        </div>
      )}

      <div className="container mx-auto px-4 py-12 max-w-7xl">
        <div className="flex gap-6 lg:gap-8">
          {/* TOC Sidebar - Desktop */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto">
              <nav className="space-y-1 border-l border-border pl-3">
                {mainSections.map((header) => (
                  <a
                    key={header.id}
                    href={`#${header.id}`}
                    className={`block py-1.5 text-sm transition-all ${
                      activeId === header.id
                        ? "text-blue-600 dark:text-blue-400 font-medium -ml-[1px] border-l-2 border-blue-600 pl-[15px]"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(header.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    {header.text}
                  </a>
                ))}
                {supplementarySections.length > 0 && (
                  <>
                    <div className="my-3" />
                    {supplementarySections.map((header) => (
                      <a
                        key={header.id}
                        href={`#${header.id}`}
                        className={`block py-1 text-xs transition-all ${
                          activeId === header.id
                            ? "text-blue-600 dark:text-blue-400 font-medium -ml-[1px] border-l-2 border-blue-600 pl-[15px]"
                            : "text-muted-foreground/60 hover:text-foreground"
                        }`}
                        onClick={(e) => {
                          e.preventDefault();
                          document.getElementById(header.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                      >
                        {header.text}
                      </a>
                    ))}
                  </>
                )}
              </nav>
            </div>
          </aside>

          {/* Article Content */}
          <main className="flex-1 min-w-0">
            {/* Executive Summary / TL;DR */}
            <div className="mb-12 pb-12 border-b border-border">
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

              <div className="prose prose-lg dark:prose-invert max-w-none text-justify">
                <p className="text-lg leading-relaxed">
                  We assume we understand each other, but often we're just guessing. When those guesses are wrong, we pay the price—in rework, in mistakes, in conflicts, in broken trust.
                </p>
                <p className="text-lg leading-relaxed">
                  This is the <strong>Clarity Tax</strong>: the hidden cost of unverified understanding. In organizations alone, it costs <strong>$1.2 trillion annually</strong> in the U.S. (<a href="https://www.businesswire.com/news/home/20220125005525/en/Grammarly-and-Harris-Poll-Research-Estimates-U.S.-Businesses-Lose-%241.2-Trillion-Annually-to-Poor-Communication" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">source</a>).
                </p>
                <p className="text-lg leading-relaxed">
                  The problem isn't that we're careless—it's that we're human. Cognitive biases make us overestimate how clearly we communicate and how well we understand others. We operate under an <em>illusion of shared reality</em>.
                </p>
                <p className="text-lg leading-relaxed">
                  <strong>The Clarity Pledge</strong> is a public commitment to break this illusion. It grants others explicit permission to verify your understanding and commits you to respond without judgment. It's a new social contract that makes verification the default, not the exception.
                </p>
              </div>

              {/* Quick CTA for converters */}
              {showCTA && (
                <div className="mt-8 flex flex-col sm:flex-row gap-4 items-center">
                  <Link
                    to="/sign-pledge"
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-blue-500 hover:bg-blue-600 text-white font-semibold text-base px-8 py-6 h-auto"
                  >
                    Take the Pledge Now
                    <ArrowRightIcon className="ml-2 w-5 h-5" />
                  </Link>
                  <button
                    onClick={() => {
                      const articleStart = document.getElementById('i-the-frustration-when-humility-is-blocked-by-unwillingness-to-cooperate');
                      articleStart?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="text-muted-foreground hover:text-foreground transition-colors text-sm flex items-center gap-2"
                  >
                    Continue reading the full article
                    <ChevronDownIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <article className="prose prose-lg dark:prose-invert mx-auto text-justify pb-28
              prose-headings:scroll-mt-24 prose-headings:font-serif prose-headings:text-left
              prose-h1:text-4xl prose-h1:font-bold prose-h1:mb-8 prose-h1:mt-0
              prose-h2:text-3xl prose-h2:font-bold prose-h2:mt-16 prose-h2:mb-6 prose-h2:pb-2 prose-h2:border-b prose-h2:border-border
              prose-h3:text-2xl prose-h3:font-semibold prose-h3:mt-10 prose-h3:mb-4
              prose-h4:text-xl prose-h4:font-semibold prose-h4:mt-8 prose-h4:mb-3
              prose-p:text-lg prose-p:leading-[1.75] prose-p:mb-6 prose-p:text-foreground/90
              prose-ul:my-6 prose-ul:space-y-2
              prose-ol:my-6 prose-ol:space-y-2
              prose-li:text-lg prose-li:leading-[1.75]
              prose-strong:font-semibold prose-strong:text-foreground
              prose-em:italic prose-em:text-foreground/90
              prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-a:font-medium
              prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:pl-6 prose-blockquote:py-2 prose-blockquote:my-6 prose-blockquote:italic prose-blockquote:text-foreground/80
              prose-code:text-sm prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
              prose-pre:bg-muted prose-pre:border prose-pre:border-border
              prose-hr:my-6 prose-hr:border-border
            ">
              {/* Trusted content: committed full-article.md, not user input.
                  Segments split at CTA injection points for React component interleaving. */}
              {articleSegments.map((html, i) => (
                <div key={i}>
                  <div dangerouslySetInnerHTML={{ __html: html }} />
                  {i < articleSegments.length - 1 && showCTA && (
                    <div className="not-prose my-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-3">
                        Ready to stop paying the Clarity Tax?
                      </p>
                      <Link
                        to="/sign-pledge"
                        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm h-9 px-3"
                      >
                        Take the Pledge
                        <ArrowRightIcon className="ml-2 w-4 h-4" />
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </article>

            {/* Bottom CTA */}
            {showCTA && (
              <div className="mt-16 p-8 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-2 border-blue-200 dark:border-blue-800 rounded-2xl text-center">
                <h2 className="text-3xl font-bold mb-4">Ready to Join the Movement?</h2>
                <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                  Experience verified understanding firsthand, or commit to the pledge.
                </p>
                <div className="flex flex-col items-center gap-3">
                  <Link
                    to="/live"
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-blue-500 hover:bg-blue-600 text-white font-semibold text-lg px-10 py-6 h-auto"
                  >
                    Start a Clarity Meeting
                  </Link>
                  <p className="text-muted-foreground">
                    or{" "}
                    <Link
                      to="/sign-pledge"
                      className="text-blue-500 hover:text-blue-600 underline underline-offset-4"
                    >
                      Take the Pledge
                    </Link>
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Floating CTA Button */}
      {showFloatingCTA && (
        <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 sm:right-6 sm:bottom-6 z-40 animate-in slide-in-from-bottom-4">
          <Link
            to="/sign-pledge"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-blue-500 hover:bg-blue-600 text-white font-semibold shadow-2xl text-base sm:text-lg px-6 py-4 sm:px-8 sm:py-6 h-auto"
          >
            Take the Pledge
            <ArrowRightIcon className="ml-2 w-5 h-5" />
          </Link>
        </div>
      )}
    </div>
  );
}
