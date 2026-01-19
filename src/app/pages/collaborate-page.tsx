/**
 * @file collaborate-page.tsx
 * @description P62: Collaboration interest form.
 * Public page where anyone can express interest in contributing.
 * Uses Web3Forms for form submission (same pattern as About page).
 */
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { SEO } from "@/app/components/seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircleIcon } from "lucide-react";
import { analytics } from "@/lib/mixpanel";
import { useAuth } from "@/auth";

const INTEREST_OPTIONS = [
  { id: "host-event", label: "Hosting an event" },
  { id: "contribute-code", label: "Contributing code or design" },
  { id: "share-feedback", label: "Sharing feedback or ideas" },
  { id: "something-else", label: "Something else" },
] as const;

type InterestId = typeof INTEREST_OPTIONS[number]["id"];

export function CollaboratePage() {
  const { user, isLoading: authLoading } = useAuth();
  const hasTrackedPageView = useRef(false);

  const [selectedInterests, setSelectedInterests] = useState<Set<InterestId>>(new Set());
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-fill email if logged in
  useEffect(() => {
    if (user?.email && !email) {
      setEmail(user.email);
    }
  }, [user, email]);

  // Track page view (once, after auth loads)
  useEffect(() => {
    if (!authLoading && !hasTrackedPageView.current) {
      hasTrackedPageView.current = true;
      analytics.track('collaborate_page_viewed', {
        referrer: document.referrer || 'direct',
        is_logged_in: !!user,
      });
    }
  }, [authLoading, user]);

  const handleInterestChange = (interestId: InterestId, checked: boolean) => {
    const newInterests = new Set(selectedInterests);
    if (checked) {
      newInterests.add(interestId);
    } else {
      newInterests.delete(interestId);
    }
    setSelectedInterests(newInterests);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedInterests.size === 0) {
      toast.error("Please select at least one interest.");
      return;
    }

    setIsSubmitting(true);

    const interestLabels = Array.from(selectedInterests).map(
      (id) => INTEREST_OPTIONS.find((opt) => opt.id === id)?.label || id
    );

    analytics.track('collaborate_form_submitted', {
      interests: interestLabels,
      has_message: message.trim().length > 0,
      is_logged_in: !!user,
    });

    try {
      const formPayload = new FormData();
      formPayload.append("access_key", "5c88ffaa-4e5a-4c82-9c73-e7fb0ad3ad01");
      formPayload.append("email", email);
      formPayload.append("subject", "Clarity Pledge - Collaboration Interest");
      formPayload.append("from_name", "Clarity Pledge - Collaborate Page");
      formPayload.append("interests", interestLabels.join(", "));
      if (message.trim()) {
        formPayload.append("message", message);
      }

      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        body: formPayload,
      });

      const data = await response.json();

      if (data.success) {
        analytics.track('collaborate_form_success');
        setIsSubmitted(true);
        setSelectedInterests(new Set());
        setMessage("");
      } else {
        analytics.track('collaborate_form_error', { reason: 'api_rejected' });
        toast.error("There was an error submitting the form. Please try again later.");
      }
    } catch (error) {
      console.error("Form submission error:", error);
      analytics.track('collaborate_form_error', { reason: 'network_error' });
      toast.error("There was an error submitting the form. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen py-20 px-4">
      <SEO
        title="Co-create"
        description="Join the Clarity Pledge community. Host events, contribute code, share ideas, or help us build better communication tools."
        url="/collaborate"
      />
      <div className="container mx-auto max-w-2xl">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            Co-create With Us
          </h1>
          <p className="text-xl text-muted-foreground">
            Clarity Pledge is{" "}
            <a
              href="https://github.com/slavochek2/claritypledge"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
              onClick={() => analytics.track('github_link_clicked', { source: 'collaborate_page' })}
            >
              open source
            </a>
            . We're building this together.
          </p>
        </div>

        {isSubmitted ? (
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-8 text-center">
            <CheckCircleIcon className="w-12 h-12 text-green-600 dark:text-green-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Thanks for your interest!</h2>
            <p className="text-muted-foreground mb-4">
              We'll be in touch soon to explore how we can work together.
            </p>
            <Button
              variant="outline"
              onClick={() => setIsSubmitted(false)}
            >
              Submit another response
            </Button>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Interests */}
              <fieldset>
                <legend className="block text-sm font-medium mb-3">
                  I'm interested in... <span className="text-red-500">*</span>
                </legend>
                <div className="space-y-3">
                  {INTEREST_OPTIONS.map((option) => (
                    <label
                      key={option.id}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <Checkbox
                        id={option.id}
                        checked={selectedInterests.has(option.id)}
                        onCheckedChange={(checked) =>
                          handleInterestChange(option.id, checked === true)
                        }
                      />
                      <span className="text-base">{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2">
                  Email <span className="text-red-500">*</span>
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full"
                />
              </div>

              {/* Message */}
              <div>
                <label htmlFor="message" className="block text-sm font-medium mb-2">
                  Message <span className="text-muted-foreground">(optional)</span>
                </label>
                <Textarea
                  id="message"
                  name="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us more about what you'd like to work on..."
                  className="w-full min-h-[100px]"
                />
              </div>

              {/* Submit */}
              <Button
                type="submit"
                size="lg"
                disabled={isSubmitting}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold"
              >
                {isSubmitting ? "Sending..." : "Send"}
              </Button>
            </form>

          </div>
        )}
      </div>
    </div>
  );
}
