/**
 * @file legal-footer.tsx
 * @description Footer component displaying copyright and links to legal pages.
 * Legal entity disclosure (TechSalesBox OÜ) is in Privacy Policy and Terms of Service.
 */
import { Link } from "react-router-dom";
import { GithubIcon } from "lucide-react";

export function LegalFooter() {
  return (
    <footer className="border-t border-border py-8 mt-16">
      <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
        <p className="mt-2">
          <Link to="/privacy-policy" className="hover:text-blue-600">Privacy Policy</Link>
          {" · "}
          <Link to="/terms-of-service" className="hover:text-blue-600">Terms of Service</Link>
        </p>
        <p className="mt-3">
          <a
            href="https://github.com/slavochek2/claritypledge"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <GithubIcon className="w-3.5 h-3.5" />
            Open Source (AGPL-3.0)
          </a>
        </p>
        <p className="mt-2">
          © 2026 The Clarity Pledge
        </p>
      </div>
    </footer>
  );
}
