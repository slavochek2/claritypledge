/**
 * @file terms-of-service-page.tsx
 * @description Terms of Service page for The Clarity Pledge.
 * Outlines the rules and expectations for using the platform.
 */
import { Link } from "react-router-dom";
import { ScrollTextIcon } from "lucide-react";
import { COPY } from "@/app/content/copy";
import { SEO } from "@/app/components/seo";

export function TermsOfServicePage() {
  return (
    <>
      <SEO
        title="Terms of Service"
        description="Terms and conditions for using Clarity Pledge. Understand your rights and responsibilities when signing the pledge."
        url="/terms-of-service"
      />
      <div className="min-h-screen py-20 px-4">
      <div className="container mx-auto max-w-3xl">
        {/* Header */}
        <div className="text-center mb-12 space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 dark:bg-blue-500/20 mb-4">
            <ScrollTextIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-4xl font-bold">Terms of Service</h1>
          <p className="text-muted-foreground">
            Last updated: {COPY.LEGAL_LAST_UPDATED}
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-lg dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold mb-4">Welcome to The Clarity Pledge</h2>
            <p className="text-muted-foreground leading-relaxed">
              By signing The Clarity Pledge, joining a Live Meeting, or using our website, you agree to these terms.
              Please read them carefully. If you don't agree with these terms, please don't
              use our service.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-4">
              The Clarity Pledge is operated by TechSalesBox OÜ (registry code 14832496),
              an Estonian limited liability company. These terms constitute a legal agreement
              between you and TechSalesBox OÜ.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">What Is The Clarity Pledge?</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Clarity Pledge is a public commitment platform where professionals pledge
              to communicate clearly, honestly, and without unnecessary jargon. When you sign,
              you receive a public profile page and a shareable certificate that demonstrates
              your commitment. You can also participate in Live Meetings to practice clear
              communication in real-time.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Live Meetings (Clarity Sessions)</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Live Meetings are real-time understanding exercises between two participants.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              <strong className="text-foreground">Important:</strong> Before any recording starts, you will be asked for explicit consent via
              a separate consent dialog. By clicking "Start Recording," you explicitly consent to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Your voice being <strong className="text-foreground">recorded</strong> during understanding exercises</li>
              <li>Session content (ideas, paraphrases, ratings) being <strong className="text-foreground">stored</strong></li>
              <li>Recordings being used to <strong className="text-foreground">improve our AI/ML services</strong> (anonymized)</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              <strong className="text-foreground">This consent is separate from accepting these Terms of Service.</strong> Simply using the
              platform does NOT constitute consent to recording. You must actively consent before
              each session.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-4">
              By participating in Live Meetings, you also agree that:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Other participants can see your <strong className="text-foreground">display name</strong> and hear your voice</li>
              <li>Sessions are <strong className="text-foreground">not end-to-end encrypted</strong></li>
              <li>You are responsible for obtaining consent from anyone whose voice may be captured
                in your environment</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">AI & Machine Learning</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              By using The Clarity Pledge platform, you grant us a non-exclusive, worldwide,
              royalty-free license to use your anonymized interactions (including audio recordings,
              session content, and usage patterns — excluding /chat conversations) to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Train and improve our AI/ML models</li>
              <li>Develop new features for understanding verification</li>
              <li>Conduct research on communication clarity</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              This license survives account deletion for data already incorporated into models,
              though we will delete your identifiable data upon request.
            </p>
            <h3 className="text-xl font-semibold mt-6 mb-3">AI-Assisted Story Creation (/chat)</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              The /chat feature uses Google's Gemini API to help you turn raw experience into a
              first-person story. When you use /chat, the text you type — including interpersonal
              situations and context you share — is sent to Google in real-time for inference. This
              content is not anonymized before transmission. ClarityPledge does not retain your
              /chat conversations server-side.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Google processes this data under their own terms and may also use it for safety and
              service improvement purposes. See{" "}
              <a
                href="https://policies.google.com/privacy"
                className="text-blue-600 dark:text-blue-400 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google's Privacy Policy
              </a>{" "}
              for details. We process this data to provide the /chat feature you've requested
              (Art. 6(1)(b) GDPR).
            </p>
            <p className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Note:</strong> Avoid sharing health, religious,
              or other sensitive personal data in /chat. If you prefer not to share content with
              Google, the platform is fully usable without /chat.
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
            <h2 className="text-2xl font-bold mb-4">Age Requirement</h2>
            <p className="text-muted-foreground leading-relaxed">
              You must be at least 16 years old to use The Clarity Pledge. If you are under 16,
              you may only use this service with verifiable parental or guardian consent as required
              by GDPR Article 8.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-4">
              By using this service, you confirm that you meet this age requirement or have obtained
              appropriate parental consent.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Public Visibility</h2>
            <p className="text-muted-foreground leading-relaxed">
              By signing the pledge, you understand and agree that:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-4">
              <li>Your name, role, and reason for signing will be <strong className="text-foreground">publicly visible</strong></li>
              <li>Your profile may appear in our <strong className="text-foreground">Pledgers directory</strong></li>
              <li>Others can <strong className="text-foreground">endorse</strong> your commitment as witnesses</li>
              <li>Your profile URL can be <strong className="text-foreground">shared</strong> on social media and professional networks</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              Your email address is <strong className="text-foreground">never displayed publicly</strong> and is only used for authentication.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Story Visibility</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Stories you create have three visibility levels, which you control:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Private</strong> — visible only to you</li>
              <li><strong className="text-foreground">Shared</strong> — visible to participants in events you've both RSVPd to</li>
              <li><strong className="text-foreground">Public</strong> — visible to anyone</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              You can change a story's visibility at any time. "Shared" visibility is limited to
              co-attendees of a specific event and is not publicly indexed. We do not change your
              story's visibility without your action. Shared stories can be seen and further shared
              by co-attendees — ClarityPledge does not control what co-attendees do with content
              they access.
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
            <h2 className="text-2xl font-bold mb-4">Clarity Partner Agreements</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You can create a Clarity Partner Agreement with another person — a mutual commitment
              to communicate clearly in your working relationship. When you create an agreement and
              enter your partner's email address, the platform sends them an invitation email
              identifying you as the initiator (sent from agreements@claritypledge.com).
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              By creating an agreement, you confirm that you have a legitimate reason to contact
              this person and are not using the feature to send unsolicited messages.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              We store your partner's email address to deliver the invitation. If they don't
              accept, their email address is deleted when the invitation expires (7 days). Partners
              can request deletion at any time by contacting{" "}
              <span className="text-blue-600 dark:text-blue-400">
                privacy AT claritypledge DOT com
              </span>.
            </p>
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
              license to display it publicly as part of the platform. Audio recordings and
              session content you create are licensed to us for service improvement as described
              in the AI & Machine Learning section above.
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
            <h2 className="text-2xl font-bold mb-4">Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These terms are governed by the laws of Estonia. Any disputes arising from your use
              of The Clarity Pledge shall be resolved under Estonian jurisdiction.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-4">
              For EU consumers, this does not affect your statutory rights under the consumer
              protection laws of your country of residence.
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
    </>
  );
}
