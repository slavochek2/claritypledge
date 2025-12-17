/**
 * @file terms-of-service-page.tsx
 * @description Terms of Service page for The Clarity Pledge.
 * Outlines the rules and expectations for using the platform.
 */
import { Link } from "react-router-dom";
import { ScrollTextIcon } from "lucide-react";

export function TermsOfServicePage() {
  return (
    <div className="min-h-screen py-20 px-4">
      <div className="container mx-auto max-w-3xl">
        {/* Header */}
        <div className="text-center mb-12 space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 dark:bg-blue-500/20 mb-4">
            <ScrollTextIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-4xl font-bold">Terms of Service</h1>
          <p className="text-muted-foreground">
            Last updated: December 2025
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-lg dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold mb-4">Welcome to The Clarity Pledge</h2>
            <p className="text-muted-foreground leading-relaxed">
              By signing The Clarity Pledge or using our website, you agree to these terms.
              Please read them carefully. If you don't agree with these terms, please don't
              use our service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">What Is The Clarity Pledge?</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Clarity Pledge is a public commitment platform where professionals pledge
              to communicate clearly, honestly, and without unnecessary jargon. When you sign,
              you receive a public profile page and a shareable certificate that demonstrates
              your commitment.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Your Responsibilities</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              By signing the pledge, you agree to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Provide accurate information</strong> — Your name, role, and LinkedIn profile should be truthful</li>
              <li><strong className="text-foreground">Use your real identity</strong> — The pledge is a professional commitment tied to your reputation</li>
              <li><strong className="text-foreground">Respect the community</strong> — Don't use the platform to spam, harass, or mislead others</li>
              <li><strong className="text-foreground">Honor the spirit of the pledge</strong> — While we can't enforce understanding, we expect good faith effort</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Public Visibility</h2>
            <p className="text-muted-foreground leading-relaxed">
              By signing the pledge, you understand and agree that:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-4">
              <li>Your name, role, and reason for signing will be <strong className="text-foreground">publicly visible</strong></li>
              <li>Your profile may appear in our <strong className="text-foreground">Champions directory</strong></li>
              <li>Others can <strong className="text-foreground">endorse</strong> your commitment as witnesses</li>
              <li>Your profile URL can be <strong className="text-foreground">shared</strong> on social media and professional networks</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              Your email address is <strong className="text-foreground">never displayed publicly</strong> and is only used for authentication.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Endorsements (Witnesses)</h2>
            <p className="text-muted-foreground leading-relaxed">
              The witness feature allows colleagues to publicly endorse your commitment to understanding.
              By inviting witnesses or accepting endorsements, you understand that:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-4">
              <li>Witness names appear publicly on your profile</li>
              <li>Witnesses vouch for your professional commitment to clear communication</li>
              <li>You should only invite people who genuinely know your work</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Account Termination</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We reserve the right to remove profiles that:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Contain false or misleading information</li>
              <li>Impersonate another person</li>
              <li>Are used for spam or promotional abuse</li>
              <li>Violate these terms or applicable laws</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              You may also request to delete your account at any time by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Clarity Pledge name, logo, and website design are our property. Your profile
              content (name, role, reason) remains yours. By posting content, you grant us a
              license to display it publicly as part of the platform.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Disclaimer</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Clarity Pledge is provided "as is" without warranties of any kind. We don't
              guarantee that signing the pledge will improve your communication skills, advance
              your career, or produce any specific outcome. The pledge is a symbolic commitment,
              not a certification or qualification.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              To the maximum extent permitted by law, we are not liable for any indirect,
              incidental, or consequential damages arising from your use of the platform.
              This includes, but is not limited to, loss of reputation, business opportunities,
              or data.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Changes to These Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update these terms from time to time. If we make significant changes,
              we'll notify you via email or a notice on our website. Continued use of the
              platform after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              Questions about these terms? Contact us at{" "}
              <span className="text-blue-600 dark:text-blue-400">
                privacy AT claritypledge DOT com
              </span>
            </p>
          </section>

          {/* Back link */}
          <div className="pt-8 border-t border-border">
            <Link
              to="/"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
