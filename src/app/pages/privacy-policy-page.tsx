/**
 * @file privacy-policy-page.tsx
 * @description Privacy Policy page for The Understanding Pledge.
 * Explains what data is collected, how it's used, and user rights.
 */
import { Link } from "react-router-dom";
import { ShieldCheckIcon } from "lucide-react";

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
            Last updated: December 2025
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-lg dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold mb-4">Overview</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Understanding Pledge ("we," "us," or "our") is committed to protecting your privacy.
              This policy explains what information we collect, how we use it, and your rights
              regarding your data.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Information We Collect</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              When you sign the Understanding Pledge, we collect:
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
            <h2 className="text-2xl font-bold mb-4">How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Public profile</strong> — Your name, role, reason, and LinkedIn URL appear on your public pledge page</li>
              <li><strong className="text-foreground">Authentication</strong> — We use your email to send magic links for secure, passwordless login</li>
              <li><strong className="text-foreground">Shareable certificate</strong> — We generate a certificate image you can share on social media</li>
              <li><strong className="text-foreground">Champions directory</strong> — Verified signatories may appear in our public directory</li>
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
              exposed publicly.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Third-Party Services</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We use the following third-party services:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong className="text-foreground">Supabase</strong> — Authentication and database hosting</li>
              <li><strong className="text-foreground">Vercel</strong> — Website hosting</li>
              <li><strong className="text-foreground">Sentry</strong> — Error tracking (anonymized, no personal data)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use minimal cookies required for authentication sessions. We do not use
              tracking cookies, advertising cookies, or third-party analytics that track
              you across websites.
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
                contact [at] understandingpledge [dot] com
              </span>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              We retain your data for as long as your account is active. If you request
              deletion, we will remove your data within 30 days, except where we are
              legally required to retain it.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this policy from time to time. If we make significant changes,
              we will notify you via email or a prominent notice on our website.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              Questions about this policy? Contact us at{" "}
              <span className="text-blue-600 dark:text-blue-400">
                contact [at] understandingpledge [dot] com
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
