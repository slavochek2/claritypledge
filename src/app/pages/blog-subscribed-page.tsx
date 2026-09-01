/**
 * @file blog-subscribed-page.tsx
 * @description Thank-you page after subscribing to the ClarityPledge blog newsletter.
 * Route: /blog-subscribed
 */

import { MailIcon, BookOpenIcon, ArrowRightIcon } from "lucide-react";
import { SEO } from "@/app/components/seo";
import { Button } from "@/components/ui/button";

export function BlogSubscribedPage() {
  return (
    <>
      <SEO
        title="You're subscribed — ClarityPledge Blog"
        description="Check your inbox to confirm your subscription."
        noIndex
      />
      <div className="container mx-auto px-4 py-16 sm:py-24 max-w-2xl">
        <div className="text-center">
          <div className="mb-8 flex justify-center">
            <div className="h-24 w-24 bg-green-100 rounded-full flex items-center justify-center">
              <MailIcon className="h-12 w-12 text-green-600" />
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold mb-4">Check your inbox</h1>

          <p className="text-lg text-muted-foreground mb-2">
            Click the confirmation link we sent to finish subscribing.
          </p>

          <p className="text-sm text-muted-foreground/60 mb-12">
            Already a member? We sent a sign-in link instead.
          </p>

          <Button asChild className="min-h-11 px-8 text-base bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30">
            <a href="https://claritypledge.com/manifesto">
              <BookOpenIcon className="h-5 w-5" />
              Read the Manifesto
            </a>
          </Button>

          <div className="mt-6">
            <Button asChild variant="ghost" size="sm">
              <a href="https://blog.claritypledge.com/">
                <ArrowRightIcon className="h-4 w-4" />
                Back to Blog
              </a>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
