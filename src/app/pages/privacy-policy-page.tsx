/**
 * @file privacy-policy-page.tsx
 * @description Privacy Policy page for The Clarity Pledge.
 * Explains what data is collected, how it's used, and user rights.
 */
import { Link } from "react-router-dom";
import { ShieldCheckIcon } from "lucide-react";
import { COPY } from "@/app/content/copy";
import { SEO } from "@/app/components/seo";

export function PrivacyPolicyPage() {
  return (
    <>
      <SEO
        title="Privacy Policy"
        description="Learn how Clarity Pledge protects your data. We explain what information we collect, how we use it, and your GDPR rights."
        url="/privacy-policy"
      />
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
              The Clarity Pledge is operated by TechSalesBox OÜ (registry code 14832496),
              an Estonian company ("we," "us," or "our"). We are committed to protecting your privacy.
              This policy explains what information we collect, how we use it, and your rights
              regarding your data.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Data Controller</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              TechSalesBox OÜ acts as the data controller for all personal data collected through
              The Clarity Pledge platform.
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Legal Entity:</strong> TechSalesBox OÜ</li>
              <li><strong className="text-foreground">Registry Code:</strong> 14832496</li>
              <li><strong className="text-foreground">Address:</strong> Harju maakond, Kuusalu vald, Pudisoo küla, Männimäe/1, 74626</li>
              <li><strong className="text-foreground">Data Protection Contact:</strong>{" "}
                <span className="text-blue-600 dark:text-blue-400">
                  privacy AT claritypledge DOT com
                </span>
              </li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              As a small-scale operation, we are not required to appoint a formal Data Protection
              Officer (DPO) under GDPR Article 37. However, you can contact us at the email above
              for any data protection inquiries, GDPR requests, or privacy concerns.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Legal Basis for Processing</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We process your personal data under the following legal grounds as required by GDPR Article 6:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Contractual necessity (Art. 6(1)(b))</strong> — To provide the pledge service, authentication,
                public profile features, and Live Meeting functionality you requested.</li>
              <li><strong className="text-foreground">Consent (Art. 6(1)(a) and Art. 9(2)(a))</strong> — For voice recording and ML training.
                You will be asked for explicit consent via a separate dialog before any recording starts.
                This consent is separate from accepting these Terms of Service.</li>
              <li><strong className="text-foreground">Legitimate interest (Art. 6(1)(f))</strong> — For error tracking (Sentry), analytics and
                session replay (Mixpanel), and service improvement, where our business interests do not
                override your fundamental rights and freedoms. You can object to this processing at any time.</li>
            </ul>
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
              understanding verification. Before any recording starts, you will be informed and asked
              to agree by joining the session. You can request deletion of your recordings anytime.
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
              and understanding verification. We do not sell this data.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-4">
              <strong className="text-foreground">Anonymization process:</strong> Before using data for ML training, we remove all personal
              identifiers including names, email addresses, user IDs, and IP addresses. This makes
              it impossible to trace the data back to you. Once anonymized, this data is no longer
              considered "personal data" under GDPR and cannot be deleted via data deletion requests.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-4">
              You can request deletion of your identifiable data at any time by contacting{" "}
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
              <li><strong className="text-foreground">Mixpanel</strong> — Product analytics and session replay. Tracks events like page views, feature interactions, and user journeys, and records screen interactions (clicks, scrolling, navigation) with text masking enabled. Production only. Data retained per Mixpanel's policy.</li>
              <li><strong className="text-foreground">Google Cloud Storage</strong> — Secure storage for audio recordings from Live Meetings. Files encrypted at rest.</li>
              <li><strong className="text-foreground">Web3Forms</strong> — Processes contact form submissions on our About page. Receives only the information you submit.</li>
              <li><strong className="text-foreground">Google Fonts</strong> — Serves typography. Standard font requests, no tracking.</li>
              <li><strong className="text-foreground">Gravatar</strong> — Optional avatar lookup using email hash. No email shared, only hash.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">International Data Transfers</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Some of our service providers may transfer your data outside the European Economic Area (EEA).
              When this occurs, we ensure appropriate safeguards are in place as required by GDPR Articles 44-46:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Standard Contractual Clauses (SCCs)</strong> — Approved by the European Commission for transfers
                to countries without adequacy decisions</li>
              <li><strong className="text-foreground">Adequacy decisions</strong> — We rely on EU Commission adequacy decisions where applicable</li>
              <li><strong className="text-foreground">Data Processing Agreements</strong> — All processors have signed DPAs covering GDPR obligations</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              <strong className="text-foreground">Primary data storage:</strong> TechSalesBox OÜ is based in Estonia (EU), and we store all primary
              data (profiles, pledges, witnesses) within the EU via Supabase EU regions.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-4">
              <strong className="text-foreground">Services involving non-EU transfers:</strong>
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-6">
              <li>Google Cloud Storage (audio recordings) — Uses SCCs, data stored in EU regions where possible</li>
              <li>Mixpanel (analytics and session replay) — Uses SCCs for data transfer</li>
              <li>Sentry (error tracking) — Uses SCCs for data transfer</li>
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
              Under the General Data Protection Regulation (GDPR), you have the following rights:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Access (Art. 15)</strong> — Request a copy of all personal data we hold about you</li>
              <li><strong className="text-foreground">Rectification (Art. 16)</strong> — Update or correct your profile information at any time</li>
              <li><strong className="text-foreground">Erasure (Art. 17)</strong> — Request complete removal of your account and identifiable data
                ("right to be forgotten")</li>
              <li><strong className="text-foreground">Data Portability (Art. 20)</strong> — Export your data in a machine-readable format (JSON)</li>
              <li><strong className="text-foreground">Object (Art. 21)</strong> — Stop processing your data for specific purposes (e.g., analytics,
                marketing) without deleting your entire account</li>
              <li><strong className="text-foreground">Restrict Processing (Art. 18)</strong> — Temporarily limit how we process your data while
                we verify accuracy or address your concerns</li>
              <li><strong className="text-foreground">Withdraw Consent (Art. 7(3))</strong> — If processing is based on consent, you can withdraw
                it at any time (e.g., opt out of ML training while keeping your account)</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              <strong className="text-foreground">Important:</strong> Some rights have limitations. For example:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-6">
              <li>Anonymized data already incorporated into ML models cannot be removed (it's no longer
                identifiable)</li>
              <li>We may retain certain data for legal compliance (e.g., financial records, audit logs)</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              To exercise any of these rights, contact us at{" "}
              <span className="text-blue-600 dark:text-blue-400">
                privacy AT claritypledge DOT com
              </span>
              . We will respond within 30 days as required by GDPR.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We retain your data only as long as necessary for the purposes outlined in this policy,
              in accordance with GDPR Article 5(1)(e) (storage limitation):
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Profile data</strong> — Retained while your account is active. Deleted within 30 days of
                account closure request.</li>
              <li><strong className="text-foreground">Audio recordings (Live Meetings)</strong> — Retained for 90 days for service improvement,
                then automatically deleted. Exception: Anonymized excerpts used for ML training may
                persist indefinitely, but cannot be traced back to you.</li>
              <li><strong className="text-foreground">Session logs & metadata</strong> — Retained for 12 months for troubleshooting, auditing,
                and service improvement.</li>
              <li><strong className="text-foreground">Error logs (Sentry)</strong> — Retained for 90 days, then automatically deleted.</li>
              <li><strong className="text-foreground">Analytics data (Mixpanel)</strong> — Aggregated and anonymized data retained for up to 5 years
                for trend analysis.</li>
              <li><strong className="text-foreground">Session replays (Mixpanel)</strong> — Retained per Mixpanel's data retention policy.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              You can request early deletion of your data at any time by contacting{" "}
              <span className="text-blue-600 dark:text-blue-400">
                privacy AT claritypledge DOT com
              </span>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Filing a Complaint</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              If you believe we have not handled your personal data correctly or violated your GDPR rights,
              you have the right to lodge a complaint with a supervisory authority under GDPR Article 77.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              <strong className="text-foreground">For EU residents:</strong>
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-6">
              <li><strong className="text-foreground">Estonian Data Protection Inspectorate (Andmekaitse Inspektsioon)</strong> —{" "}
                <a
                  href="https://www.aki.ee/en"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  www.aki.ee/en
                </a>
              </li>
              <li>Or your local supervisory authority in your country of residence</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              You can also contact us directly at{" "}
              <span className="text-blue-600 dark:text-blue-400">
                privacy AT claritypledge DOT com
              </span>
              {" "}to resolve any concerns before filing a complaint.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Automated Decision-Making</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We do not use automated decision-making or profiling that produces legal effects or
              significantly affects you (GDPR Article 22).
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Our AI/ML features are used to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Verify understanding during Live Meetings (with human review)</li>
              <li>Improve transcription and paraphrasing quality</li>
              <li>Analyze usage patterns for service improvement</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              No automated decisions are made about your account status, access, or rights without
              human oversight.
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
    </>
  );
}
