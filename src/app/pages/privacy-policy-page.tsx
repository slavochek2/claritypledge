/**
 * @file privacy-policy-page.tsx
 * @description Privacy Policy page for The Clarity Pledge.
 * Layout + chrome only — the legal text is the committed markdown file
 * src/app/content/privacy.md (P1219, same pattern as tos.md since P474).
 */
import { Link } from "react-router-dom";
import { ShieldCheckIcon } from "lucide-react";
import { COPY } from "@/app/content/copy";
import { SEO } from "@/app/components/seo";
import { renderMarkdownLegal } from "@/lib/markdown";
import privacyContent from "@/app/content/privacy.md?raw";

// Content is from a committed .md file in the repo — trusted, no XSS risk
const privacyHtml = renderMarkdownLegal(privacyContent);

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

          {/* Content — prose classes handle h2/h3/p/ul/table/a styling */}
          <div className="prose prose-lg dark:prose-invert max-w-none space-y-8
            prose-h2:text-2xl prose-h2:font-bold prose-h2:mb-4
            prose-h3:text-xl prose-h3:font-semibold prose-h3:mt-6 prose-h3:mb-3
            prose-p:text-muted-foreground prose-p:leading-relaxed
            prose-ul:list-disc prose-ul:list-inside prose-ul:space-y-2 prose-ul:text-muted-foreground
            prose-strong:text-foreground
            prose-table:text-sm prose-td:align-top prose-th:text-left
            prose-a:text-blue-600 dark:prose-a:text-blue-400 hover:prose-a:underline
          ">
            {/* Tables (processor list) can exceed 375px — scroll them, never the page */}
            <div className="overflow-x-auto">
              {/* Trusted content: committed privacy.md file, not user input */}
              <div dangerouslySetInnerHTML={{ __html: privacyHtml }} />
            </div>

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
