/**
 * @file privacy-policy-page.tsx
 * @description Privacy Policy page for The Clarity Pledge.
 * Explains what data is collected, how it's used, and user rights.
 */
import { Link } from "react-router-dom";
import { ShieldCheckIcon } from "lucide-react";
import { COPY } from "@/app/content/copy";

export function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen py-20 px-4">
      <div className="container mx-auto max-w-3xl">
        {/* Header */}
        <div className="text-center mb-12 space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 dark:bg-blue-500/20 mb-4">
            <ShieldCheckIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-4xl font-bold">Privacy Policy</h1>
          <p className="text-muted-foreground">
            Last updated: {COPY.LEGAL_LAST_UPDATED}
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-lg dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold mb-4">Overview</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Clarity Pledge ("we," "us," or "our") is committed to protecting your privacy.
              This policy explains what information we collect, how we use it, and your rights
              regarding your data.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Information We Collect</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              When you sign the Clarity Pledge, we collect:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Name</strong> — displayed on your public pledge profile</li>
              <li><strong className="text-foreground">Email address</strong> — used for authentication via magic link (never displayed publicly)</li>
              <li><strong className="text-foreground">Professional role</strong> (optional) — displayed on your profile</li>
              <li><strong className="text-foreground">LinkedIn URL</strong> (optional) — linked from your profile for verification</li>
              <li><strong className="text-foreground">Reason for signing</strong> (optional) — displayed on your profile</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              When others endorse your pledge, we collect:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Witness name</strong> — displayed on your profile</li>
              <li><strong className="text-foreground">Witness LinkedIn URL</strong> (optional) — for verification purposes</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Live Meeting Data</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              When you participate in a Live Meeting (Clarity Session), we collect:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Session information</strong> — Session code, participant names, timestamps</li>
              <li><strong className="text-foreground">Audio recordings</strong> — Voice recordings during understanding exercises (stored securely in Google Cloud)</li>
              <li><strong className="text-foreground">Session content</strong> — Ideas shared, paraphrases, ratings, and feedback</li>
              <li><strong className="text-foreground">Technical data</strong> — Device type, connection quality for troubleshooting</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              Audio recordings and session data may be used to improve our AI/ML models for better
              understanding verification. By participating in a Live Meeting, you consent to this usage.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">AI & Machine Learning</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We may use anonymized and aggregated data from your interactions, including:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Audio recordings from Live Meetings</li>
              <li>Session transcripts and understanding ratings</li>
              <li>Feature usage patterns</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              This data helps us improve our AI models to better facilitate clear communication
              and understanding verification. We do not sell this data. Personal identifiers are
              removed before ML training.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-4">
              You can request deletion of your data at any time by contacting{" "}
              <span className="text-blue-600 dark:text-blue-400">
                privacy AT claritypledge DOT com
              </span>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Public profile</strong> — Your name, role, reason, and LinkedIn URL appear on your public pledge page</li>
              <li><strong className="text-foreground">Authentication</strong> — We use your email to send magic links for secure, passwordless login</li>
              <li><strong className="text-foreground">Shareable certificate</strong> — We generate a certificate image you can share on social media</li>
              <li><strong className="text-foreground">Pledgers directory</strong> — Verified signatories may appear in our public directory</li>
              <li><strong className="text-foreground">Service improvement</strong> — Anonymized data helps us improve our AI/ML features</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Data Storage & Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              Your data is stored securely using{" "}
              <a
                href="https://supabase.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Supabase
              </a>
              , a trusted cloud database provider. We implement row-level security policies
              to ensure users can only access their own private data. Your email is never
              exposed publicly. Audio recordings are encrypted at rest in Google Cloud Storage.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Third-Party Services</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We use the following third-party services:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Supabase</strong> — Authentication, database hosting, and real-time session sync</li>
              <li><strong className="text-foreground">Vercel</strong> — Website hosting</li>
              <li><strong className="text-foreground">Sentry</strong> — Error tracking and performance monitoring. Collects stack traces and masked session replays when errors occur. Text is masked and media blocked. No personal data sent by default.</li>
              <li><strong className="text-foreground">Mixpanel</strong> — Product analytics to understand feature usage. Tracks events like page views, feature interactions, and user journeys. Data retained per Mixpanel's policy.</li>
              <li><strong className="text-foreground">LogRocket</strong> — Session replay for debugging user issues. Records screen interactions (clicks, navigation) with text masking enabled. Production only.</li>
              <li><strong className="text-foreground">Google Cloud Storage</strong> — Secure storage for audio recordings from Live Meetings. Files encrypted at rest.</li>
              <li><strong className="text-foreground">Web3Forms</strong> — Processes contact form submissions on our About page. Receives only the information you submit.</li>
              <li><strong className="text-foreground">Google Fonts</strong> — Serves typography. Standard font requests, no tracking.</li>
              <li><strong className="text-foreground">Gravatar</strong> — Optional avatar lookup using email hash. No email shared, only hash.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Cookies & Local Storage</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We use:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Authentication cookies</strong> — Required for login sessions (Supabase)</li>
              <li><strong className="text-foreground">Local storage</strong> — Stores session ID and display name for convenience</li>
              <li><strong className="text-foreground">Session storage</strong> — Temporary data during signup or meeting participation</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              We do NOT use advertising cookies or cross-site tracking.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You have the right to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Access</strong> — View all data we hold about you</li>
              <li><strong className="text-foreground">Update</strong> — Modify your profile information at any time</li>
              <li><strong className="text-foreground">Delete</strong> — Request complete removal of your account and data</li>
              <li><strong className="text-foreground">Export</strong> — Request a copy of your data</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              To exercise any of these rights, contact us at{" "}
              <span className="text-blue-600 dark:text-blue-400">
                privacy AT claritypledge DOT com
              </span>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              We retain your data for as long as your account is active. If you request
              deletion, we will remove your identifiable data within 30 days, except where we are
              legally required to retain it. Note that anonymized data already incorporated
              into our ML models may persist, though it cannot be traced back to you.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this policy from time to time. If we make significant changes,
              we will notify you via email or a prominent notice on our website. Continued
              use of the platform after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              Questions about this policy? Contact us at{" "}
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
