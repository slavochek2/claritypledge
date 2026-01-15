/**
 * @file about-page.tsx
 * @description About page for the Clarity Pledge movement.
 * Contains the founder's story, open source information, and a contact form.
 */
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { SEO } from "@/app/components/seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircleIcon,
  LinkedinIcon,
  CodeIcon,
  MailIcon,
} from "lucide-react";
import { analytics } from "@/lib/mixpanel";

export function AboutPage() {
  const [formData, setFormData] = useState({
    email: "",
    message: "",
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Track page view
  useEffect(() => {
    analytics.track('about_page_viewed', {
      referrer: document.referrer || 'direct',
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    analytics.track('contact_form_submitted', {
      has_message: formData.message.trim().length > 0,
      message_length: formData.message.trim().length,
    });

    try {
      const formPayload = new FormData();
      formPayload.append("access_key", "5c88ffaa-4e5a-4c82-9c73-e7fb0ad3ad01");
      formPayload.append("email", formData.email);
      formPayload.append("message", formData.message);
      formPayload.append("subject", "Clarity Pledge - Contact");
      formPayload.append("from_name", "Clarity Pledge - About Page");

      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        body: formPayload,
      });

      const data = await response.json();

      if (data.success) {
        analytics.track('contact_form_success');
        setIsSubmitted(true);
        setFormData({
          email: "",
          message: "",
        });
      } else {
        analytics.track('contact_form_error', { reason: 'api_rejected' });
        toast.error("There was an error submitting the form. Please try again later.");
      }
    } catch (error) {
      console.error("Form submission error:", error);
      analytics.track('contact_form_error', { reason: 'network_error' });
      toast.error("There was an error submitting the form. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="min-h-screen py-20 px-4">
      <SEO
        title="About"
        description="Learn the story behind the Clarity Pledge movement. Founded by Vyacheslav Ladischenski to combat miscommunication and intellectual moral injury in professional settings."
        url="/about"
      />
      <div className="container mx-auto max-w-3xl">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            About the Clarity Pledge
          </h1>
          <p className="text-xl text-muted-foreground">
            The Story Behind the Movement
          </p>
        </div>

        {/* Founder Story Section */}
        <section className="mb-16">
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
                The Clarity Pledge started as my survival mechanism. I documented every painful mistake and turned them into simple rules. Influenced by Ray Dalio's <em>Principles</em>, I refined pages of notes into the core practice: <strong>If you ask me to repeat back what I understood, I will.</strong> Not because you're stupid—because I might be wrong.
              </p>

              <p className="text-lg leading-relaxed text-foreground font-medium">
                The pledge is a signal. When I take it, I'm saying you have control over how I understand you. When you take it, you signal the same. When someone refuses? That's data too. Not everyone will sign. But the ones who do—they're the people you can actually build with.
              </p>

              <p className="text-lg leading-relaxed text-foreground font-medium">
                If you've ever paid a high price for miscommunication in co-founder decisions, sales, or relationships—this was built for you. For people who care more about what is <em>true</em> than what is polite.
              </p>

              <p className="text-sm text-muted-foreground pt-6 border-t border-border/50 mt-6">
                — Vyacheslav Ladischenski (Slava), Founder of Clarity Pledge
              </p>

              {/* LinkedIn Link */}
              <div className="pt-4">
                <a
                  href="https://www.linkedin.com/in/ladischenski/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
                  onClick={() => analytics.track('founder_linkedin_clicked', { source: 'about_page' })}
                >
                  <LinkedinIcon className="w-5 h-5" />
                  Connect with me
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Open Source Section */}
        <section className="mb-16">
          <div className="bg-card border border-border rounded-lg p-8">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10 dark:bg-blue-500/20">
                  <CodeIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-bold mb-3">Build With Us</h2>
                <p className="text-muted-foreground mb-4">
                  This project is open source (AGPL-3.0). Transparency is part of the pledge.
                </p>
                <p className="text-muted-foreground mb-4">
                  We're looking for collaborators: developers, designers, researchers, or anyone passionate about clear communication. Share ideas, report issues, contribute code, or just tell us what you think.
                </p>
                <a
                  href="https://github.com/slavochek2/claritypledge"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
                  onClick={() => analytics.track('github_link_clicked', { source: 'about_page' })}
                >
                  <CodeIcon className="w-5 h-5" />
                  View on GitHub
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Contact Form Section */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/10 dark:bg-blue-500/20">
              <MailIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-xl font-bold">Get in Touch</h2>
          </div>

          {isSubmitted ? (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-8 text-center">
              <CheckCircleIcon className="w-12 h-12 text-green-600 dark:text-green-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Message Sent</h3>
              <p className="text-muted-foreground">
                Thanks for reaching out. I'll respond soon.
              </p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg p-8">
              <p className="text-muted-foreground mb-6">
                Have a question, want to collaborate, or just want to talk about clear communication? I'd love to hear from you.
              </p>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-2">
                    Email
                  </label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="your@email.com"
                    className="w-full"
                  />
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium mb-2">
                    Message
                  </label>
                  <Textarea
                    id="message"
                    name="message"
                    required
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="What's on your mind?"
                    className="w-full min-h-[120px]"
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={isSubmitting}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold"
                >
                  {isSubmitting ? "Sending..." : "Send Message"}
                </Button>
              </form>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
