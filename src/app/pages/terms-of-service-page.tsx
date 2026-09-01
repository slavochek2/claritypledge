/**
 * @file terms-of-service-page.tsx
 * @description Terms of Service page for The Clarity Pledge.
 * Outlines the rules and expectations for using the platform.
 */
import { Link } from "react-router-dom";
import { ScrollTextIcon } from "lucide-react";
import { COPY } from "@/app/content/copy";
import { SEO } from "@/app/components/seo";
import { renderMarkdownLegal } from "@/lib/markdown";
import tosContent from "@/app/content/tos.md?raw";

// Content is from a committed .md file in the repo — trusted, no XSS risk
const tosHtml = renderMarkdownLegal(tosContent);

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

          {/* Content — prose classes handle h2/h3/p/ul/a styling */}
          <div className="prose prose-lg dark:prose-invert max-w-none space-y-8
            prose-h2:text-2xl prose-h2:font-bold prose-h2:mb-4
            prose-h3:text-xl prose-h3:font-semibold prose-h3:mt-6 prose-h3:mb-3
            prose-p:text-muted-foreground prose-p:leading-relaxed
            prose-ul:list-disc prose-ul:list-inside prose-ul:space-y-2 prose-ul:text-muted-foreground
            prose-strong:text-foreground
            prose-a:text-blue-600 dark:prose-a:text-blue-400 hover:prose-a:underline
          ">
            {/* Trusted content: committed tos.md file, not user input */}
            <div dangerouslySetInnerHTML={{ __html: tosHtml }} />

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
