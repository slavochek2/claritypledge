/**
 * @file about-page.tsx
 * @description About page for the Clarity Pledge movement.
 * Contains the founder's story, open source information, and a contact form.
 */
import { useEffect } from "react";
import { SEO } from "@/app/components/seo";
import { Button } from "@/components/ui/button";
import { analytics } from "@/lib/mixpanel";

export function AboutPage() {
  useEffect(() => {
    analytics.track('about_page_viewed', {
      referrer: document.referrer || 'direct',
    });
  }, []);

  return (
    <div className="min-h-screen py-20 px-4">
      <SEO
        title="About"
        description="Learn about the mission behind Clarity Pledge: helping people communicate with precision and honesty."
        url="/about"
      />
      <div className="container mx-auto max-w-3xl">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            About the Clarity Pledge
          </h1>
        </div>

        {/* Founder Story + CTA — one block */}
        <section>
          <div className="bg-card border border-border rounded-lg p-8">
            <div className="space-y-6">
              <p className="text-lg leading-relaxed text-muted-foreground">
                I've worked in multinationals where nothing was real. Bullshitters at the top. Everyone kissing up. Your work doesn't matter and everyone knows it. I didn't burn out—I burned myself trying to make it matter anyway.
              </p>

              <p className="text-lg leading-relaxed text-muted-foreground">
                Then I spent years leading startups. Multiple co-founders came and went. Each separation was painful—not because we disagreed, but because we thought we agreed and didn't. We'd nod in meetings, then discover months later we'd been building different things in our heads.
              </p>

              <p className="text-lg leading-relaxed text-muted-foreground">
                The pattern showed up everywhere. In sales, vague promises closed deals that imploded later. In hiring, "culture fit" meant everyone nodding to different definitions. In relationships—the breaking point—when I'd ask "play back what you heard," she'd refuse. Thought I was calling her stupid. I just wanted to know she understood me.
              </p>

              <p className="text-lg leading-relaxed text-muted-foreground">
                I learned early I couldn't rely on implied understanding. I had to verify explicitly. What felt like a weakness turned out to be structural insight—everyone is miscalibrated, most just don't notice until it's expensive.
              </p>

              <p className="text-lg leading-relaxed text-muted-foreground">
                This friction—the exhaustion of trying to be understood while struggling to understand others, the deep dissonance of pretending nonsense makes sense to protect a paycheck, of watching partnerships fail because nobody verified what was meant—became unbearable.
              </p>

              <p className="text-lg leading-relaxed text-muted-foreground">
                The Clarity Pledge started as my survival mechanism. I documented every painful mistake and turned them into simple rules. Influenced by Ray Dalio's <em>Principles</em> and <a href="https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5101322" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground" onClick={() => analytics.track('research_link_clicked', { source: 'about_page' })}>research into cognitive science and miscalibration</a>, I refined pages of notes into the core practice: <strong><a href="https://claritypledge.com/p/slava/pledge" className="hover:underline" onClick={() => analytics.track('pledge_link_clicked', { source: 'about_page' })}>If you ask me to repeat back what I understood, I will.</a></strong> Not because you're stupid—because I might be wrong.
              </p>

              <p className="text-lg leading-relaxed text-muted-foreground">
                The pledge is a signal. When I take it, I'm saying you have control over how I understand you. When you take it, you signal the same. When someone refuses? That's data too. Not everyone will sign. But the ones who do—they're the people you can actually build with.
              </p>

              <p className="text-lg leading-relaxed text-muted-foreground">
                If you've ever paid a high price for miscommunication in co-founder decisions, sales, or relationships—this was built for you. For people who care more about what is <em>true</em> than what is polite.
              </p>

              <div className="pt-6 border-t border-border/50 mt-6">
                <a
                  href="https://claritypledge.com/p/slava"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  onClick={() => analytics.track('founder_profile_clicked', { source: 'about_page' })}
                >
                  Vyacheslav Ladischenski (Slava)
                </a>
                <p className="text-sm text-muted-foreground">Founder of ClarityPledge</p>
              </div>

              <div className="pt-2 border-t border-border/30">
                <h2 className="text-xl font-semibold mb-4">I've lost co-founders. I help others keep theirs.</h2>
                <p className="text-lg leading-relaxed text-muted-foreground italic mb-6">
                  "Co-founders don't split over conflicts. They split over the conversations they stopped having."
                </p>
                <Button
                  asChild
                  size="lg"
                  className="bg-blue-500 hover:bg-blue-600 text-white font-semibold"
                  onClick={() => analytics.track('founder_services_clicked', { source: 'about_page' })}
                >
                  <a
                    href="https://ladischenski.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Work with Slava →
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
