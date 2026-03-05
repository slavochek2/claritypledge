/**
 * @file terms-of-service-page.tsx
 * @description Terms of Service page for The Clarity Pledge.
 * Outlines the rules and expectations for using the platform.
 */
import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";
import { ScrollTextIcon } from "lucide-react";
import { COPY } from "@/app/content/copy";
import { SEO } from "@/app/components/seo";
import tosContent from "@/app/content/tos.md?raw";

const mdComponents: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  h2: ({ children }) => (
    <h2 className="text-2xl font-bold mb-4">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-xl font-semibold mt-6 mb-3">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-muted-foreground leading-relaxed">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside space-y-2 text-muted-foreground">
      {children}
    </ul>
  ),
  strong: ({ children }) => (
    <strong className="text-foreground">{children}</strong>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-blue-600 dark:text-blue-400 hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
};

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
            <ReactMarkdown components={mdComponents}>
              {tosContent}
            </ReactMarkdown>

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
