/**
 * @file services-page.tsx
 * @description This page is a personal promotional page for the author, Slava.
 * It's not directly related to the pledge itself, but it's linked from the main application.
 * The page advertises a "Cognitive Clarity Audit" service,
 * explaining what it is, how it works, and providing a contact form for interested visitors.
 * Its purpose is to leverage the traffic and credibility of the pledge application
 * to generate leads for the author's consulting services.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  BrainCircuitIcon, 
  CheckCircleIcon, 
  LinkedinIcon
} from "lucide-react";

export function ServicesPage() {
  const [formData, setFormData] = useState({
    email: "",
    bottleneck: "",
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
      formPayload.append("challenge", formData.bottleneck);
      formPayload.append("subject", "New Cognitive Clarity Audit Request");
      formPayload.append("from_name", "Clarity Pledge - Audit Request");

      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        body: formPayload,
      });

      const data = await response.json();

      if (data.success) {
        setIsSubmitted(true);
        setFormData({
          email: "",
          bottleneck: "",
        });
      } else {
        alert("There was an error. Please email slavochek@googlemail.com directly.");
      }
    } catch (error) {
      console.error("Form submission error:", error);
      alert("There was an error. Please email slavochek@googlemail.com directly.");
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
      <div className="container mx-auto max-w-4xl">
        {/* Hero Section */}
        <div className="text-center mb-12 space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 dark:bg-blue-500/20 mb-4">
            <BrainCircuitIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold">
            Cognitive Clarity Audit
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Stress-test your thinking. Find logic gaps in your strategy.
          </p>
          <p className="text-sm text-muted-foreground">
            Pay what it's worth after
          </p>
        </div>

        {/* Social Proof */}
        <div className="mb-12 bg-card border border-border rounded-lg p-6">
          <div className="max-w-2xl mx-auto">
            <p className="text-muted-foreground italic text-center">
              "The session helped me see the gap between what I thought I was solving and what I was actually solving. That clarity alone was worth it."
            </p>
            <p className="text-sm text-center mt-3 text-muted-foreground">
              — Early beta participant
            </p>
          </div>
        </div>

        {/* How It Works - Simplified */}
        <div className="mb-12">
          <div className="max-w-xl mx-auto space-y-3 text-center">
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">1.</span> Fill out pre-work questionnaire
            </p>
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">2.</span> 75-minute session to stress-test your logic
            </p>
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">3.</span> Receive decision map PDF within 24 hours
            </p>
          </div>
        </div>

        {/* Contact Form */}
        <div className="max-w-xl mx-auto mb-16">
          {isSubmitted ? (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-8 text-center">
              <CheckCircleIcon className="w-12 h-12 text-green-600 dark:text-green-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Request Received</h3>
              <p className="text-muted-foreground">
                I'll reach out within 24 hours to schedule.
              </p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg p-8">
              <h2 className="text-xl font-bold mb-2 text-center">
                Book an Audit
              </h2>
              <p className="text-sm text-muted-foreground text-center mb-6">
                No upfront payment. Pay what it's worth after.
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
                  <label htmlFor="bottleneck" className="block text-sm font-medium mb-2">
                    Your strategic challenge
                  </label>
                  <Textarea
                    id="bottleneck"
                    name="bottleneck"
                    required
                    value={formData.bottleneck}
                    onChange={handleChange}
                    placeholder="What decision or bottleneck are you facing?"
                    className="w-full min-h-[100px]"
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={isSubmitting}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold"
                >
                  {isSubmitting ? "Sending..." : "Book Audit"}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  You'll receive a pre-work questionnaire after booking
                </p>
              </form>
            </div>
          )}
        </div>

        {/* About Section - Minimal */}
        <div className="border-t border-border pt-12">
          <div className="text-center space-y-4">
            <h3 className="text-lg font-semibold">About</h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              This service is offered through 22minds—a practice for cognitive clarity training and consulting.
            </p>
            <a
              href="https://www.linkedin.com/in/ladischenski/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline text-sm"
            >
              <LinkedinIcon className="w-4 h-4" />
              Vyacheslav Ladischenski on LinkedIn
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

