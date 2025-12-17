/**
 * @file about-page.tsx
 * @description About page for the Understanding Pledge movement.
 * Contains the founder's story, open source information, and a contact form.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircleIcon,
  LinkedinIcon,
  CodeIcon,
  MailIcon,
} from "lucide-react";

export function AboutPage() {
  const [formData, setFormData] = useState({
    email: "",
    message: "",
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formPayload = new FormData();
      formPayload.append("access_key", "5c88ffaa-4e5a-4c82-9c73-e7fb0ad3ad01");
      formPayload.append("email", formData.email);
      formPayload.append("message", formData.message);
      formPayload.append("subject", "Understanding Pledge - Contact");
      formPayload.append("from_name", "Understanding Pledge - About Page");

      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        body: formPayload,
      });

      const data = await response.json();

      if (data.success) {
        setIsSubmitted(true);
        setFormData({
          email: "",
          message: "",
        });
      } else {
        alert("There was an error submitting the form. Please try again later.");
      }
    } catch (error) {
      console.error("Form submission error:", error);
      alert("There was an error submitting the form. Please try again later.");
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
      <div className="container mx-auto max-w-3xl">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            About the Understanding Pledge
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
                Before the Understanding Pledge, I spent years in B2B sales and as a founder: raising over $392k for a SaaS startup, parting ways with multiple co-founders, and coaching teams on how to close deals instead of just talk about them. Again and again, the most expensive mistakes came from misalignment, vague promises, and conversations where everyone nodded but nobody meant the same thing.
              </p>

              <p className="text-lg leading-relaxed text-muted-foreground">
                But for me, this wasn't just a business problem. It was personal. Growing up between cultures—born in Ukraine, raised in Germany—I never had the luxury of assumed understanding. Combined with being neurodivergent, I was wired to need explicit communication to function, while the corporate world seemed to thrive on strategic ambiguity.
              </p>

              <p className="text-lg leading-relaxed text-muted-foreground">
                This created a constant, painful friction I now call{" "}
                <Link
                  to="/article"
                  className="font-semibold text-foreground hover:text-blue-600 dark:hover:text-blue-400 underline underline-offset-4"
                >
                  Intellectual Moral Injury
                </Link>
                .
              </p>

              <p className="text-lg leading-relaxed text-muted-foreground">
                The deep dissonance of being forced to pretend that nonsense makes sense to protect a paycheck. I watched good people burn out, trapped in collective hallucinations, and realized the cost of ambiguity wasn't just financial—it was human.
              </p>

              <p className="text-lg leading-relaxed text-muted-foreground">
                The Understanding Pledge started as my survival mechanism. A practical fix. I began documenting every painful mistake—around hiring, partners, and trust—and turning them into simple, testable rules. Influenced by tools like Ray Dalio's <em>Principles</em>, I refined pages of notes into the core commitments that now form the pledge.
              </p>

              <p className="text-lg leading-relaxed text-foreground font-medium">
                If you've ever felt that physical flinch of nodding along to a lie, or paid a high price for miscommunication in sales, hiring, or co-founder decisions—this was built for you. It's for anyone who cares more about what is <em>true</em> than what is polite.
              </p>

              {/* LinkedIn Link */}
              <div className="pt-4">
                <a
                  href="https://www.linkedin.com/in/ladischenski/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <LinkedinIcon className="w-5 h-5" />
                  Vyacheslav Ladischenski on LinkedIn
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
                <h2 className="text-xl font-bold mb-3">Built in the Open</h2>
                <p className="text-muted-foreground mb-4">
                  This project is open source under the AGPL-3.0 license. We're preparing to make the repository public—transparency is part of the pledge.
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Want early access?</span>{" "}
                  If you're a developer interested in contributing before the public launch, reach out below and I'll add you to the repo.
                </p>
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
