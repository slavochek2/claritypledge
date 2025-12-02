/**
 * @file full-article-page.tsx
 * @description This page displays the long-form article that explains the philosophy and reasoning behind the Polymet Clarity Pledge.
 * It's a deep dive into the concepts of the "Clarity Tax," the "Illusion of Shared Reality,"
 * and the cognitive biases that lead to miscommunication.
 * The page is designed for readability, with a table of contents for easy navigation.
 * The primary purpose of this page is to provide a comprehensive, persuasive argument for why the pledge is needed,
 * targeting readers who want to understand the theory before committing.
 */
import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { ArrowLeftIcon, BookOpenIcon, MenuIcon, LogOutIcon, ArrowRightIcon, ChevronDownIcon } from "lucide-react";
import articleContent from "../content/full-article.md?raw";
import { getCurrentUser, signOut } from "@/app/data/api";

export function FullArticlePage() {
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState("");
  const [isMobileTocOpen, setIsMobileTocOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showFloatingCTA, setShowFloatingCTA] = useState(false);
  const [expandedAppendices, setExpandedAppendices] = useState(false);

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
    
    return foundHeaders.filter(h => h.level <= 2); // Only show h1 and h2 in TOC
  }, []);

  useEffect(() => {
    // Load current user
    const loadUser = async () => {
      setIsLoadingUser(true);
      const user = await getCurrentUser();
      setCurrentUser(user);
      setIsLoadingUser(false);
    };
    loadUser();
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
      { rootMargin: "-10% 0% -80% 0%" } // Adjust rootMargin for more responsive highlighting
    );

    const headings = document.querySelectorAll("article h1, article h2, article h3");
    headings.forEach((heading) => observer.observe(heading));

    return () => observer.disconnect();
  }, []);

  // Track scroll progress and show/hide floating CTA
  useEffect(() => {
    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;
      const progress = (scrollTop / (documentHeight - windowHeight)) * 100;
      
      setScrollProgress(Math.min(progress, 100));
      
      // Show floating CTA after scrolling past executive summary (around 20% of page)
      setShowFloatingCTA(progress > 15 && progress < 95 && !currentUser);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [currentUser]);

  const handleSignOut = async () => {
    await signOut();
    setCurrentUser(null);
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <style>{`
        /* Better math formula styling */
        .katex { font-size: 1.1em; }
        .katex-display { 
          margin: 2rem 0; 
          padding: 1.5rem;
          background: hsl(var(--muted) / 0.3);
          border-radius: 0.5rem;
          overflow-x: auto;
        }
        /* Better inline code in formulas */
        article code {
          font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
        }
      `}</style>
      {/* Simple Header */}
      <div className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        {/* Progress bar */}
        <div 
          className="absolute top-0 left-0 h-0.5 bg-blue-500 transition-all duration-300"
          style={{ width: `${scrollProgress}%` }}
        />
        <div className="container mx-auto px-4 py-4 flex items-center justify-between max-w-6xl">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
            >
              <ArrowLeftIcon className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
            {/* Mobile TOC Toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setIsMobileTocOpen(!isMobileTocOpen)}
            >
              <MenuIcon className="w-4 h-4 mr-2" />
              Contents
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {!isLoadingUser && (
              <>
                {currentUser ? (
                  <Button
                    onClick={handleSignOut}
                    variant="outline"
                    size="sm"
                    className="gap-1"
                  >
                    <LogOutIcon className="w-3 h-3" />
                    <span className="hidden sm:inline">Log Out</span>
                  </Button>
                ) : (
                  <Link
                    to="/sign-pledge"
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-blue-500 hover:bg-blue-600 text-white h-9 px-3"
                  >
                    Take the Pledge
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile TOC Dropdown */}
      {isMobileTocOpen && (
        <div className="md:hidden fixed top-16 left-0 right-0 z-40 bg-background border-b shadow-lg max-h-[60vh] overflow-y-auto">
          <nav className="p-4 space-y-1">
            {headers.map((header) => (
              <a
                key={header.id}
                href={`#${header.id}`}
                className={`block py-2 px-3 text-sm rounded-md transition-colors ${
                  activeId === header.id
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                } ${header.level === 2 ? "pl-6" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  setIsMobileTocOpen(false);
                  document
                    .getElementById(header.id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {header.text}
              </a>
            ))}
          </nav>
        </div>
      )}

      <div className="container mx-auto px-4 py-12 max-w-7xl">
        <div className="flex gap-6 lg:gap-12">
          {/* TOC Sidebar - Tablet and Desktop */}
          <aside className="hidden lg:block w-72 flex-shrink-0">
            <div className="sticky top-24">
              <div className="flex items-center gap-2 text-sm font-bold mb-6 text-foreground">
                <BookOpenIcon className="w-5 h-5" />
                <span className="text-base">Contents</span>
              </div>
              <nav className="space-y-0.5">
                {headers.map((header) => (
                  <a
                    key={header.id}
                    href={`#${header.id}`}
                    className={`block py-2.5 px-4 text-sm rounded-lg transition-all ${
                      activeId === header.id
                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold border-l-2 border-blue-600"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5"
                    } ${header.level === 2 ? "pl-8 text-xs" : "font-medium"}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document
                        .getElementById(header.id)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    {header.text}
                  </a>
                ))}
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
              
              <div className="prose prose-lg dark:prose-invert max-w-none">
                <p className="text-lg leading-relaxed">
                  We assume we understand each other, but often we're just guessing. When those guesses are wrong, we pay the price—in rework, in mistakes, in conflicts, in broken trust.
                </p>
                <p className="text-lg leading-relaxed">
                  This is the <strong className="text-amber-500">Clarity Tax</strong>: the hidden cost of unverified understanding. In organizations alone, it costs <strong>$1.2 trillion annually</strong> in the U.S.
                </p>
                <p className="text-lg leading-relaxed">
                  The problem isn't that we're careless—it's that we're human. Cognitive biases make us overestimate how clearly we communicate and how well we understand others. We operate under an <em>illusion of shared reality</em>.
                </p>
                <p className="text-lg leading-relaxed">
                  <strong>The Clarity Pledge</strong> is a public commitment to break this illusion. It grants others explicit permission to verify your understanding and commits you to respond without judgment. It's a new social contract that makes verification the default, not the exception.
                </p>
              </div>

              {/* Quick CTA for converters */}
              {!isLoadingUser && !currentUser && (
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

            <article className="prose prose-lg dark:prose-invert mx-auto
              prose-headings:scroll-mt-24 prose-headings:font-serif
              prose-h1:text-4xl prose-h1:font-bold prose-h1:mb-8 prose-h1:mt-8
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
              prose-hr:my-12 prose-hr:border-border
            ">
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  h1: ({ children, ...props }) => {
                    const text = children?.toString() || "";
                    const id = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "-");
                    return <h1 id={id} {...props}>{children}</h1>;
                  },
                  h2: ({ children, ...props }) => {
                    const text = children?.toString() || "";
                    const id = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "-");
                    
                    // Add inline CTA after key sections
                    const shouldShowInlineCTA = [
                      'the-hidden-cost-in-your-life',
                      'the-clarity-principle-the-solution',
                      'from-individual-pledge-to-societal-movement'
                    ].includes(id);
                    
                    return (
                      <>
                        <h2 id={id} {...props}>{children}</h2>
                        {shouldShowInlineCTA && !isLoadingUser && !currentUser && (
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
                      </>
                    );
                  },
                  h3: ({ children, ...props }) => {
                    const text = children?.toString() || "";
                    const id = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "-");
                    return <h3 id={id} {...props}>{children}</h3>;
                  },
                }}
              >
                {articleContent}
              </ReactMarkdown>
            </article>
            
            {/* Collapsible Appendices Section */}
            <div className="mt-16 border-t border-border pt-8">
              <button
                onClick={() => setExpandedAppendices(!expandedAppendices)}
                className="flex items-center justify-between w-full p-6 bg-muted/50 hover:bg-muted rounded-lg transition-colors group"
              >
                <div className="text-left">
                  <h2 className="text-2xl font-bold mb-2">Appendices</h2>
                  <p className="text-sm text-muted-foreground">
                    Formal definitions, implementation guide, and research references
                  </p>
                </div>
                <ChevronDownIcon 
                  className={`w-6 h-6 text-muted-foreground group-hover:text-foreground transition-transform ${expandedAppendices ? 'rotate-180' : ''}`}
                />
              </button>
              
              {expandedAppendices && (
                <article className="prose prose-lg dark:prose-invert mx-auto mt-8
                  prose-headings:scroll-mt-24 prose-headings:font-serif
                  prose-h2:text-3xl prose-h2:font-bold prose-h2:mt-12 prose-h2:mb-6
                  prose-h3:text-2xl prose-h3:font-semibold prose-h3:mt-8 prose-h3:mb-4
                  prose-p:text-lg prose-p:leading-[1.75] prose-p:mb-6
                ">
                  {/* Extract and render only appendices content */}
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {articleContent.split('## Appendix')[0].includes('## Appendix') 
                      ? '' 
                      : articleContent.substring(articleContent.indexOf('## Appendix') || articleContent.length)}
                  </ReactMarkdown>
                </article>
              )}
            </div>

            {/* Bottom CTA */}
            {!isLoadingUser && !currentUser && (
              <div className="mt-16 p-8 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-2 border-blue-200 dark:border-blue-800 rounded-2xl text-center">
                <h2 className="text-3xl font-bold mb-4">Ready to Join the Movement?</h2>
                <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                  Take the Clarity Pledge and become part of a community committed to verified alignment.
                </p>
                <Link
                  to="/sign-pledge"
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-blue-500 hover:bg-blue-600 text-white font-semibold text-lg px-10 py-6 h-auto"
                >
                  Take the Clarity Pledge
                </Link>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Floating CTA Button */}
      {showFloatingCTA && (
        <div className="fixed bottom-6 right-6 z-40 animate-in slide-in-from-bottom-4">
          <Link
            to="/sign-pledge"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-blue-500 hover:bg-blue-600 text-white font-semibold shadow-2xl text-lg px-8 py-6 h-auto"
          >
            Take the Pledge
            <ArrowRightIcon className="ml-2 w-5 h-5" />
          </Link>
        </div>
      )}
    </div>
  );
}
